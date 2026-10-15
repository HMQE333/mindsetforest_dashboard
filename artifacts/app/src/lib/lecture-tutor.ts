/**
 * The AI tutor for lecture summaries (Archive > Wykłady): "Przegadaj temat"
 * talks one lecture through, "Sprawdź się" quizzes the user on it.
 *
 * Both go through the ordinary assistant panel. The lecture is pinned like an
 * archive note (its id is "lecture:<vault path>"), and every message then
 * carries its summary in full plus the transcript passages that matter for
 * that message, cut to a fixed budget. A 4-hour lecture is about 100k
 * characters of transcript, so it is never sent whole; a short import is.
 * The edge function sees only the context string, so nothing changes on the
 * server.
 *
 * The same file holds the "knowledge" scope's text: every lecture as one index
 * line, the best-matching summaries and knowledge notes in detail, ranked by
 * word overlap. Words are compared without diacritics and by their first five
 * letters, so "zbiory", "zbiorów" and "zbiór" match, and a note's `aliases`
 * (the term in the other language) let a Polish question find it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ArchiveItemRef } from "@/lib/assistant-context";
import type { useAssistant } from "@/hooks/useAssistant";
import {
  clock,
  noteName,
  parseFrontmatter,
  parseKnowledgeNote,
  recordingNote,
  replaceWikiLinks,
  sourceLabel,
  wikiLinks,
  type FrontValue,
  type VaultFile,
  type WikiLink,
} from "@/lib/kos-vault";

export type TutorMode = "explain" | "quiz";
export type LectureLanguage = "pl" | "en";

export interface TutorLecture {
  /** The summary's path in the vault: "Lectures/Logika/2026-10-11 Zdania logiczne i zbiory.md". */
  path: string;
  /** What the chip and the request call it, in the note's language. */
  title: string;
  language: LectureLanguage;
}

/**
 * The part of the assistant the tutor needs. A component passes what
 * `useAssistant()` returns, as is: `openLectureTutor(useAssistant(), lecture, "quiz")`.
 */
export type TutorApi = Pick<
  ReturnType<typeof useAssistant>,
  "openPanel" | "sendMessage" | "prefill" | "isStreaming" | "archiveItems" | "addArchiveItem" | "removeArchiveItem"
>;

// -- the pinned item --------------------------------------------------------------

const ITEM_PREFIX = "lecture:";

export const lectureItemId = (path: string) => `${ITEM_PREFIX}${path}`;
export const isLectureItem = (item: Pick<ArchiveItemRef, "id">) => item.id.startsWith(ITEM_PREFIX);
export const lectureItemPath = (item: Pick<ArchiveItemRef, "id">) => item.id.slice(ITEM_PREFIX.length);

/** What the user "says" to start, in the note's language: one note, one language. */
export function tutorRequest(lecture: Pick<TutorLecture, "title" | "language">, mode: TutorMode): string {
  const title = lecture.title.trim();
  if (lecture.language === "pl") {
    return mode === "quiz"
      ? `Przepytaj mnie z wykładu „${title}”: 5 pytań, po jednym.`
      : `Przegadajmy wykład „${title}”. Prowadź mnie krok po kroku i sprawdzaj, czy rozumiem.`;
  }
  return mode === "quiz"
    ? `Quiz me on the lecture "${title}": 5 questions, one at a time.`
    : `Let's talk through the lecture "${title}". Take me step by step and check that I follow.`;
}

/**
 * Pins the lecture (and unpins any other lecture, so two summaries never
 * compete for the budget; pinned archive notes stay), opens the panel and
 * starts the conversation. The send gets the new pin list directly, because
 * the hook's state only has it after the next render.
 */
export function openLectureTutor(api: TutorApi, lecture: TutorLecture, mode: TutorMode): void {
  const item: ArchiveItemRef = { id: lectureItemId(lecture.path), title: lecture.title };
  for (const it of api.archiveItems) {
    if (isLectureItem(it) && it.id !== item.id) api.removeArchiveItem(it.id);
  }
  api.addArchiveItem(item);
  api.openPanel();
  const text = tutorRequest(lecture, mode);
  // A reply still streaming would drop the send; the text waits in the input instead.
  if (api.isStreaming) api.prefill(text);
  else void api.sendMessage(text, { archiveItems: [...api.archiveItems.filter((it) => !isLectureItem(it)), item] });
}

/**
 * How to tutor, for the context. Both modes are always described: the mode is
 * in the user's opening request, which the history keeps, and a later
 * "Sprawdź się" on the same lecture switches without re-pinning.
 */
