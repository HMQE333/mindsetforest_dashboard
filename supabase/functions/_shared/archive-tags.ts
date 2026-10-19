/**
 * The pure half of ai-suggest-tags (mode "learn"): the tag rules, how similar
 * notes and the user's past answers score a tag, what goes to the model, and
 * how everything becomes at most five chips. No imports, so the app's tests
 * load this file as it is (artifacts/app/src/test/archive-tags.test.ts).
 *
 * The block between the "tag rules" markers is a word-for-word copy of the one
 * in artifacts/app/src/lib/archive-tags.ts (an edge function cannot import from
 * the app); the test fails when the two drift.
 */

// ---- tag rules: begin (keep identical in supabase/functions/_shared/archive-tags.ts) ----

/** His eight note types, in the order they are offered. A type is an ordinary tag. */
export const TYPE_TAGS = ["insight", "framework", "quote", "source", "question", "task", "capture", "fragment"] as const;
export type TypeTag = (typeof TYPE_TAGS)[number];

/** Longer than this is a pasted phrase, not a label: not a tag. */
export const MAX_TAG_LENGTH = 64;

const TYPE_SET: ReadonlySet<string> = new Set(TYPE_TAGS);
const LETTER = /\p{L}/u;

export function isTypeTag(tag: string): tag is TypeTag {
  return TYPE_SET.has(tag);
}

/**
 * The tag a raw label stands for, or "" when it is not a tag: no "#", NFC,
 * lowercase, spaces become "-", anything but letters, digits, "-", "_" and "/"
 * dropped, empty folder segments and a trailing "/" dropped. Polish letters
 * stay ("Książki" -> "książki"); "#2" -> "" (no letter).
 */
