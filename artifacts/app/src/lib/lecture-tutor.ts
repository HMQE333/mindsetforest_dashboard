/**
 * Studying a lecture on the user's own subscriptions (Archive > Lectures):
 * long study sessions run in ChatGPT or Claude Desktop, never through the
 * dashboard's paid assistant. The dashboard shows the summary and hands it off.
 *
 * - "Ucz się w ChatGPT" / "Test w ChatGPT" copy a study pack (`buildStudyPack`):
 *   how to teach (the user's learning mode, unless a ChatGPT project holds it),
 *   the summary as plain Markdown, the transcript passages that matter most
 *   (what the lecturer stressed first), the rules and the opening move.
 * - "Przegadaj w Claude" copies one short instruction (`claudeInstruction`):
 *   Claude Desktop reads the vault itself, so it only needs the note's path
 *   and `_SYSTEM/learning-mode.md`.
 * - "Pakiet przedmiotu" (`buildCoursePack`) is one Markdown file per course
 *   for a ChatGPT or Claude project: the textbook, every summary oldest first
 *   and one merged glossary.
 *
 * A 4-hour lecture is about 100k characters of transcript, so a pack never
 * carries it whole; `selectExcerpts` picks the passages. The same file holds
 * the assistant's "knowledge" scope for short questions: summaries and notes
 * only, never transcripts, ranked by word overlap. Words are compared without
 * diacritics and by their first five letters, so "zbiory", "zbiorów" and
 * "zbiór" match, and a note's `aliases` (the term in the other language) let a
 * Polish question find it.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  clock,
  courseOf,
  fold,
  isLectureSummaryPath,
  lectureSectionKind,
  parseFrontmatter,
  parseKnowledgeNote,
  parseLectureSummary,
  recordingNote,
  replaceWikiLinks,
  sourceLabel,
  splitLectureBody,
  wikiLinks,
  type FrontValue,
  type LectureLanguage,
  type LectureSectionKind,
  type LectureSummary,
  type VaultFile,
  type WikiLink,
} from "@/lib/kos-vault";
import { isChatGptUrl } from "@/lib/study-prompts";

/** "explain": walk me through it; "test": quiz me, A/B/C/D first. */
export type StudyMode = "explain" | "test";

// -- words ------------------------------------------------------------------------

/** Function words and the words of a study request ("przepytaj", "quiz"): they match everything. Without diacritics. */
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

/** The words that carry meaning, cut to five letters: "zbiorów" -> "zbior", "Implikację" -> "impli". */
export function stems(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const w = fold(raw);
    if (w.length < 3 || STOP.has(w)) continue;
    out.push(w.length > 5 ? w.slice(0, 5) : w);
  }
  return out;
}