export function tutorRules(language: LectureLanguage): string {
  const pl = language === "pl";
  const name = pl ? "Polish" : "English";
  const stressed = pl ? "Na co prowadzący kładł nacisk" : "What the lecturer stressed";
  const toClarify = pl ? "Do wyjaśnienia" : "To clarify";
  const mine = pl ? "Ode mnie:" : "My addition:";
  const question = pl ? "Pytanie" : "Question";
  const grades = pl ? "dobrze / częściowo / źle" : "correct / partly / wrong";
  return [
    `TUTORING. The user is studying this lecture with you. Write every reply in ${name}, the lecture's language, even when the user writes in the other one. The other language appears only for a term from the glossary, in brackets.`,
    `What the lecturer said is the summary and the transcript below. Callouts marked "(AI)" in the summary were added by AI, not said by the lecturer. When you add an explanation or example of your own, start it with "${mine}". Never present your own addition as the lecturer's words.`,
    `Cite the moment whenever you rely on the lecture, exactly as written in the brackets below, e.g. (12:34) or (¶12). Points under "${toClarify}" are open: never present them as settled. If the summary and the transcript do not cover something, say so; do not guess what was said.`,
    `If the user asked to talk the lecture through: first one line naming the steps (the numbered sections), then one step per reply, in lecture order: 3 to 6 short sentences, then one short question that checks understanding. Wait for the answer, correct it briefly, then go on. Never put the whole lecture in one reply.`,
    `If the user asked to be tested: exactly 5 questions, one per reply, numbered "${question} 1/5" to "${question} 5/5". At least 3 come from "${stressed}", the rest from the numbered sections. Never give the answer before the user tries. After each answer: grade it (${grades}), explain in 1 to 3 sentences what was wrong or missing, with the moment, then ask the next question. After the fifth: the score out of 5 and the one or two topics to go over again.`,
  ].join("\n");
}

// -- words ------------------------------------------------------------------------

/** Function words and the tutor's own request words: they match everything. Without diacritics. */
const STOP = new Set(
  (
    "a aby ale albo ani az bo by byc byl byla bylo byly bez co czy czyli dla do gdy gdzie go i ich ile ja jak jaka jaki " +
    "jakie je jego jej jest juz ja kiedy kto ktora ktore ktory lub ma mam mi mnie moze moj na nad nam nas nie niz o od " +
    "on ona one oni oraz po pod przez przy sa sie so ta tak tam te tego tej ten to tu tym w we wiec z za ze zeby czym " +
    "czego czemu dlaczego cos tez tylko bardzo jeszcze kazdy bedzie ktorych ktorym jako tego " +
    "przegadajmy przepytaj prowadz krok kroku sprawdzaj rozumiem sprawdz pytan pytanie jednym naraz wyklad wykladu " +
    "the and are was were been being for from with that this these those what which who whom how why when where " +
    "you your our they them their its into than then there here have has had does did not but about can could " +
    "would should will just also more most some any all one ones lets let talk through lecture take step check " +
    "follow quiz questions question time"
  ).split(" "),
);

/** "Wykłady" -> "wyklady": lower case, no diacritics (ł has none to drop, so it is mapped). */
export function foldWord(w: string): string {
  return w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
}