export function normaliseTag(raw: string): string {
  const t = String(raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{M}\p{N}_/-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .split("/")
    .map((seg) => seg.replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("/");
  return t.length <= MAX_TAG_LENGTH && LETTER.test(t) ? t : "";
}

/** Already a tag in its normal form. */
export function isTag(tag: string): boolean {
  return tag !== "" && normaliseTag(tag) === tag;
}

/** A link as the Links view reads one, plus a bare "www." address. */
const TEXT_URL = /(?:https?:\/\/|\bwww\.)[^\s<>"{}|\\^`[\]]+/giu;
/** An inline #tag (cut out before the text is judged, so "#nauka" never counts as prose). */
const INLINE_TAG_TOKEN = /(^|[\s([{])#[\p{L}\p{M}\p{N}_/-]+/gu;
/** What a captured picture, film or recording ends with. */
const MEDIA_EXT = /\.(?:png|jpe?g|gif|webp|heic|heif|avif|bmp|svg|tiff?|mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|ogg|opus)$/i;
/** A file of his own, named alone on a line. */
const FILE_EXT = /\.(?:png|jpe?g|gif|webp|heic|heif|avif|bmp|svg|tiff?|mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|ogg|opus|pdf|docx?|xlsx?|pptx?|odt|zip|rar|7z|txt|csv|md)$/i;
const LIST_LINE = /^\s*(?:[-*+•▪◦‣–—]\s+|\d{1,3}[.)]\s+|[a-z]\)\s+|\[[ xX]\]\s+|\|.*\|\s*$)/u;
const HEADING_LINE = /^\s*(?:#{1,6}\s+\S.*|[^\n]{1,60}:)\s*$/u;

/** A link to an uploaded file or to a picture, film or recording, not to a page. */
function isFileLink(url: string, marked: boolean): boolean {
  const bare = url.replace(/[)\].,;:!?'"’”]+$/u, "");
  if (marked || /\/storage\/v1\/object\//i.test(bare)) return true;
  const path = bare.replace(/^(?:https?:\/\/|www\.)[^/]*/i, "").replace(/[?#].*$/, "");
  return MEDIA_EXT.test(path);
}

/** A name or a source after a dash: starts with a capital, short, not a sentence or a link. */
function isAttribution(who: string): boolean {
  const s = who.trim().replace(/[.,;]+$/, "");
  if (!/^[\p{Lu}@]/u.test(s) || /https?:\/\//i.test(s) || /[?!:]$/.test(s)) return false;
  return s.length <= 80 && s.split(/\s+/).length <= 10;
}

/** Someone else's words with who said them: "…" — Author, or the words and then a line "— Author". */
function isQuote(text: string, lines: string[]): boolean {
  const inline = /^(?:>\s*)?["“„«‘‚](?<body>[\s\S]{12,}?)["”“»’‘]\s*[,.]?\s*(?:[-–—―~]{1,2})\s*(?<who>[^\n]{2,80})$/u.exec(text);
  if (inline?.groups && isAttribution(inline.groups.who)) return true;
  if (lines.length < 2) return false;
  const by = /^\s*(?<dash>--|[-–—―~])\s*(?<who>\S.{1,79})$/u.exec(lines[lines.length - 1]);
  if (!by?.groups || !isAttribution(by.groups.who)) return false;
  const bodyLines = lines.slice(0, -1);
  if (bodyLines.some((l) => LIST_LINE.test(l))) return false;
  const body = bodyLines.join("\n").trim();
  const quoted = /^["“„«‘‚][\s\S]+["”“»’‘][.,]?$/u.test(body) || bodyLines.every((l) => /^\s*>/.test(l));
  const letters = (body.match(/\p{L}/gu) ?? []).length;
  return letters >= 15 && (quoted || by.groups.dash !== "-");
}

/**
 * The note's type when the text leaves no doubt, else null (the AI decides).
 * Only links and little else: source (capture when every link is a picture,
 * film or uploaded file; a mix is null). A lone file name or path: capture.
 * Quoted words with who said them: quote. One short line ending in "?":
 * question. At least three list lines and little prose: framework.
 */
export function detectType(content: string): TypeTag | null {
  const text = String(content ?? "").normalize("NFC").replace(/\r\n?/g, "\n").replace(INLINE_TAG_TOKEN, "$1").trim();
  if (!text) return null;

  let urls = 0;
  let files = 0;
  let urlChars = 0;
  for (const m of text.matchAll(TEXT_URL)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 300), m.index ?? 0);
    const marked = /\[image\]\s*$/i.test(before) || /!\[[^\]\n]*\]\($/.test(before);
    urls++;
    urlChars += m[0].length;
    if (isFileLink(m[0], marked)) files++;
  }
  if (urls > 0) {
    const rest = text.replace(TEXT_URL, " ").replace(/\[image\]/gi, " ");
    const words = rest.match(/[\p{L}\p{N}]+/gu) ?? [];
    const restChars = words.join("").length;
    const littleElse = (words.length <= 10 && restChars <= 80) || (urls >= 3 && restChars <= urlChars * 0.3);
    if (littleElse) return files === urls ? "capture" : files === 0 ? "source" : null;
  }

  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  if (
    lines.length === 1 && text.length <= 200 && FILE_EXT.test(text)
    && (!/\s/.test(text) || /^(?:[A-Za-z]:\\|\\\\|\/|~\/)/.test(text))
  ) return "capture";

  if (isQuote(text, lines)) return "quote";

  if (lines.length === 1 && text.length <= 200 && urls === 0 && /\?["”»’)]*$/u.test(text)) return "question";

  let list = 0;
  let listChars = 0;
  let listLinks = 0;
  let prose = 0;
  let proseChars = 0;
  let fence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) { fence = !fence; continue; }
    if (!fence && LIST_LINE.test(line)) {
      list++;
      listChars += line.trim().length;
      if (/https?:\/\/|\bwww\./i.test(line)) listLinks++;
    } else if (fence || !HEADING_LINE.test(line)) {
      prose++;
      proseChars += line.trim().length;
    }
  }
  if (list >= 3 && prose <= Math.max(2, Math.floor(list / 4)) && proseChars <= listChars / 2 && listLinks * 2 < list) {
    return "framework";
  }
  return null;
}

// ---- tag rules: end ----

// ---- learning ----

export type SuggestionSource = "neighbours" | "ai" | "type-rule";

/** One chip; the app's TagSuggestion (lib/archive-tags.ts) is this shape. */
export interface Suggestion {
  tag: string;
  kind: "type" | "tag";
  source: SuggestionSource;
  /** Short, Polish. */
  reason: string;
  score: number;
  isNew?: boolean;
}

/** A row of similar_archive_blocks: one of his own notes near the one being tagged. */
export interface Neighbour {
  id: string;
  tags: string[];
  similarity: number;
}

/** A row of archive_tag_feedback. */
export interface Feedback {
  block_id: string;
  tag: string;
  accepted: boolean;
  created_at?: string;
}

/** How many of the most similar tagged notes are asked (the RPC's p_k). */
export const NEIGHBOURS_K = 12;
/** A note less similar than this says nothing about the one being tagged. */
export const MIN_SIMILARITY = 0.3;
/** A tag he accepted on a similar note counts this much extra, per unit of similarity... */
export const ACCEPT_BOOST = 0.5;
/** ...and one he turned down there counts this much against. */
export const REJECT_PENALTY = 1.5;
/** A tag only the similar notes propose needs this much summed similarity (one close note or two fair ones). */
export const MIN_NEIGHBOUR_SCORE = 0.5;
/** What the model's first tag is worth next to the similar notes' scores; each later one 10% less. */
export const AI_WEIGHT = 0.6;
export const MAX_SUGGESTIONS = 5;
export const MAX_TAGS = 4;
/** Characters of a note sent to the model. */
export const NOTE_CHARS = 2000;
/** Tags of his vocabulary sent to the model. */
export const VOCAB_SIZE = 150;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "ksiazki", "Książki" and "do_przeczytania"/"do-przeczytania" fold to one key. */
export function foldTag(tag: string): string {
  return tag.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").replace(/Ł/g, "l").toLowerCase().replace(/[-_]/g, "");
}

/**
 * His vocabulary: every real tag on his notes with the number of notes
 * carrying it, most used first, plus saved tags (empty folders) at 0. Type
 * tags and non-tags ("2") are left out.
 */
export function buildVocabulary(tagLists: Iterable<readonly string[]>, saved: Iterable<string> = []): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    const seen = new Set<string>();
    for (const raw of tags ?? []) {
      const t = normaliseTag(raw);
      if (!t || isTypeTag(t) || seen.has(t)) continue;
      seen.add(t);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  for (const raw of saved) {
    const t = normaliseTag(raw);
    if (t && !isTypeTag(t) && !counts.has(t)) counts.set(t, 0);
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

/** The vocabulary's spelling of a tag the model wrote slightly differently ("ksiazki" -> "książki"), else the tag. */
export function matchVocabulary(tag: string, vocabulary: ReadonlyMap<string, number>): string {
  if (vocabulary.has(tag)) return tag;
  const key = foldTag(tag);
  for (const v of vocabulary.keys()) if (foldTag(v) === key) return v;
  return tag;
}

/** His latest answer per note and tag: block id -> tag -> accepted. */
export function latestFeedback(rows: readonly Feedback[]): Map<string, Map<string, boolean>> {
  const sorted = [...rows].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const out = new Map<string, Map<string, boolean>>();
  for (const r of sorted) {
    const tag = normaliseTag(r.tag);
    if (!tag || typeof r.block_id !== "string") continue;
    let byTag = out.get(r.block_id);
    if (!byTag) out.set(r.block_id, (byTag = new Map()));
    byTag.set(tag, r.accepted === true);
  }
  return out;
}

export interface Candidate {
  tag: string;
  /** Summed similarity of the notes carrying it, plus or minus his answers on them. */
  score: number;
  /** Similar notes carrying it. */
  notes: number;
}

export interface Evidence {
  tags: Map<string, Candidate>;
  types: Map<string, Candidate>;
}

/**
 * Steps 1 and 2: every tag of the similar notes scores their similarity; a tag
 * he accepted on one of them gains, one he turned down there loses (even when
 * no similar note carries it, so the model's pick of it is held back too).
 */
export function scoreNeighbours(neighbours: readonly Neighbour[], feedback: ReadonlyMap<string, ReadonlyMap<string, boolean>>): Evidence {
  const tags = new Map<string, Candidate>();
  const types = new Map<string, Candidate>();
  const get = (tag: string) => {
    const into = isTypeTag(tag) ? types : tags;
    let c = into.get(tag);
    if (!c) into.set(tag, (c = { tag, score: 0, notes: 0 }));
    return c;
  };
  for (const n of neighbours) {
    const s = Number(n.similarity);
    if (!Number.isFinite(s) || s < MIN_SIMILARITY) continue;
    for (const t of new Set((n.tags ?? []).map(normaliseTag).filter(Boolean))) {
      const c = get(t);
      c.score += s;
      c.notes += 1;
    }
    for (const [t, accepted] of feedback.get(n.id) ?? []) {
      get(t).score += accepted ? ACCEPT_BOOST * s : -REJECT_PENALTY * s;
    }
  }
  return { tags, types };
}

/** "1 podobna notatka ma #x", "3 podobne notatki mają #x", "5 podobnych notatek ma #x". */
export function similarNotesReason(n: number, tag: string): string {
  if (n === 1) return `1 podobna notatka ma #${tag}`;
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return few ? `${n} podobne notatki mają #${tag}` : `${n} podobnych notatek ma #${tag}`;
}

/** "1 notatka", "3 notatki", "5 notatek". */
export function notesCount(n: number): string {
  if (n === 1) return "1 notatka";
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${n} ${few ? "notatki" : "notatek"}`;
}

/** Why the rule named the type. */
export const RULE_REASON: Record<TypeTag, string> = {
  insight: "Twoja myśl",
  framework: "lista punktów",
  quote: "cytat z autorem",
  source: "tylko linki",
  question: "jedno pytanie",
  task: "coś do zrobienia",
  capture: "tylko obraz lub plik",
  fragment: "nie pasuje jeszcze do innego typu",
};

/** The types as the model's pick is explained to him. */
export const TYPE_GLOSS: Record<TypeTag, string> = {
  insight: "Twoja myśl lub wniosek",
  framework: "system, lista lub szablon",
  quote: "cudze słowa ze źródłem",
  source: "link lub materiał na później",
  question: "otwarte pytanie",
  task: "coś do zrobienia",
  capture: "plik, obraz lub nagranie",
  fragment: "surowa notatka",
};

export interface AiPick {
  type: TypeTag | null;
  tags: string[];
}

export interface CombineInput {
  /** The note's tags now. */
  current: readonly string[];
  /** detectType of the note. */
  ruleType: TypeTag | null;
  evidence: Evidence;
  /** Tags he already turned down for this very note. */
  rejectedHere: ReadonlySet<string>;
  /** The model's answer, or null when it was not asked or failed. */
  ai: AiPick | null;
  vocabulary: ReadonlyMap<string, number>;
}

/**
 * Step 5: at most five chips, the type first. The type is the rule's, else the
 * model's, else the similar notes' (when they agree enough), else fragment;
 * none when the note has one. Tags rank by the similar notes' score plus the
 * model's pick; on a tie the similar notes win. Tags on the note, type names,
 * and tags he turned down for this note are never offered.
 */
export function combineSuggestions(input: CombineInput): Suggestion[] {
  const { evidence, rejectedHere, ai, vocabulary } = input;
  const current = new Set(input.current.map((t) => normaliseTag(t) || t));
  const out: Suggestion[] = [];

  if (![...current].some(isTypeTag)) {
    const offer = (t: TypeTag | null) => !!t && !rejectedHere.has(t);
    const bestNeighbourType = [...evidence.types.values()]
      .filter((c) => c.notes > 0 && c.score >= MIN_NEIGHBOUR_SCORE && isTypeTag(c.tag))
      .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))[0];
    if (offer(input.ruleType)) {
      const t = input.ruleType as TypeTag;
      out.push({ tag: t, kind: "type", source: "type-rule", reason: RULE_REASON[t], score: 1 });
    } else if (offer(ai?.type ?? null)) {
      const t = ai!.type as TypeTag;
      out.push({ tag: t, kind: "type", source: "ai", reason: `AI: ${TYPE_GLOSS[t]}`, score: AI_WEIGHT });
    } else if (bestNeighbourType && offer(bestNeighbourType.tag as TypeTag)) {
      out.push({
        tag: bestNeighbourType.tag, kind: "type", source: "neighbours",
        reason: similarNotesReason(bestNeighbourType.notes, bestNeighbourType.tag), score: round2(bestNeighbourType.score),
      });
    } else if (offer("fragment")) {
      out.push({ tag: "fragment", kind: "type", source: "type-rule", reason: RULE_REASON.fragment, score: 0 });
    }
  }

  const aiTags = (ai?.tags ?? []).map((t) => matchVocabulary(normaliseTag(t), vocabulary)).filter(Boolean);
  const pool = new Set<string>([...evidence.tags.keys(), ...aiTags]);
  const ranked: { tag: string; total: number; n: number; fromNeighbours: boolean; aiRank: number; notes: number }[] = [];
  for (const tag of pool) {
    if (!isTag(tag) || isTypeTag(tag) || current.has(tag) || rejectedHere.has(tag)) continue;
    const c = evidence.tags.get(tag);
    const n = c?.score ?? 0;
    const aiRank = aiTags.indexOf(tag);
    const fromNeighbours = !!c && c.notes > 0 && n >= MIN_NEIGHBOUR_SCORE;
    if (aiRank < 0 && !fromNeighbours) continue;
    const total = n + (aiRank >= 0 ? AI_WEIGHT * (1 - 0.1 * aiRank) : 0);
    if (total <= 0) continue;
    ranked.push({ tag, total, n, fromNeighbours, aiRank, notes: c?.notes ?? 0 });
  }
  ranked.sort((a, b) =>
    b.total - a.total
    || b.n - a.n
    || Number(b.fromNeighbours) - Number(a.fromNeighbours)
    || a.tag.localeCompare(b.tag));

  for (const r of ranked.slice(0, Math.min(MAX_TAGS, MAX_SUGGESTIONS - out.length))) {
    const known = vocabulary.get(r.tag);
    const isNew = known === undefined;
    let reason: string;
    if (r.fromNeighbours) reason = similarNotesReason(r.notes, r.tag);
    else if (!isNew && known > 0) reason = `AI: Twój tag (${notesCount(known)})`;
    else if (!isNew) reason = "AI: Twój folder";
    else {
      const folder = r.tag.includes("/") ? r.tag.slice(0, r.tag.lastIndexOf("/")) : "";
      const inKnownFolder = !!folder && [...vocabulary.keys()].some((v) => v === folder || v.startsWith(`${folder}/`));
      reason = inKnownFolder ? `AI: nowy tag w ${folder}/` : "AI: nowy tag";
    }
    out.push({
      tag: r.tag, kind: "tag", source: r.fromNeighbours ? "neighbours" : "ai", reason, score: round2(r.total),
      ...(isNew ? { isNew: true } : {}),
    });
  }
  return out;
}

/** The model's answer for each of `count` notes (1-based "i"), or null for a note it skipped. */
export function parseAiPicks(args: unknown, count: number): (AiPick | null)[] {
  let parsed: unknown = args;
  if (typeof args === "string") {
    try { parsed = JSON.parse(args); } catch { parsed = null; }
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  const out: (AiPick | null)[] = Array.from({ length: count }, () => null);
  if (!Array.isArray(items)) return out;
  for (const it of items as { i?: unknown; type?: unknown; tags?: unknown }[]) {
    const k = Number(it?.i) - 1;
    if (!Number.isInteger(k) || k < 0 || k >= count || out[k]) continue;
    const type = typeof it.type === "string" && isTypeTag(it.type.trim().toLowerCase()) ? (it.type.trim().toLowerCase() as TypeTag) : null;
    const tags: string[] = [];
    for (const raw of Array.isArray(it.tags) ? it.tags : []) {
      const t = typeof raw === "string" ? normaliseTag(raw) : "";
      if (t && !isTypeTag(t) && !tags.includes(t)) tags.push(t);
    }
    out[k] = { type, tags: tags.slice(0, 6) };
  }
  return out;
}

/**
 * Content that looks like a secret never goes to the model: a password, PIN,
 * token or key written as "name: value", a login and password pair, a
 * credential in a link, a private key, or a token-shaped string.
 */
export function looksLikeCredential(text: string): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  const KEY_VALUE = /(?:^|[^\p{L}\p{N}_])(?:pass(?:word|wd)?|pwd|has(?:ł|l)o|pin|token|secret|sekret|api[ _-]?key|klucz(?:[ _-]?api)?|access[ _-]?key|private[ _-]?key|client[ _-]?secret|seed(?:[ _-]?phrase)?|mnemonic|recovery[ _-]?codes?|backup[ _-]?codes?|kody?[ _-]?(?:zapasowe|odzyskiwania)|2fa|otp)\s*[:=]\s*\S/iu;
  // "hasło to Kot1", "password is x", "hasło Kot!2024", "pin 4821".
  const SAID = /(?:^|[^\p{L}\p{N}_])(?:(?:password|passwd|has(?:ł|l)o)\s+(?:(?:is|to|jest|=)\s+\S|(?=\S*\d)\S{4,})|pin\s+\d{4,8}(?!\d))/iu;
  const SHAPES = [
    /\bsk-(?:proj-|ant-|or-)?[A-Za-z0-9_-]{16,}/,
    /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/,
    /\bxox[abposr]-[A-Za-z0-9-]{10,}/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}/,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i,
  ];
  if (KEY_VALUE.test(t) || SAID.test(t) || SHAPES.some((re) => re.test(t))) return true;

  // An address with something password-like after it: "jan@x.pl / Haslo123!".
  const EMAIL_PAIR = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*(?:[:|/;,]|\s)\s*(?=\S*\d)(?=\S*\p{L})\S{6,}/u;
  if (EMAIL_PAIR.test(t)) return true;

  const withoutLinks = t.replace(/(?:https?:\/\/|\bwww\.)\S+/gi, " ");
  // A long run of letters and digits outside a link (an API key, a hash, a base64 secret).
  if (/(?<![\w/.-])(?=[A-Za-z0-9_+/=-]*\d)(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{32,}(?![\w/.-])/.test(withoutLinks)) return true;
  // A line that is one word of lowercase, digits and uppercase or symbols ("Kot!2024x"; not "COVID-19").
  for (const line of withoutLinks.split("\n")) {
    const w = line.trim();
    if (w.length < 8 || w.length > 64 || /\s/.test(w) || w.startsWith("#") || /@/.test(w)) continue;
    if (/\p{Ll}/u.test(w) && /\d/.test(w) && (/\p{Lu}/u.test(w) || /[^\p{L}\p{N}]/u.test(w))) return true;
  }
  return false;
}

/** What of a note may leave for the model: links without their query strings, addresses masked. */
export function redactForModel(text: string): string {
  return String(text ?? "")
    .replace(/(https?:\/\/[^\s?#<>"]+)[?#][^\s<>"]*/gi, "$1")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>");
}

export const TYPE_DEFINITIONS = `- insight: his own thought, principle or realisation (a thought, idea, reflection, journal entry or memory)
- framework: a system, list, checklist or template
- quote: text from someone else, kept with its source
- source: a link or resource to read later
- question: an open question or a prompt
- task: something to do
- capture: a file, image, screenshot or video
- fragment: a raw note that does not fit anything yet (only when nothing else fits)`;

export function systemPrompt(vocabulary: ReadonlyMap<string, number>): string {
  const top = [...vocabulary].slice(0, VOCAB_SIZE);
  const vocab = top.length
    ? top.map(([t, n]) => (n > 0 ? `${t} (${n})` : `${t} (empty folder)`)).join(", ")
    : "(no tags yet)";
  return `You tag notes in one person's private archive. He is Polish; his notes mix Polish and English. He saves things quickly and rarely tags them, so you pick what he would pick.

For every numbered note return:
- type: exactly one of his eight note types:
${TYPE_DEFINITIONS}
- tags: 2 to 4 topic tags.

Rules for tags:
1. Strongly prefer tags from HIS VOCABULARY below, spelled exactly as listed. Consistency with his existing tags matters more than a perfect word.
2. Create a new tag only when nothing in the vocabulary fits. Make it short and lowercase, Polish or English as he would write it (Polish letters are fine), words joined with "-".
3. A tag may sit in a folder with "/" (for example projekty/rybia-paka). Put a new tag under one of his existing folders when it belongs there.
4. Name what the note is about or what it is for (a project, a goal, a book, something to read or to buy), not its form. Never use a type name as a tag.
5. "Similar notes" lists tags his most similar notes carry, with a weight: strong evidence of how he files this kind of note. Use them when they fit this note.
6. Do not repeat tags the note already has.

HIS VOCABULARY (tag (notes)):
${vocab}

Answer every note, in order, with the suggest tool.`;
}

export interface PromptNote {
  title: string;
  content: string;
  tags: readonly string[];
}

/** One numbered note as the model reads it: its tags, the similar notes' tags, then its (capped, redacted) text. */
export function noteForPrompt(n: number, note: PromptNote, evidence: Evidence): string {
  const title = String(note.title ?? "").trim();
  const content = String(note.content ?? "");
  // The Inbox titles a note with its first 60 characters on one line: no need to send them twice.
  const flat = (x: string) => x.replace(/\s+/g, " ").trim();
  const full = title && !flat(content).startsWith(flat(title).slice(0, 40)) ? `${title}\n\n${content}` : content;
  const cut = full.length > NOTE_CHARS;
  const text = redactForModel(cut ? full.slice(0, NOTE_CHARS) : full).trim();
  const similar = [...evidence.tags.values(), ...evidence.types.values()]
    .filter((c) => c.notes > 0 && c.score > 0)
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, 8)
    .map((c) => `${c.tag} ${c.score.toFixed(2)}`);
  const has = note.tags.map((t) => normaliseTag(t)).filter(Boolean);
  return [
    `[${n}]`,
    `already tagged: ${has.length ? has.join(", ") : "(none)"}`,
    `similar notes: ${similar.length ? similar.join(", ") : "(none)"}`,
    `text${cut ? ` (first ${NOTE_CHARS} of ${full.length} characters)` : ""}:`,
    text || "(empty)",
  ].join("\n");
}

export const SUGGEST_TOOL = {
  type: "function",
  function: {
    name: "suggest",
    description: "One answer per note, in input order",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              i: { type: "integer", description: "The note's number" },
              type: { type: "string", enum: [...TYPE_TAGS] },
              tags: { type: "array", items: { type: "string" }, description: "2 to 4 tags" },
            },
            required: ["i", "type", "tags"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};