/** The question's stems, each weighing 1. */
function queryWeights(question?: string): Map<string, number> {
  const q = new Map<string, number>();
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

interface Section {
  heading: string | null;
  kind: LectureSectionKind | "preamble";
  text: string;
}

/** The body split at "## " headings (not inside code blocks); text before the first one is the preamble. */
function sectionsOf(body: string): Section[] {
  const { preamble, sections } = splitLectureBody(body);
  return [
    ...(preamble ? [{ heading: null, kind: "preamble" as const, text: preamble }] : []),
    ...sections.map((s) => ({ heading: s.heading, kind: lectureSectionKind(s.heading), text: s.text })),
  ];
}

/** A summary (or a course textbook) with the text of its "what the lecturer stressed" section. */
export interface LectureDoc extends LectureSummary {
  /** "Na co prowadzący kładł nacisk" as written, or "". */
  stressed: string;
}

export function parseLecture(f: VaultFile): LectureDoc {
  const s = parseLectureSummary(f);
  return { ...s, stressed: sectionsOf(s.body).find((x) => x.kind === "stressed")?.text ?? "" };
}

const otherCourse = (lang: LectureLanguage) => (lang === "pl" ? "Inne" : "Other");

/** "Logika · 2026-10-11 · Zdania logiczne i zbiory" */
export function lectureLabel(d: Pick<LectureSummary, "course" | "date" | "topic" | "language">): string {
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
  for (const s of sectionsOf(body)) {
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
 * 2. the other moments the summary cites, in lecture order;
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
    for (const m of opts.moments.filter((x) => !x.stressed)) {
      const s = momentSeed(m);
      if (s) seeds.push(s);
    }
    // Nothing to aim at (a legacy summary cites no moments):
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


// -- plain Markdown: a vault note as it reads outside Obsidian --------------------

const CALLOUT_NAMES: Record<string, { pl: string; en: string }> = {
  example: { pl: "Przykład", en: "Example" },
  tip: { pl: "Wskazówka", en: "Tip" },
  important: { pl: "Ważne", en: "Important" },
  abstract: { pl: "Wizualizacja", en: "Visualisation" },
  note: { pl: "Notatka", en: "Note" },
  info: { pl: "Informacja", en: "Info" },
  question: { pl: "Pytanie", en: "Question" },
  warning: { pl: "Uwaga", en: "Warning" },
  quote: { pl: "Cytat", en: "Quote" },
};

/** "[wykres: sin i cos]": a plot block as one line, named by its title or its curves. */
function plotLine(kind: string, json: string, lang: LectureLanguage): string {
  const three = kind === "plot3d";
  const word = lang === "pl" ? (three ? "wykres 3D" : "wykres") : three ? "3D plot" : "plot";
  const title = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(json)?.[1];
  const field = (name: string) => [...json.matchAll(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g"))].map((m) => m[1]);
  const labels = field("label");
  const curves = labels.length ? labels : field("expr");
  const what = (title || [...new Set(curves)].slice(0, 3).join(", ")).replace(/\\(.)/g, "$1").trim();
  return what ? `[${word}: ${what}]` : `[${word}]`;
}

const FENCE_OPEN = /^(\s*(?:>\s*)*)(`{3,}|~{3,})\s*([^\s`]*)/;
const FENCE_CLOSE = /^\s*(?:>\s*)*(`{3,}|~{3,})\s*$/;
const CALLOUT_HEAD = /^(\s*(?:>\s*)*)\[!([A-Za-z0-9_-]+)\][+-]?[ \t]*(.*)$/;

/** What a [[link]] becomes: "(12:34)" for a moment in the transcript, null for any other link. */
export type MomentText = (l: WikiLink) => string | null;

/** "(12:34)", "(¶12)", or "" for a bare link to a recording; null when the link is not a recording's. */
export const plainMoment: MomentText = (l) => {
  const a = anchorOf(l);
  if (!a) return null;
  return momentLabel(a, null, false, "pl") || (l.alias ? `(${l.alias})` : "");
};

/**
 * A note's Markdown as it reads outside Obsidian (pasted into ChatGPT, in a
 * course pack): [[links]] as their text, transcript moments as "(12:34)",
 * callout headers as a bold title in the quote ("> **Przykład**"), ```plot /
 * ```plot3d blocks as one line "[wykres: …]", mermaid and other code kept
 * as code blocks, %% comments %% dropped.
 */
export function plainMarkdown(text: string, lang: LectureLanguage, moment: MomentText = plainMoment): string {
  const link = (s: string) =>
    replaceWikiLinks(s, (l) => {
      const m = moment(l);
      return m === null ? l.alias || l.name : m;
    });
  const out: string[] = [];
  let fence: { marker: string; plot: { prefix: string; kind: string; json: string[] } | null } | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (fence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) {
        if (fence.plot) out.push(`${fence.plot.prefix}${plotLine(fence.plot.kind, fence.plot.json.join("\n"), lang)}`);
        else out.push(line);
        fence = null;
      } else if (fence.plot) fence.plot.json.push(line.replace(/^\s*(?:>\s?)*/, ""));
      else out.push(line);
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      const kind = open[3].toLowerCase();
      fence = { marker: open[2], plot: kind === "plot" || kind === "plot3d" ? { prefix: open[1], kind, json: [] } : null };
      if (!fence.plot) out.push(line);
      continue;
    }
    const prose = line.replace(/%%.*?%%/g, "");
    if (!prose.trim() && line.trim()) continue;
    const quoted = /^(\s*(?:>\s*)+)(.*)$/.exec(prose);
    const callout = quoted ? CALLOUT_HEAD.exec(quoted[2]) : null;
    if (quoted && callout) {
      const name = CALLOUT_NAMES[callout[2].toLowerCase()]?.[lang] ?? callout[2];
      const title = link(callout[3]).trim() || name;
      out.push(`${quoted[1].trimEnd()} **${title}**`);
      continue;
    }
    out.push(link(prose));
  }
  // A block left open at the end of the note.
  if (fence?.plot) out.push(`${fence.plot.prefix}${plotLine(fence.plot.kind, fence.plot.json.join("\n"), lang)}`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The section order kept when a note is too long: the overview, the map, what
 * was stressed (a textbook: its one-page compression), what has to be
 * memorised and the questions, what is open, then the rest.
 */
const KEEP_RANK: Record<Section["kind"], number> = {
  preamble: 0,
  short: 0,
  map: 1,
  stressed: 2,
  compression: 2,
  memorise: 3,
  questions: 3,
  clarify: 4,
  section: 5,
  concepts: 6,
};

/** A textbook's mechanisms and constraints are the model itself: kept with the map, before the questions. */
const CORE_HEADING = /^(?:\d+[.)]\s*)?(?:mechanizmy|mechanisms|ograniczenia|constraints)\b/i;

/** "> [!important]- Do zapamiętania" sits under "Pojęcia": a section holding it is kept like "memorise". */
const keepRank = (s: Section) =>
  Math.min(
    KEEP_RANK[s.kind],
    s.kind === "section" && s.heading && CORE_HEADING.test(s.heading.trim()) ? KEEP_RANK.stressed : Infinity,
    /^\s*>\s*\[!important\]/im.test(s.text) ? KEEP_RANK.memorise : Infinity,
  );

/**
 * A note in plain Markdown within `max` characters. Too long, it keeps the
 * sections that matter most whole (in short, the map, what was stressed, what
 * is open, then the numbered sections in order), cuts the first one that does
 * not fit, drops the rest, and says so; what it keeps stays in note order.
 */
export function plainNote(body: string, lang: LectureLanguage, max: number, moment: MomentText = plainMoment): { text: string; cut: boolean } {
  const sections = sectionsOf(body).map((s, i) => ({
    i,
    rank: keepRank(s),
    out: `${s.heading ? `## ${plainMarkdown(s.heading, lang, moment)}\n` : ""}${plainMarkdown(s.text, lang, moment)}`.trim(),
  }));
  const whole = sections.map((s) => s.out).join("\n\n");
  if (whole.length <= max) return { text: whole, cut: false };
  const note = lang === "pl" ? "(Skrócone, żeby się zmieścić. Całość jest w Obsidianie i w pakiecie przedmiotu.)" : "(Shortened to fit. The whole note is in Obsidian and in the course pack.)";
  let room = max - note.length - 2;
  const kept = new Map<number, string>();
  const byRank = [...sections].sort((a, b) => a.rank - b.rank || a.i - b.i);
  // Whole sections first, most important first; one that does not fit is skipped, not the rest.
  for (const s of byRank) {
    if (s.out.length + 2 > room) continue;
    kept.set(s.i, s.out);
    room -= s.out.length + 2;
  }
  // Room left: the beginning of the most important section that did not fit,
  // cut at a line end, so a table row or a formula is not split in half.
  const first = byRank.find((s) => !kept.has(s.i));
  if (first && room > 300) {
    const slice = first.out.slice(0, room - 3);
    const end = slice.lastIndexOf("\n");
    kept.set(first.i, `${end > room / 2 ? slice.slice(0, end) : slice}…`);
  }
  const text = sections.filter((s) => kept.has(s.i)).map((s) => kept.get(s.i)!).join("\n\n");
  return { text: `${text}\n\n${note}`, cut: true };
}

// -- the study pack (ChatGPT) and the instruction (Claude Desktop) ----------------

/** The pack stays under this many characters: a long paste still has to go through. */
export const STUDY_PACK_MAX = 30_000;
/** At most this much of the transcript, after the summary. */
export const PASSAGES_MAX = 6_000;
/** The learning mode is ~6.6k characters; a much longer text is cut, not the lecture. */
const LEARNING_MAX = 12_000;

/** The user's method in a few lines, for when Settings has no learning mode yet. */
export const BUILTIN_LEARNING: Record<LectureLanguage, string> = {
  pl: [
    "Prowadź mnie według mojego trybu nauki:",
    "1. Najpierw mapa: z czego składa się temat, jakie są moduły i jak się łączą. Chcę wiedzieć, gdzie jestem.",
    "2. Na start bardzo prosty, ale mechanicznie sensowny model (kabel, zawias, filtr, pętla sprzężenia), bez infantylnych analogii.",
    "3. Pętla Predict → Name → Place → Refine: najpierw daj mi przewidzieć mechanizm, potem go nazwij, umieść w mapie i doprecyzuj.",
    "4. Pytania zawężaj. Gdy nie odpowiadam, dodaj 1-2 słowa-klucze zamiast od razu podawać odpowiedź.",
    "5. Retrieval stopniuj: A/B/C/D z sensownymi dystraktorami → dopasowanie → krótkie odtworzenie → własne słowa → pełne odtworzenie.",
    "6. Moje komendy: mapa, daleko / średnio / blisko, soczewka, relacja, rozróżnienie, kontrast, granica, kompresja, test, articulate.",
    "7. Co kilka kroków wróć do mapy: gdzie to teraz siedzi?",
    "8. Zauważaj momenty „aha”, skuteczne metafory i blokery; na koniec wypisz je krótko jako log nauki.",
  ].join("\n"),
  en: [
    "Teach me with my learning mode:",
    "1. Map first: what the topic is made of, its modules and how they connect. I want to know where I am.",
    "2. Start with a very simple but mechanically sound model (a cable, a hinge, a filter, a feedback loop), no childish analogies.",
    "3. The Predict → Name → Place → Refine loop: let me predict the mechanism first, then name it, place it on the map and refine it.",
    "4. Narrow your questions. When I do not answer, add 1-2 cue words instead of giving the answer away.",
    "5. Grade retrieval: A/B/C/D with plausible distractors → matching → short recall → my own words → full recall.",
    "6. My commands: map, far / middle / close, lens, relation, distinction, contrast, boundary, compression, test, articulate.",
    "7. Every few steps, go back to the map: where does this sit now?",
    "8. Notice aha moments, metaphors that work and blockers; at the end list them briefly as a learning log.",
  ].join("\n"),
};

const PACK_TEXT = {
  pl: {
    how: "Jak mnie uczyć",
    project: "Ucz mnie według instrukcji tego projektu (tryb nauki).",
    material: "Materiał",
    passages: "Fragmenty zapisu wykładu",
    passagesNote: (full: boolean) =>
      full
        ? "(Cały zapis. Transkrypcja automatyczna, może przekręcać słowa.)"
        : "(Najważniejsze fragmenty, najpierw to, na co prowadzący kładł nacisk. Transkrypcja automatyczna, może przekręcać słowa.)",
    rules: "Zasady: trzymaj się tego materiału. To, co dodajesz od siebie, wyraźnie zaznacz („Ode mnie:”). Kiedy to pomaga, rysuj w czacie diagramy i wykresy.",
    language: "Język: rozmawiaj ze mną po polsku, w języku tego materiału.",
    explain: (textbook: boolean) =>
      `Zacznij od mapy tego ${textbook ? "przedmiotu" : "wykładu"} (punkt 1 mojego trybu), potem prowadź mnie pętlą Predict → Name → Place → Refine.`,
    test: (textbook: boolean) =>
      textbook
        ? "test: zacznij od pytań A/B/C/D z sensownymi dystraktorami, głównie z „Pytań sprawdzających” i „Do zapamiętania”, po jednym; potem krótkie odtwarzanie."
        : "test: zacznij od pytań A/B/C/D z sensownymi dystraktorami, głównie z „Na co prowadzący kładł nacisk”, po jednym; potem krótkie odtwarzanie.",
  },
  en: {
    how: "How to teach me",
    project: "Teach me following this project's instructions (my learning mode).",
    material: "Material",
    passages: "Transcript passages",
    passagesNote: (full: boolean) =>
      full
        ? "(The whole transcript. Speech-to-text, may mishear words.)"
        : "(The most important passages, what the lecturer stressed first. Speech-to-text, may mishear words.)",
    rules: 'Rules: stick to this material. Mark clearly what you add yourself ("My addition:"). Draw diagrams and plots in the chat when they help.',
    language: "Language: talk to me in English, the language of this material, even where my learning mode is written in Polish.",
    explain: (textbook: boolean) =>
      `Start with the map of this ${textbook ? "course" : "lecture"} (point 1 of my learning mode), then take me through the Predict → Name → Place → Refine loop.`,
    test: (textbook: boolean) =>
      textbook
        ? 'test: start with A/B/C/D questions with plausible distractors, mostly from "Diagnostic questions" and "To memorise", one at a time; then short recall.'
        : 'test: start with A/B/C/D questions with plausible distractors, mostly from "What the lecturer stressed", one at a time; then short recall.',
  },
};

export interface StudyPackInput {
  /** A lecture summary or a course textbook, as the vault index has it. */
  lecture: Pick<LectureSummary, "kind" | "course" | "topic" | "date" | "language" | "body">;
  /** The lecture's recordings with their transcripts (none for a textbook). */
  rows?: RecordingInput[];
  mode: StudyMode;
  /** Settings > AI Context > Tryb nauki; empty: a built-in summary of the method. */
  learningMode?: string;
  /** Settings > AI Context > ChatGPT project link; set: the project's instructions hold the learning mode. */
  projectUrl?: string;
}

/**
 * What "Ucz się w ChatGPT" / "Test w ChatGPT" copy, in the note's language:
 * how to teach (or one line when a ChatGPT project holds the learning mode),
 * the material (the summary whole, then up to ~6000 characters of transcript),
 * the rules and the opening move. Never longer than STUDY_PACK_MAX.
 */
export function buildStudyPack(input: StudyPackInput): string {
  const { lecture, mode } = input;
  const lang = lecture.language;
  const t = PACK_TEXT[lang];
  const textbook = lecture.kind === "textbook";
  const parts = transcriptParts(input.rows ?? []);
  const multi = parts.length > 1;
  const partOf = new Map(parts.map((p) => [p.note.toLowerCase(), p.part]));
  const moment: MomentText = (l) => {
    const a = anchorOf(l);
    if (!a) return null;
    return momentLabel(a, partOf.get(l.name.toLowerCase()) ?? null, multi, lang) || (l.alias ? `(${l.alias})` : "");
  };

  const learning = (input.learningMode ?? "").trim() || BUILTIN_LEARNING[lang];
  // The same test as the link the button opens: a link that would not open the project does not stand in for the learning mode.
  const head = isChatGptUrl(input.projectUrl ?? "")
    ? t.project
    : `# ${t.how}\n\n${learning.length > LEARNING_MAX ? `${learning.slice(0, LEARNING_MAX).trimEnd()}…` : learning}`;
  const what = [lecture.course || otherCourse(lang), lecture.topic].filter(Boolean).join(" — ");
  const title = `# ${t.material}: ${what}${lecture.date ? ` (${lecture.date})` : ""}`;
  const tail = `---\n\n${t.rules}\n\n${t.language}\n\n${mode === "test" ? t.test(textbook) : t.explain(textbook)}`;

  const fixed = head.length + title.length + tail.length + 12;
  const summary = plainNote(lecture.body, lang, Math.max(1000, STUDY_PACK_MAX - fixed), moment).text;
  const blocks = [head, title, summary];

  if (parts.some((p) => p.segments.length > 0)) {
    const heading = `## ${t.passages}\n${t.passagesNote(false)}`;
    const room = Math.min(PASSAGES_MAX, STUDY_PACK_MAX - fixed - summary.length - heading.length - 8);
    if (room >= 400) {
      const ex = selectExcerpts(parts, { moments: lectureMoments(lecture.body), budget: room, language: lang });
      if (ex.text) blocks.push(`## ${t.passages}\n${t.passagesNote(ex.full)}\n\n${ex.text}`);
    }
  }
  blocks.push(tail);
  const pack = blocks.join("\n\n");
  // The parts are budgeted to fit; this only guards the arithmetic.
  return pack.length <= STUDY_PACK_MAX ? pack : `${pack.slice(0, STUDY_PACK_MAX - tail.length - 3)}…\n\n${tail}`;
}

/** The learning mode as the tracker writes it into the vault for Claude Desktop. */
export const LEARNING_MODE_PATH = "_SYSTEM/learning-mode.md";

/**
 * What "Przegadaj w Claude" copies: Claude Desktop reads the vault itself,
 * so it gets the note's path and where the learning mode is, not the text.
 * With no learning mode saved in the dashboard the tracker has not written
 * that file, so the built-in summary of the method comes along instead. The
 * tracker overwrites _SYSTEM/, so nothing from the session is written there.
 */
export function claudeInstruction(
  lecture: Pick<LectureSummary, "kind" | "path" | "vault" | "language">,
  learningMode = "",
): string {
  const textbook = lecture.kind === "textbook";
  const saved = learningMode.trim() !== "";
  if (lecture.language === "pl") {
    return [
      `Przegadajmy ${textbook ? "podręcznik przedmiotu" : "wykład"} z mojego skarbca Obsidiana „${lecture.vault}”: ${lecture.path}`,
      saved
        ? `Najpierw przeczytaj ${LEARNING_MODE_PATH} (mój tryb nauki) i prowadź mnie według niego.`
        : `Jeśli jest plik ${LEARNING_MODE_PATH} (mój tryb nauki), przeczytaj go i prowadź mnie według niego. Jeśli go nie ma:\n${BUILTIN_LEARNING.pl}`,
      textbook
        ? "Trzymaj się tego podręcznika i podsumowań, z których powstał; to, co dodajesz od siebie, zaznacz. Zacznij od mapy przedmiotu."
        : "Trzymaj się tej notatki i zapisu wykładu, do którego linkuje (Recordings/); to, co dodajesz od siebie, zaznacz. Zacznij od mapy wykładu.",
      "Nie zmieniaj niczego w _SYSTEM/ (nadpisuje to tracker). Log nauki zapisz, jeśli chcesz, w osobnej notatce poza _SYSTEM/.",
    ].join("\n");
  }
  return [
    `Let's talk through the ${textbook ? "course textbook" : "lecture"} in my Obsidian vault "${lecture.vault}": ${lecture.path}`,
    saved
      ? `First read ${LEARNING_MODE_PATH} (my learning mode) and teach me with it.`
      : `If ${LEARNING_MODE_PATH} (my learning mode) exists, read it and teach me with it. If it does not:\n${BUILTIN_LEARNING.en}`,
    textbook
      ? "Stick to this textbook and the summaries it was built from; mark what you add yourself. Start with the course map."
      : "Stick to this note and the transcript it links to (Recordings/); mark what you add yourself. Start with the lecture map.",
    "Talk to me in English, the language of this note, even where my learning mode is written in Polish.",
    "Do not change anything in _SYSTEM/ (the tracker overwrites it). If you keep a learning log, put it in a separate note outside _SYSTEM/.",
  ].join("\n");
}

// -- the course pack (one file for a ChatGPT or Claude project) -------------------

const GLOSSARY_TITLE = /slowniczek|glossary/;

/** The "> [!note]- Słowniczek PL ↔ EN" callouts taken out of a note: the note without them, and their lines. */
export function takeGlossary(body: string): { body: string; entries: string[] } {
  const lines = body.split(/\r?\n/);
  const kept: string[] = [];
  const entries: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = /^\s*>\s*\[!([A-Za-z0-9_-]+)\][+-]?[ \t]*(.*)$/.exec(lines[i]);
    if (!head || !GLOSSARY_TITLE.test(fold(head[2]))) {
      kept.push(lines[i]);
      continue;
    }
    while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) {
      i++;
      const entry = lines[i].replace(/^\s*>\s?/, "").replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").trim();
      if (entry) entries.push(entry);
    }
  }
  return { body: kept.join("\n"), entries };
}

/** Glossary lines from several notes as one list: one line per term (the first wins), in alphabetical order. */
export function mergeGlossary(entries: string[]): string[] {
  const byTerm = new Map<string, string>();
  for (const e of entries) {
    const term = e.split(/\s*(?::|=|→|->|—|–)\s*/)[0].replace(/[*_`]/g, "").trim();
    const key = fold(term).replace(/\s+/g, " ");
    if (key && !byTerm.has(key)) byTerm.set(key, e);
  }
  return [...byTerm.entries()].sort(([a], [b]) => a.localeCompare(b, "pl")).map(([, e]) => e);
}

const COURSE_TEXT = {
  pl: {
    file: "pakiet do nauki",
    intro: (n: number, textbook: boolean) =>
      `${textbook ? "Podręcznik przedmiotu i podsumowania" : "Podsumowania"} wszystkich wykładów (${n}), od najstarszego; na końcu wspólny słowniczek. Do wgrania do projektu w ChatGPT albo Claude.`,
    updated: "zaktualizowany",
    glossary: "Słowniczek PL ↔ EN",
  },
  en: {
    file: "study pack",
    intro: (n: number, textbook: boolean) =>
      `${textbook ? "The course textbook and the summaries" : "The summaries"} of every lecture (${n}), oldest first; one merged glossary at the end. For a ChatGPT or Claude project.`,
    updated: "updated",
    glossary: "Glossary EN ↔ PL",
  },
};

/** A course name made safe as a file name on Windows and phones. */
const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim() || "Kurs";

export interface CoursePack {
  fileName: string;
  text: string;
  language: LectureLanguage;
}

/**
 * "Pakiet przedmiotu": the course's textbook (if any), then every summary
 * oldest first in plain Markdown without their glossaries, then one merged
 * glossary. Built in the browser from the vault copy; nothing is sent anywhere.
 */
export function buildCoursePack(group: { course: string; lectures: LectureSummary[]; textbook: LectureSummary | null }): CoursePack {
  const docs = [...group.lectures].sort(
    (a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.modified.localeCompare(b.modified) || a.topic.localeCompare(b.topic),
  );
  const pl = docs.filter((d) => d.language === "pl").length;
  const lang: LectureLanguage = group.textbook?.language ?? (pl * 2 >= docs.length ? "pl" : "en");
  const t = COURSE_TEXT[lang];
  const glossary: string[] = [];
  // One merged glossary in the pack's direction (PL → EN or EN → PL); a note in the other
  // language (a mixed course, "Inne") keeps its own glossary under it.
  const section = (title: string, body: string, docLang: LectureLanguage) => {
    if (docLang !== lang) return `# ${title}\n\n${plainMarkdown(body, docLang)}`;
    const g = takeGlossary(body);
    glossary.push(...g.entries);
    return `# ${title}\n\n${plainMarkdown(g.body, docLang)}`;
  };
  const blocks = [`# ${group.course} – ${t.file}\n\n${t.intro(docs.length, !!group.textbook)}`];
  if (group.textbook) {
    const tb = group.textbook;
    blocks.push(section(`${tb.topic}${tb.date ? ` (${t.updated} ${tb.date})` : ""}`, tb.body, tb.language));
  }
  for (const d of docs) blocks.push(section(`${d.topic}${d.date ? ` (${d.date})` : ""}`, d.body, d.language));
  const merged = mergeGlossary(glossary.map((e) => plainMarkdown(e, lang)));
  if (merged.length > 0) blocks.push(`# ${t.glossary}\n\n${merged.map((e) => `- ${e}`).join("\n")}`);
  return {
    fileName: `${safeFileName(group.course)} – ${t.file}.md`,
    text: `${blocks.join("\n\n---\n\n")}\n`,
    language: lang,
  };
}

// -- loading a lecture's transcript ------------------------------------------------

const MATERIAL_TTL = 5 * 60_000;
const materialCache = new Map<string, { at: number; value: Promise<RecordingInput[]> }>();

/**
 * The recordings (with their transcripts) a summary covers: its sessions'
 * and any the summary cites. Cached for a few minutes, so the reader can fetch
 * them when it opens and a button press finds them ready.
 */
export function loadLectureRecordings(userId: string, lecture: Pick<LectureSummary, "path" | "sessions" | "body">): Promise<RecordingInput[]> {
  const key = `${userId}|${lecture.path}`;
  const hit = materialCache.get(key);
  if (hit && Date.now() - hit.at < MATERIAL_TTL) return hit.value;
  const value = (async () => {
    const cols = "note_name, file_name, recorded_at, part, segments";
    const notes = [...new Set(lectureMoments(lecture.body).map((m) => m.note))];
    const [bySession, byNote] = await Promise.all([
      lecture.sessions.length > 0
        ? supabase.from("kos_recordings").select(cols).eq("user_id", userId).in("session_key", lecture.sessions)
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
    return [...rows.values()];
  })();
  materialCache.set(key, { at: Date.now(), value });
  value.catch(() => materialCache.delete(key));
  if (materialCache.size > 12) materialCache.delete(materialCache.keys().next().value as string);
  return value;
}

// -- the "knowledge" scope --------------------------------------------------------

/** The scope's whole text stays under this: short questions, not study sessions. */
export const KNOWLEDGE_MAX_CHARS = 20_000;
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
 * Summaries and notes only, never a transcript, within KNOWLEDGE_MAX_CHARS.
 */
export function knowledgeContext(files: VaultFile[], question?: string): string {
  const docs = files.filter((f) => isLectureSummaryPath(f.path)).map(parseLecture);
  const lectures = docs.filter((d) => d.kind === "summary");
  const textbooks = docs.filter((d) => d.kind === "textbook");
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
  const out: string[] = [];
  let size = 0;
  /** Adds a line while the text stays within the cap; false once it is full. */
  const push = (line: string): boolean => {
    if (size + line.length + 1 > KNOWLEDGE_MAX_CHARS) return false;
    out.push(line);
    size += line.length + 1;
    return true;
  };
  push(`Lecture summaries: ${lectures.length}${courses.size ? ` (${[...courses].map(([c, n]) => `${c} ${n}`).join(", ")})` : ""}. Knowledge notes: ${notes.length}.`);
  push(matched ? "Ranked by word overlap with the message, best first." : "Nothing shares words with the message, so the newest are listed.");
  push(
    'This is for short questions. To study a lecture, the user opens it in Archive > Lectures and presses "Ucz się w ChatGPT" or "Test w ChatGPT" (a study pack for ChatGPT) or "Przegadaj w Claude" (Claude Desktop reads the vault). Suggest that for a long session.',
  );
  if (textbooks.length > 0) {
    push(`Course textbooks (built from the summaries): ${textbooks.map((d) => `${courseOf(d)} (${d.path}${d.date ? `, ${d.date}` : ""})`).join("; ")}.`);
  }

  if (lectures.length > 0) {
    push("");
    push("All lectures (course · date · topic, language):");
    const sorted = [...lectures].sort(byDate);
    for (const d of sorted.slice(0, INDEXED_LECTURES)) if (!push(`- ${lectureLabel(d)} [${d.language}]`)) break;
    if (lectures.length > INDEXED_LECTURES) push(`- … and ${lectures.length - INDEXED_LECTURES} older`);
    const detailed = (matched ? rankedLectures.filter((r) => r.score > 0) : rankedLectures).slice(0, DETAILED_LECTURES);
    if (detailed.length > 0) {
      push("");
      push(matched ? "Best matching lectures:" : "Newest lectures:");
      for (const { item: d } of detailed) {
        const stressed = flat(replaceWikiLinks(d.stressed, (l) => (anchorOf(l) ? "" : l.alias || l.name)).replace(/^\s*[-*+]\s+/gm, "; "))
          .replace(/^;\s*/, "");
        push(
          `- ${lectureLabel(d)} [${d.language}] (${d.path}): ${clip(d.short, 320)}` + (stressed ? ` Stressed: ${clip(stressed, 260)}` : ""),
        );
      }
    }
  }

  if (notes.length > 0) {
    const picked = matched ? rankedNotes.filter((r) => r.score > 0).slice(0, NOTE_LINES) : rankedNotes.slice(0, RECENT_NOTES);
    if (picked.length > 0) {
      push("");
      push(
        matched
          ? "Best matching knowledge notes ([type] title (other-language name; course): statement. \"quote\" (where it was said)):"
          : "Newest knowledge notes:",
      );
      for (const { item } of picked) {
        const n = item.note;
        const extra = [item.aliases.length ? `= ${item.aliases.join(", ")}` : "", item.course ?? ""].filter(Boolean).join("; ");
        const where = n.sources[0] ? ` (${sourceLabel(n.sources[0])})` : "";
        const line =
          `- [${n.type || "note"}] ${n.title}${extra ? ` (${extra})` : ""}: ${clip(n.summary, 220)}` +
          (n.quote ? ` "${clip(n.quote, 150)}"` : "") +
          where;
        if (!push(line)) break;
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