/** The words that carry meaning, cut to five letters: "zbiorów" -> "zbior", "Implikację" -> "impli". */
export function stems(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const w = foldWord(raw);
    if (w.length < 3 || STOP.has(w)) continue;
    out.push(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}

/** Query stems with weights: the question counts fully, the reply it answers half. */
function queryWeights(question?: string, previousReply?: string): Map<string, number> {
  const q = new Map<string, number>();
  for (const s of stems(previousReply ?? "")) q.set(s, 0.5);
  for (const s of stems(question ?? "")) q.set(s, 1);
  return q;
}

/** log-scaled rarity of each stem across the documents. */
function idfOf(docs: Set<string>[]): (s: string) => number {
  const df = new Map<string, number>();
  for (const d of docs) for (const s of d) df.set(s, (df.get(s) ?? 0) + 1);
  const n = Math.max(1, docs.length);
  return (s) => Math.log(1 + n / (df.get(s) ?? n));
}

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

function scalar(v: FrontValue | undefined): string | null {
  if (v === undefined) return null;
  const s = (Array.isArray(v) ? v[0] ?? "" : v).trim();
  return s || null;
}

const list = (v: FrontValue | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

// -- lecture summaries ------------------------------------------------------------

/** A v2 summary in Lectures/, or a legacy one as Sessions/Summary <session key>.md. */
export function isLectureSummaryPath(path: string): boolean {
  return /^Lectures\/.+\.md$/i.test(path) || /^Sessions\/Summary .+\.md$/i.test(path);
}

const PL_LETTERS = /[ąćęłńóśźż]/gi;
const PL_WORDS = /(?:^|[^\p{L}])(i|w|z|na|się|nie|jest|że|do|jak|czy|oraz|dla|są|przez|po|mnie)(?=[^\p{L}]|$)/giu;
const EN_WORDS = /(?:^|[^\p{L}])(the|and|is|of|in|that|it|for|are|with|as|this|be|on|me|by)(?=[^\p{L}]|$)/giu;

/** A note without `language:` (legacy): Polish letters and words against English ones. */
export function guessLanguage(text: string): LectureLanguage {
  const pl = (text.match(PL_LETTERS)?.length ?? 0) * 2 + (text.match(PL_WORDS)?.length ?? 0);
  const en = text.match(EN_WORDS)?.length ?? 0;
  return pl > en ? "pl" : "en";
}

type SectionKind = "short" | "stressed" | "clarify" | "concepts" | "section";

function sectionKind(heading: string): SectionKind {
  const h = foldWord(heading.trim());
  if (/^(w skrocie|in short)\b/.test(h)) return "short";
  if (/^(na co prowadz|what the lecturer (stress|emphas))/.test(h)) return "stressed";
  if (/^(do wyjasnienia|to clarify)\b/.test(h)) return "clarify";
  if (/^(pojecia|concepts)\b/.test(h)) return "concepts";
  return "section";
}

interface Section {
  heading: string | null;
  kind: SectionKind | "preamble";
  text: string;
}

/** The body split at "## " headings; text before the first one is the preamble. */
function splitSections(body: string): Section[] {
  const out: Section[] = [];
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  let last = 0;
  let heading: string | null = null;
  for (const m of body.matchAll(re)) {
    const text = body.slice(last, m.index).trim();
    if (heading !== null || text) out.push({ heading, kind: heading === null ? "preamble" : sectionKind(heading), text });
    heading = m[1];
    last = (m.index ?? 0) + m[0].length;
  }
  const text = body.slice(last).trim();
  if (heading !== null || text) out.push({ heading, kind: heading === null ? "preamble" : sectionKind(heading), text });
  return out;
}

export interface LectureDoc {
  path: string;
  vault: string;
  course: string | null;
  topic: string;
  date: string | null;
  language: LectureLanguage;
  /** Session keys ("2026-10-11 13-32") whose recordings are this lecture's transcript. */
  sessions: string[];
  /** Without the frontmatter and the leading "# title". */
  body: string;
  /** "W skrócie" in plain words (for a legacy note, its first paragraph). */
  short: string;
  /** "Na co prowadzący kładł nacisk" as written, or "". */
  stressed: string;
  modified: string;
}

export function parseLecture(f: VaultFile): LectureDoc {
  const { data, body: raw } = parseFrontmatter(f.content);
  const title = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(raw);
  const body = (title ? raw.slice(title[0].length) : raw).trim();
  const sections = splitSections(body);
  const name = noteName(f.path);
  const legacyKey = /^Summary (.+)$/i.exec(name)?.[1] ?? null;
  const sessions = [...list(data.sessions), ...list(data.session)]
    .map((v) => wikiLinks(v)[0]?.name ?? noteName(v))
    .filter(Boolean);
  if (sessions.length === 0 && legacyKey) sessions.push(legacyKey);
  const shortSection = sections.find((s) => s.kind === "short")?.text;
  const firstPara = (sections.find((s) => s.kind === "preamble")?.text ?? body)
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .find((b) => b && !/^(>|#|```)/.test(b));
  const lang = scalar(data.language)?.toLowerCase();
  const topic = scalar(data.topic) || (title ? title[1].trim() : null) || name.replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
  return {
    path: f.path,
    vault: f.vault,
    course: scalar(data.course),
    topic,
    date: scalar(data.date) || /^(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] || (legacyKey ? /^(\d{4}-\d{2}-\d{2})/.exec(legacyKey)?.[1] ?? null : null) || scalar(data.created),
    language: lang === "pl" || lang === "en" ? lang : guessLanguage(body),
    sessions: [...new Set(sessions)],
    body,
    short: flat(replaceWikiLinks(shortSection ?? firstPara ?? "")),
    stressed: sections.find((s) => s.kind === "stressed")?.text ?? "",
    modified: f.modified_at,
  };
}

const otherCourse = (lang: LectureLanguage) => (lang === "pl" ? "Inne" : "Other");

/** "Logika · 2026-10-11 · Zdania logiczne i zbiory" */
export function lectureLabel(d: Pick<LectureDoc, "course" | "date" | "topic" | "language">): string {
  return [d.course || otherCourse(d.language), d.date, d.topic].filter(Boolean).join(" · ");
}

// -- moments: where a summary points into the transcript --------------------------

export interface Moment {
  /** The recording's note name (Recordings/<note>.md). */
  note: string;
  seconds: number | null;
  paragraph: number | null;
  /** Cited under "Na co prowadzący kładł nacisk". */
  stressed: boolean;
}

function anchorOf(l: WikiLink): { seconds: number | null; paragraph: number | null } | null {
  const a = l.anchor ? /^\^?([tp])(\d+)$/i.exec(l.anchor) : null;
  if (!a && !/^Recordings\//i.test(l.target)) return null;
  if (!a) return { seconds: null, paragraph: null };
  const n = Number(a[2]);
  return a[1].toLowerCase() === "t" ? { seconds: n, paragraph: null } : { seconds: null, paragraph: n };
}

/** Every transcript moment the summary cites, in the order written, without repeats. */
export function lectureMoments(body: string): Moment[] {
  const out: Moment[] = [];
  const seen = new Set<string>();
  for (const s of splitSections(body)) {
    // A numbered section's heading carries its own moment: "## 1. Zdania [[…#^t0754|12:34]]".
    for (const l of wikiLinks(`${s.heading ?? ""}\n${s.text}`)) {
      const a = anchorOf(l);
      if (!a || (a.seconds === null && a.paragraph === null)) continue;
      const key = `${l.name}|${a.seconds}|${a.paragraph}`;
      if (seen.has(key)) {
        if (s.kind === "stressed") out.find((m) => `${m.note}|${m.seconds}|${m.paragraph}` === key)!.stressed = true;
        continue;
      }
      seen.add(key);
      out.push({ note: l.name, ...a, stressed: s.kind === "stressed" });
    }
  }
  return out;
}

// -- transcripts ------------------------------------------------------------------

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  /** Paragraph number (1-based) for an import without times. */
  p: number;
}

export interface TranscriptPart {
  note: string;
  /** 1-based, in recording order within the lecture. */
  part: number;
  /** False for an import without times: moments are paragraphs (¶12). */
  timed: boolean;
  segments: TranscriptSegment[];
}

/** One kos_recordings row, as the tutor reads it. */
export interface RecordingInput {
  note_name: string | null;
  file_name: string;
  recorded_at: string;
  part: number | null;
  segments: unknown;
}

const MAX_SEGMENT_CHARS = 1200;

/** Rows in recording order, as numbered parts. A segment keeps its paragraph number (`p`, else its position). */
export function transcriptParts(rows: RecordingInput[]): TranscriptPart[] {
  const sorted = [...rows].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || (a.part ?? 0) - (b.part ?? 0));
  return sorted.map((r, i) => {
    const raw = Array.isArray(r.segments) ? r.segments : [];
    const segments: TranscriptSegment[] = [];
    raw.forEach((s: unknown, idx) => {
      if (!s || typeof s !== "object") return;
      const o = s as Record<string, unknown>;
      const text = clip(flat(String(o.text ?? "")), MAX_SEGMENT_CHARS);
      if (!text) return;
      const p = Number(o.p ?? o.paragraph);
      segments.push({ start: Number(o.start) || 0, end: Number(o.end) || 0, text, p: Number.isFinite(p) && p > 0 ? p : idx + 1 });
    });
    return {
      note: recordingNote({ note_name: r.note_name, recorded_at: r.recorded_at, file_name: r.file_name }),
      part: i + 1,
      timed: segments.some((s) => s.start > 0 || s.end > 0),
      segments,
    };
  });
}

function partPrefix(part: number, multi: boolean, lang: LectureLanguage): string {
  if (!multi) return "";
  return lang === "pl" ? `cz. ${part}, ` : `part ${part}, `;
}

/** "(12:34)", "(cz. 2, 12:34)", "(¶12)": how a cited moment reads in the context. */
function momentLabel(m: { seconds: number | null; paragraph: number | null }, part: number | null, multi: boolean, lang: LectureLanguage): string {
  const prefix = part === null ? "" : partPrefix(part, multi, lang);
  if (m.paragraph !== null) return `(${prefix}¶${m.paragraph})`;
  if (m.seconds !== null) return `(${prefix}${clock(m.seconds)})`;
  return "";
}

function segmentIndex(part: TranscriptPart, m: Moment): number {
  const segs = part.segments;
  if (segs.length === 0) return -1;
  if (m.paragraph !== null) {
    const i = segs.findIndex((s) => s.p === m.paragraph);
    return i >= 0 ? i : Math.min(segs.length - 1, Math.max(0, m.paragraph - 1));
  }
  if (m.seconds === null) return -1;
  let found = 0;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].start <= m.seconds + 0.5) found = i;
    else break;
  }
  return found;
}

export interface ExcerptOptions {
  question?: string;
  previousReply?: string;
  moments: Moment[];
  /** Characters for the transcript text, labels included. */
  budget: number;
  language: LectureLanguage;
}

export interface Excerpts {
  text: string;
  /** Segments included, and in the whole transcript. */
  picked: number;
  total: number;
  /** The whole transcript fit. */
  full: boolean;
}

/** About this much text around each picked moment at first. */
const WINDOW_CHARS = 700;
/** Room left after every pick is widened up to this many times WINDOW_CHARS. */
const WIDEN_ROUNDS = 4;
/** A label every this many characters inside a passage. */
const CHUNK_CHARS = 900;
/** "[cz. 2, 1:01:00–1:02:30] " */
const LABEL_COST = 28;

/**
 * The transcript passages for one message, within `budget` characters. The
 * whole transcript when it fits; otherwise, in this order of priority:
 * 1. the moments cited under "Na co prowadzący kładł nacisk" (what a quiz asks about),
 * 2. segments sharing words with the message (and, at half weight, with the
 *    reply it answers), rarer words counting more,
 * 3. the other moments the summary cites, in lecture order;
 * with none of these, passages spread evenly over the recording.
 * Each pick brings its neighbours up to ~700 characters, so a passage reads as
 * speech, not as a lone line; budget left over widens the passages, most
 * important first. The result is in recording order.
 */
export function selectExcerpts(parts: TranscriptPart[], opts: ExcerptOptions): Excerpts {
  const flatSegs: { part: number; idx: number; len: number }[] = [];
  parts.forEach((p, pi) => p.segments.forEach((s, idx) => flatSegs.push({ part: pi, idx, len: s.text.length + 1 })));
  const total = flatSegs.length;
  if (total === 0 || opts.budget <= 0) return { text: "", picked: 0, total, full: false };
  const multi = parts.length > 1;
  const chosen = parts.map(() => new Set<number>());
  const allChars = flatSegs.reduce((n, s) => n + s.len, 0);
  const allRuns = parts.reduce((n, p) => n + Math.ceil(p.segments.reduce((c, s) => c + s.text.length + 1, 0) / CHUNK_CHARS), 0);

  let full = false;
  if (allChars + allRuns * LABEL_COST <= opts.budget) {
    parts.forEach((p, pi) => p.segments.forEach((_, idx) => chosen[pi].add(idx)));
    full = true;
  } else {
    // Seeds in priority order, then windows around them until the budget is spent.
    const seeds: { part: number; idx: number }[] = [];
    const partOf = new Map(parts.map((p, pi) => [p.note.toLowerCase(), pi]));
    const momentSeed = (m: Moment) => {
      const pi = partOf.get(m.note.toLowerCase());
      if (pi === undefined) return null;
      const idx = segmentIndex(parts[pi], m);
      return idx < 0 ? null : { part: pi, idx };
    };
    for (const m of opts.moments.filter((x) => x.stressed)) {
      const s = momentSeed(m);
      if (s) seeds.push(s);
    }
    const q = queryWeights(opts.question, opts.previousReply);
    if (q.size > 0) {
      const docs = flatSegs.map((f) => new Set(stems(parts[f.part].segments[f.idx].text)));
      const idf = idfOf(docs);
      const scored = flatSegs
        .map((f, i) => {
          let score = 0;
          for (const [s, w] of q) if (docs[i].has(s)) score += w * idf(s);
          return { f, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      // Weak matches (a single common word) only fill what strong ones leave.
      const top = scored[0]?.score ?? 0;
      for (const x of scored) if (x.score >= top * 0.3) seeds.push({ part: x.f.part, idx: x.f.idx });
    }
    for (const m of opts.moments.filter((x) => !x.stressed)) {
      const s = momentSeed(m);
      if (s) seeds.push(s);
    }
    // Nothing to aim at (a legacy summary cites no moments, the message no words):
    // passages spread evenly over the recording, as an overview.
    if (seeds.length === 0) {
      const n = Math.max(1, Math.floor(opts.budget / (WINDOW_CHARS * 2)));
      for (let k = 0; k < n; k++) {
        const f = flatSegs[Math.floor(((k + 0.5) * total) / n)];
        seeds.push({ part: f.part, idx: f.idx });
      }
    }

    // Labels inside long passages (one per CHUNK_CHARS) are paid for up front.
    const limit = opts.budget - Math.ceil(opts.budget / CHUNK_CHARS) * LABEL_COST;
    let used = 0;
    const cost = (pi: number, idx: number) => parts[pi].segments[idx].text.length + 1;
    const take = (pi: number, idx: number): boolean => {
      if (chosen[pi].has(idx)) return true;
      if (used + cost(pi, idx) > limit) return false;
      chosen[pi].add(idx);
      used += cost(pi, idx);
      return true;
    };
    /** Widen a passage to `target` characters, alternately forward and back, while it fits. */
    const grow = (w: { part: number; lo: number; hi: number }, target: number) => {
      const last = parts[w.part].segments.length - 1;
      let chars = 0;
      for (let i = w.lo; i <= w.hi; i++) chars += cost(w.part, i);
      for (let turn = 0; chars < target && (w.lo > 0 || w.hi < last); turn++) {
        const forward = (turn % 2 === 0 && w.hi < last) || w.lo === 0;
        const i = forward ? w.hi + 1 : w.lo - 1;
        if (!take(w.part, i)) return;
        if (forward) w.hi = i;
        else w.lo = i;
        chars += cost(w.part, i);
      }
    };
    const windows: { part: number; lo: number; hi: number }[] = [];
    for (const seed of seeds) {
      if (chosen[seed.part].has(seed.idx)) continue;
      if (used + LABEL_COST + cost(seed.part, seed.idx) > limit) continue;
      used += LABEL_COST;
      take(seed.part, seed.idx);
      const w = { part: seed.part, lo: seed.idx, hi: seed.idx };
      windows.push(w);
      grow(w, WINDOW_CHARS);
    }
    for (let round = 2; round <= WIDEN_ROUNDS && used < limit * 0.9; round++) {
      for (const w of windows) grow(w, WINDOW_CHARS * round);
    }
  }

  const lines: string[] = [];
  let picked = 0;
  parts.forEach((p, pi) => {
    const idxs = [...chosen[pi]].sort((a, b) => a - b);
    picked += idxs.length;
    let chunk: number[] = [];
    const flush = () => {
      if (chunk.length === 0) return;
      const a = p.segments[chunk[0]];
      const b = p.segments[chunk[chunk.length - 1]];
      const prefix = partPrefix(p.part, multi, opts.language);
      const label = p.timed
        ? `${prefix}${clock(a.start)}–${clock(Math.max(b.end, b.start))}`
        : `${prefix}¶${a.p}${b.p !== a.p ? `–${b.p}` : ""}`;
      lines.push(`[${label}] ${chunk.map((i) => p.segments[i].text).join(" ")}`);
      chunk = [];
    };
    let chars = 0;
    for (let k = 0; k < idxs.length; k++) {
      const i = idxs[k];
      if (chunk.length > 0 && (i !== chunk[chunk.length - 1] + 1 || chars >= CHUNK_CHARS)) {
        flush();
        chars = 0;
      }
      chunk.push(i);
      chars += p.segments[i].text.length + 1;
    }
    flush();
  });
  return { text: lines.join("\n"), picked, total, full };
}

// -- the pinned lecture's context -------------------------------------------------

/** Characters for one pinned lecture: rules, summary and transcript together. */
export const LECTURE_BUDGET = 48_000;
/** At most this share of it goes to the summary; the transcript gets the rest. */
const SUMMARY_SHARE = 0.55;

/**
 * The summary for the model: moments as "(12:34)", links as plain names, plot
 * JSON as one line. When it is longer than `max`, the sections a tutor needs
 * most come first (in short, what was stressed, what is open), then the
 * numbered sections in order, and the tail is cut.
 */
export function renderSummary(
  doc: LectureDoc,
  parts: TranscriptPart[],
  max: number,
): string {
  const multi = parts.length > 1;
  const partOf = new Map(parts.map((p) => [p.note.toLowerCase(), p.part]));
  const plot = doc.language === "pl" ? "wykres" : "plot";
  const clean = (text: string) =>
    replaceWikiLinks(
      text.replace(/```(plot3d|plot)[^\n]*\n([\s\S]*?)```/g, (_m, _kind, json: string) => {
        const title = /"title"\s*:\s*"([^"]*)"/.exec(json)?.[1];
        return `(${plot}${title ? `: ${title}` : ""})`;
      }),
      (l) => {
        const a = anchorOf(l);
        if (!a) return l.alias || l.name;
        const label = momentLabel(a, partOf.get(l.name.toLowerCase()) ?? null, multi, doc.language);
        return label || (l.alias ? `(${l.alias})` : "");
      },
    ).replace(/\n{3,}/g, "\n\n");
  const sections = splitSections(doc.body).map((s) => ({
    ...s,
    out: `${s.heading ? `## ${clean(s.heading)}\n` : ""}${clean(s.text)}`.trim(),
  }));
  const whole = sections.map((s) => s.out).join("\n\n");
  if (whole.length <= max) return whole;
  const rank = (k: Section["kind"]) =>
    k === "preamble" || k === "short" ? 0 : k === "stressed" ? 1 : k === "clarify" ? 2 : k === "section" ? 3 : 4;
  const ordered = sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.kind) - rank(b.s.kind) || a.i - b.i);
  const note = doc.language === "pl" ? "\n\n(Podsumowanie ucięte tutaj.)" : "\n\n(Summary cut here.)";
  let out = "";
  for (const { s } of ordered) {
    const next = out ? `${out}\n\n${s.out}` : s.out;
    if (next.length > max - note.length) {
      const room = max - note.length - out.length - 2;
      if (room > 200) out = out ? `${out}\n\n${s.out.slice(0, room)}` : s.out.slice(0, room);
      break;
    }
    out = next;
  }
  return out + note;
}

export interface LectureContextInput {
  file: VaultFile;
  rows: RecordingInput[];
  question?: string;
  previousReply?: string;
  budget?: number;
}

/** One pinned lecture as context text: header, tutoring rules, summary, transcript passages. */
export function lectureContext(input: LectureContextInput): string {
  const budget = input.budget ?? LECTURE_BUDGET;
  const doc = parseLecture(input.file);
  const parts = transcriptParts(input.rows);
  const lang = doc.language;
  const head = [
    `Lecture: ${lectureLabel(doc)} (written in ${lang === "pl" ? "Polish" : "English"}; vault file ${doc.path}).`,
    tutorRules(lang),
  ].join("\n");
  const summary = renderSummary(doc, parts, Math.floor((budget - head.length) * SUMMARY_SHARE));
  const summaryBlock = `--- Summary (written by AI from the transcript; the user reads this one) ---\n${summary}`;
  const room = budget - head.length - summaryBlock.length - 300;
  let transcript: string;
  if (parts.every((p) => p.segments.length === 0)) {
    transcript = "--- Transcript ---\nNo transcript is stored for this lecture's sessions, so only the summary is available.";
  } else {
    const ex = selectExcerpts(parts, {
      question: input.question,
      previousReply: input.previousReply,
      moments: lectureMoments(doc.body),
      budget: Math.max(0, room),
      language: lang,
    });
    const what = ex.full
      ? "the whole transcript"
      : `passages picked for this message: ${ex.picked} of ${ex.total} segments; ask about another part and it is fetched then`;
    transcript = `--- Transcript (speech-to-text, verbatim, may mishear words; ${what}) ---\n${ex.text || "(no passage fits the budget)"}`;
  }
  return [head, summaryBlock, transcript].join("\n\n");
}

interface LectureMaterial {
  file: VaultFile;
  rows: RecordingInput[];
}

const MATERIAL_TTL = 2 * 60_000;
const materialCache = new Map<string, { at: number; value: Promise<LectureMaterial | null> }>();

/** The summary file and its recordings. Cached briefly: a tutoring chat asks for them every message. */
async function loadLecture(userId: string, path: string): Promise<LectureMaterial | null> {
  const key = `${userId}|${path}`;
  const hit = materialCache.get(key);
  if (hit && Date.now() - hit.at < MATERIAL_TTL) return hit.value;
  const value = (async () => {
    const { data: file, error } = await supabase
      .from("kos_vault_files")
      .select("path, vault, content, modified_at")
      .eq("user_id", userId)
      .eq("path", path)
      .maybeSingle();
    if (error) throw error;
    if (!file) return null;
    const doc = parseLecture(file);
    const cols = "note_name, file_name, recorded_at, part, segments";
    const notes = [...new Set(lectureMoments(doc.body).map((m) => m.note))];
    const [bySession, byNote] = await Promise.all([
      doc.sessions.length > 0
        ? supabase.from("kos_recordings").select(cols).eq("user_id", userId).in("session_key", doc.sessions)
        : Promise.resolve({ data: [], error: null }),
      notes.length > 0
        ? supabase.from("kos_recordings").select(cols).eq("user_id", userId).in("note_name", notes)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (bySession.error) throw bySession.error;
    const rows = new Map<string, RecordingInput>();
    for (const r of [...(bySession.data ?? []), ...(byNote.error ? [] : byNote.data ?? [])] as RecordingInput[]) {
      rows.set(recordingNote(r), r);
    }
    return { file, rows: [...rows.values()] };
  })();
  materialCache.set(key, { at: Date.now(), value });
  value.catch(() => materialCache.delete(key));
  if (materialCache.size > 12) materialCache.delete(materialCache.keys().next().value as string);
  return value;
}

/** Context for the pinned lectures; the budget is shared when there are several. */
export async function gatherLectureItems(
  userId: string,
  items: ArchiveItemRef[],
  question?: string,
  previousReply?: string,
): Promise<string> {
  const budget = Math.max(16_000, Math.floor(LECTURE_BUDGET / Math.max(1, items.length)));
  const blocks = await Promise.all(
    items.map(async (it) => {
      try {
        const m = await loadLecture(userId, lectureItemPath(it));
        if (!m) return `--- ${it.title} ---\nThis lecture is no longer in the vault mirror.`;
        return lectureContext({ ...m, question, previousReply, budget });
      } catch {
        return `--- ${it.title} ---\n(lecture unavailable)`;
      }
    }),
  );
  return blocks.join("\n\n");
}

// -- the "knowledge" scope --------------------------------------------------------

const KNOWLEDGE_MAX_CHARS = 20_000;
const DETAILED_LECTURES = 6;
const INDEXED_LECTURES = 60;
const NOTE_LINES = 40;
const RECENT_NOTES = 25;

interface Ranked<T> {
  item: T;
  score: number;
}

/** Word overlap with the question; a word in a heavier field counts more, a rarer word more. */
function rank<T>(items: T[], fields: (t: T) => [string, number][], question?: string): Ranked<T>[] {
  const q = queryWeights(question);
  if (q.size === 0) return items.map((item) => ({ item, score: 0 }));
  const docs = items.map((t) => fields(t).map(([text, w]) => [new Set(stems(text)), w] as const));
  const idf = idfOf(docs.map((fs) => new Set(fs.flatMap(([s]) => [...s]))));
  return items.map((item, i) => {
    let score = 0;
    for (const [s, w] of q) {
      let best = 0;
      for (const [set, fw] of docs[i]) if (fw > best && set.has(s)) best = fw;
      score += w * best * idf(s);
    }
    return { item, score };
  });
}

/**
 * The "knowledge" scope's text: every lecture as one index line, the best
 * matching summaries in detail, and the best matching knowledge notes as
 * compact lines with where they were said. Without a match, the newest.
 */
export function knowledgeContext(files: VaultFile[], question?: string): string {
  const lectures = files.filter((f) => isLectureSummaryPath(f.path)).map(parseLecture);
  const notes = files
    .filter((f) => /^Knowledge\/.+\.md$/i.test(f.path))
    .map((f) => {
      const { data } = parseFrontmatter(f.content);
      return { note: parseKnowledgeNote(f), aliases: list(data.aliases), course: scalar(data.course) };
    });
  if (lectures.length === 0 && notes.length === 0) {
    return "No lecture summaries or knowledge notes yet. They come from the PC tracker: recordings and files in the vault's Import folder, processed by the Claude routine.";
  }

  const byDate = (a: LectureDoc, b: LectureDoc) => (b.date ?? "").localeCompare(a.date ?? "") || a.topic.localeCompare(b.topic);
  const rankedLectures = rank(
    lectures,
    (d) => [[`${d.course ?? ""} ${d.topic}`, 3], [`${d.short} ${d.stressed}`, 1.5], [d.body, 1]],
    question,
  ).sort((a, b) => b.score - a.score || byDate(a.item, b.item));
  const rankedNotes = rank(
    notes,
    (n) => [[`${n.note.title} ${n.aliases.join(" ")}`, 3], [`${n.note.summary} ${n.note.quote ?? ""}`, 1.5], [n.note.body, 1]],
    question,
  ).sort((a, b) => b.score - a.score || b.item.note.modified.localeCompare(a.item.note.modified));
  const matched = rankedLectures.some((r) => r.score > 0) || rankedNotes.some((r) => r.score > 0);

  const courses = new Map<string, number>();
  for (const d of lectures) {
    const c = d.course || otherCourse(d.language);
    courses.set(c, (courses.get(c) ?? 0) + 1);
  }
  const out: string[] = [
    `Lecture summaries: ${lectures.length}${courses.size ? ` (${[...courses].map(([c, n]) => `${c} ${n}`).join(", ")})` : ""}. Knowledge notes: ${notes.length}.`,
    matched
      ? "Ranked by word overlap with the message, best first."
      : "Nothing shares words with the message, so the newest are listed.",
    'To study one lecture in depth, the user opens it in Archive > Wykłady and presses "Przegadaj temat" or "Sprawdź się".',
  ];

  if (lectures.length > 0) {
    out.push("", "All lectures (course · date · topic, language):");
    for (const d of [...lectures].sort(byDate).slice(0, INDEXED_LECTURES)) out.push(`- ${lectureLabel(d)} [${d.language}]`);
    if (lectures.length > INDEXED_LECTURES) out.push(`- … and ${lectures.length - INDEXED_LECTURES} older`);
    const detailed = (matched ? rankedLectures.filter((r) => r.score > 0) : rankedLectures).slice(0, DETAILED_LECTURES);
    if (detailed.length > 0) {
      out.push("", matched ? "Best matching lectures:" : "Newest lectures:");
      for (const { item: d } of detailed) {
        const stressed = flat(replaceWikiLinks(d.stressed, (l) => (anchorOf(l) ? "" : l.alias || l.name)).replace(/^\s*[-*+]\s+/gm, "; "))
          .replace(/^;\s*/, "");
        out.push(
          `- ${lectureLabel(d)} [${d.language}] (${d.path}): ${clip(d.short, 320)}` +
            (stressed ? ` Stressed: ${clip(stressed, 260)}` : ""),
        );
      }
    }
  }

  if (notes.length > 0) {
    const picked = matched ? rankedNotes.filter((r) => r.score > 0).slice(0, NOTE_LINES) : rankedNotes.slice(0, RECENT_NOTES);
    if (picked.length > 0) {
      out.push("", matched ? "Best matching knowledge notes ([type] title (other-language name; course): statement. \"quote\" (where it was said)):" : "Newest knowledge notes:");
      let size = out.join("\n").length;
      for (const { item } of picked) {
        const n = item.note;
        const extra = [item.aliases.length ? `= ${item.aliases.join(", ")}` : "", item.course ?? ""].filter(Boolean).join("; ");
        const where = n.sources[0] ? ` (${sourceLabel(n.sources[0])})` : "";
        const line =
          `- [${n.type || "note"}] ${n.title}${extra ? ` (${extra})` : ""}: ${clip(n.summary, 220)}` +
          (n.quote ? ` "${clip(n.quote, 150)}"` : "") +
          where;
        if (size + line.length + 1 > KNOWLEDGE_MAX_CHARS) break;
        out.push(line);
        size += line.length + 1;
      }
    }
  }
  return out.join("\n");
}

const VAULT_TTL = 60_000;
const vaultCache = new Map<string, { at: number; value: Promise<VaultFile[]> }>();

/** Lectures/, Knowledge/ and the legacy Sessions/Summary notes. Cached for a minute. */
export function loadKnowledgeFiles(userId: string): Promise<VaultFile[]> {
  const hit = vaultCache.get(userId);
  if (hit && Date.now() - hit.at < VAULT_TTL) return hit.value;
  const value = (async () => {
    const cols = "path, vault, content, modified_at";
    const out: VaultFile[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 10 * PAGE; from += PAGE) {
      const { data, error } = await supabase
        .from("kos_vault_files")
        .select(cols)
        .eq("user_id", userId)
        .in("folder", ["Lectures", "Knowledge"])
        .order("path")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    const { data: legacy } = await supabase
      .from("kos_vault_files")
      .select(cols)
      .eq("user_id", userId)
      .like("path", "Sessions/Summary %");
    out.push(...(legacy ?? []));
    return out;
  })();
  vaultCache.set(userId, { at: Date.now(), value });
  value.catch(() => vaultCache.delete(userId));
  return value;
}
