/**
 * Knowledge OS in the dashboard: the Obsidian vault's notes as the PC tracker
 * mirrors them (kos_vault_files: path + plain text), read here. Knowledge/
 * holds the atomic notes the Claude routine writes; Sessions/ one note per
 * recorded session with its status. Parsing lives here, not in the tracker, so
 * the view can change without anyone reinstalling the tracker.
 *
 * A knowledge note cites its recording as [[Recordings/<note>#^t0750]]: the
 * block id is the segment's start in whole seconds (0750 = 12:30). An import
 * without times cites a paragraph instead: #^p0012 is paragraph 12.
 *
 * Vault format 2 adds Lectures/<Course>/<YYYY-MM-DD> <Topic>.md, one summary
 * per session, which the Wykłady tab reads. Older summaries live in
 * Sessions/Summary <session key>.md and are read as summaries of that session.
 * A course's textbook (`type: course-textbook`, Lectures/<Course>/_Podręcznik.md
 * or _Textbook.md), written by the routine from that course's summaries, is
 * read the same way and listed first in its course.
 */

export type FrontValue = string | string[];

export interface VaultFile {
  path: string;
  vault: string;
  content: string;
  modified_at: string;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      return String(JSON.parse(t));
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

/** "[a, "b, c", [[x]]]" -> ["a", "b, c", "[[x]]"]: commas inside quotes or [[links]] stay. */
function inlineList(s: string): string[] {
  const inner = s.trim().slice(1, -1);
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let depth = 0;
  for (const ch of inner) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === "[") {
      depth++;
      cur += ch;
    } else if (ch === "]") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter((x) => x !== "");
}

/**
 * Leading YAML frontmatter, the subset notes use: scalars, [inline] lists and "- item" lists.
 * The body comes back with LF line ends (a note saved on Windows may have CRLF).
 */
export function parseFrontmatter(raw: string): { data: Record<string, FrontValue>; body: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  if (!m) return { data: {}, body: lf(raw) };
  const data: Record<string, FrontValue> = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const arr = Array.isArray(data[listKey]) ? (data[listKey] as string[]) : [];
      arr.push(unquote(item[1]));
      data[listKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const rest = kv[2].trim();
    listKey = rest === "" ? key : null;
    if (rest === "") data[key] = [];
    else if (rest.startsWith("[") && rest.endsWith("]") && !rest.startsWith("[[")) data[key] = inlineList(rest);
    else data[key] = unquote(rest);
  }
  return { data, body: lf(raw.slice(m[0].length)) };
}

const lf = (s: string) => (s.includes("\r") ? s.replace(/\r\n?/g, "\n") : s);

function scalar(v: FrontValue | undefined): string | null {
  if (v === undefined) return null;
  const s = (Array.isArray(v) ? v[0] ?? "" : v).trim();
  return s || null;
}

function list(v: FrontValue | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export interface WikiLink {
  /** As written, without the folder: "Reciprocity", "2026-10-07 14-03-12 lecture". */
  name: string;
  /** As written, with any folder: "Recordings/2026-10-07 14-03-12 lecture". */
  target: string;
  /** "^t0750" or a heading, without the "#". */
  anchor: string | null;
  alias: string | null;
}

const WIKI = /!?\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function wikiLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of text.matchAll(WIKI)) out.push(toLink(m));
  return out;
}

function toLink(m: RegExpMatchArray): WikiLink {
  const target = m[1].trim().replace(/\.md$/i, "");
  return {
    target,
    name: target.split("/").pop() || target,
    anchor: m[2]?.trim() || null,
    alias: m[3]?.trim() || null,
  };
}

/** Text with [[links]] replaced through `fn` (default: the alias or the note's name). */
export function replaceWikiLinks(text: string, fn: (l: WikiLink) => string = (l) => l.alias || l.name): string {
  return text.replace(WIKI, (...args) => fn(toLink(args as unknown as RegExpMatchArray)));
}

export interface SourceRef {
  /** The recording's note name (Recordings/<note>.md). */
  note: string;
  /** Start of the cited segment, in seconds from the start of that recording. */
  seconds: number | null;
  /** The cited paragraph (1-based) of an import without times (#^p0012); only set for those. */
  paragraph?: number;
}

/**
 * A link to a recording as a source: anything in Recordings/, or any link to a
 * transcript moment (#^tNNNN, or #^pNNNN for a paragraph), since Obsidian
 * resolves [[name#^t0750]] without the folder and a routine may well write it
 * that way. Null for other links.
 */
export function sourceRef(l: WikiLink): SourceRef | null {
  const a = l.anchor ? /^\^?([tp])(\d+)$/i.exec(l.anchor) : null;
  if (!a && !/^Recordings\//i.test(l.target)) return null;
  if (a && a[1].toLowerCase() === "p") return { note: l.name, seconds: null, paragraph: Number(a[2]) };
  return { note: l.name, seconds: a ? Number(a[2]) : null };
}

/** "12:34" for a moment, "¶12" for a paragraph, null for a link to the whole recording. */
export function momentLabel(s: Pick<SourceRef, "seconds" | "paragraph">): string | null {
  if (s.paragraph !== undefined) return `¶${s.paragraph}`;
  return s.seconds === null ? null : clock(s.seconds);
}

export const noteName = (path: string) => (path.split("/").pop() || path).replace(/\.md$/i, "");

/** Opens the note in Obsidian; the vault is named after its folder. */
export function obsidianUri(vault: string, path: string): string {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/i, ""))}`;
}

export const KNOWLEDGE_TYPES: Record<string, { icon: string; label: string }> = {
  concept: { icon: "💡", label: "Concept" },
  claim: { icon: "📣", label: "Claim" },
  principle: { icon: "🧭", label: "Principle" },
  definition: { icon: "📖", label: "Definition" },
  model: { icon: "🧩", label: "Model" },
  example: { icon: "🔎", label: "Example" },
  observation: { icon: "👁️", label: "Observation" },
  question: { icon: "❓", label: "Question" },
  decision: { icon: "✅", label: "Decision" },
  contradiction: { icon: "⚔️", label: "Contradiction" },
  assumption: { icon: "🤔", label: "Assumption" },
};

export const typeInfo = (type: string) =>
  KNOWLEDGE_TYPES[type] ?? { icon: "📝", label: type ? type[0].toUpperCase() + type.slice(1) : "Note" };

export interface KnowledgeNote {
  path: string;
  name: string;
  vault: string;
  title: string;
  type: string;
  confidence: "high" | "medium" | "low" | null;
  created: string | null;
  modified: string;
  /** Every recording segment it cites (frontmatter first, then the body), without repeats. */
  sources: SourceRef[];
  /** Names of the other notes it links to (not recordings, not sessions). */
  links: string[];
  /** The body without the frontmatter and the leading "# title". */
  body: string;
  /** The first paragraph in plain words. */
  summary: string;
  /** The first "> quote", without its link. */
  quote: string | null;
  /** Other names for it, mostly the term in the other language (format 2). */
  aliases: string[];
  /** The course it came from (format 2), else null. */
  course: string | null;
}

function stripTitle(body: string): { title: string | null; rest: string } {
  const m = /^\s*#\s+(.+?)\s*(?:\r?\n|$)/.exec(body);
  return m ? { title: m[1].trim(), rest: body.slice(m[0].length) } : { title: null, rest: body };
}

const plain = (s: string) =>
  replaceWikiLinks(s)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export function parseKnowledgeNote(f: VaultFile): KnowledgeNote {
  const { data, body } = parseFrontmatter(f.content);
  const name = noteName(f.path);
  const { title, rest } = stripTitle(body);
  const sources: SourceRef[] = [];
  const seen = new Set<string>();
  const links = new Set<string>();
  const all = [...list(data.sources).flatMap(wikiLinks), ...wikiLinks(rest)];
  for (const l of all) {
    const s = sourceRef(l);
    if (s) {
      const key = `${s.note}|${s.seconds}|${s.paragraph ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push(s);
      }
    } else if (!/^Sessions\//i.test(l.target) && l.name !== name) links.add(l.name);
  }
  const blocks = rest.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  const para = blocks.find((b) => !/^(>|#|[-*+]\s|\d+\.\s|(?:related|powiązane|powiazane)\s*:)/i.test(b));
  const quoteBlock = blocks.find((b) => b.startsWith(">"));
  const quote = quoteBlock
    ? plain(
        quoteBlock
          .split(/\r?\n/)
          .map((l) => l.replace(/^>\s?/, ""))
          .join(" ")
          .replace(WIKI, "")
          .replace(/\s*[(—–-]*\s*\)?\s*$/, ""),
      ).replace(/^["“]|["”]$/g, "") || null
    : null;
  const conf = scalar(data.confidence)?.toLowerCase();
  return {
    path: f.path,
    name,
    vault: f.vault,
    title: scalar(data.title) || title || name,
    type: (scalar(data.type) || "").toLowerCase(),
    confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : null,
    created: scalar(data.created),
    modified: f.modified_at,
    sources,
    links: [...links],
    body: rest.trim(),
    summary: para ? plain(para) : "",
    quote,
    aliases: list(data.aliases).map((a) => a.trim()).filter(Boolean),
    course: scalar(data.course),
  };
}

export interface SessionNote {
  /** The session's key, which is its file name: "2026-10-07 14-03". */
  key: string;
  path: string;
  vault: string;
  status: string;
  topic: string | null;
  continues: string | null;
  /** Names of the knowledge notes listed under "## Knowledge" (not the summary). */
  knowledge: string[];
  /** The lecture summary the routine linked (`summary:`), as a vault path without ".md". */
  summary: string | null;
  /** When the note last changed: a session still "new" long after this is waiting for the routine. */
  modified: string;
}

export function parseSessionNote(f: VaultFile): SessionNote {
  const { data, body } = parseFrontmatter(f.content);
  const section = /^##\s+Knowledge\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(body);
  const continues = scalar(data.continues);
  const summary = scalar(data.summary);
  return {
    key: noteName(f.path),
    path: f.path,
    vault: f.vault,
    status: (scalar(data.status) || "new").toLowerCase(),
    topic: scalar(data.topic),
    continues: continues ? wikiLinks(continues)[0]?.name ?? continues : null,
    knowledge: section
      ? [...new Set(wikiLinks(section[1]).filter((l) => !/^Lectures\//i.test(l.target)).map((l) => l.name))]
      : [],
    summary: summary ? wikiLinks(summary)[0]?.target ?? summary.replace(/\.md$/i, "") : null,
    modified: f.modified_at,
  };
}

// -- lecture summaries (format 2) ------------------------------------------------------

export type LectureLanguage = "pl" | "en";
export type LectureSource = "recording" | "import" | "youtube";
/**
 * What a "## " section of a summary is, by its heading in either language. A
 * textbook adds its one-page compression and its diagnostic questions.
 */
export type LectureSectionKind =
  | "short"
  | "map"
  | "stressed"
  | "clarify"
  | "concepts"
  | "memorise"
  | "compression"
  | "questions"
  | "section";
/** A summary of one lecture, or a course's textbook built from its summaries. */
export type LectureKind = "summary" | "textbook";

export interface LectureSection {
  /** The heading as written, links included: "1. Zdanie logiczne [[Recordings/…#^t0754|12:34]]". */
  heading: string;
  /** The heading in plain words, without its moment link: "1. Zdanie logiczne". */
  title: string;
  kind: LectureSectionKind;
  /** Where the section starts in the transcript, from a moment link in its heading. */
  moment: SourceRef | null;
}

export interface LectureSummary {
  /** "textbook" for a course's `type: course-textbook` note. */
  kind: LectureKind;
  path: string;
  /** The file name: "2026-10-11 Zdania logiczne i zbiory", "Summary 2026-10-13 15-53". */
  name: string;
  vault: string;
  modified: string;
  /** As in the frontmatter; null when unknown (every legacy summary). */
  course: string | null;
  topic: string;
  /** "2026-10-11", or null. */
  date: string | null;
  /** The language of the whole note, which is the source's. */
  language: LectureLanguage;
  source: LectureSource;
  /** Keys of the sessions it covers ("2026-10-11 13-32"). */
  sessions: string[];
  /** Sessions/Summary <key>.md, written before format 2. */
  legacy: boolean;
  /** Without the frontmatter and a leading "# title". */
  body: string;
  /** "W skrócie" / "In short" in plain words; for a legacy note its first paragraph. */
  short: string;
  /** Its "## " sections in order. */
  sections: LectureSection[];
  /** A textbook's `summaries:`, as link targets ("Lectures/Logika/2026-10-11 Zdania"); empty for a summary. */
  summaries: string[];
}

/** A v2 summary in Lectures/, or a legacy one as Sessions/Summary <session key>.md. */
export function isLectureSummaryPath(path: string): boolean {
  return /^Lectures\/.+\.md$/i.test(path) || /^Sessions\/Summary .+\.md$/i.test(path);
}

/** Lower case without diacritics ("Ł" has none to drop, so it is mapped): "Wykłady" -> "wyklady". */
export function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
}

export function lectureSectionKind(heading: string): LectureSectionKind {
  const h = fold(heading.trim()).replace(/^[^\p{L}\p{N}]+/u, "");
  if (/^(w skrocie|in short)\b/.test(h)) return "short";
  // "## Mapa wykładu" / "## Lecture map" (a textbook: "Mapa przedmiotu", "Course map").
  if (/^(mapa( wykladu| przedmiotu| kursu| tematu)?|(lecture|course|subject|topic) map|map of the (lecture|course|subject))(\s*[(:–—-].*)?$/.test(h)) return "map";
  if (/^(na co prowadz|what the lecturer (stress|emphas))/.test(h)) return "stressed";
  if (/^(do wyjasnienia|to clarify)\b/.test(h)) return "clarify";
  if (/^(pojecia|concepts)\b/.test(h)) return "concepts";
  if (/^(do zapamietania|co (trzeba )?zapamietac|to memori[sz]e|memori[sz]e or derive|what (must|to) (be )?memori[sz]e)/.test(h)) return "memorise";
  if (/^(caly (przedmiot|wyklad) na jednej stronie|the (whole )?(course|lecture) on one page|kompresja\b|compression\b)/.test(h)) return "compression";
  if (/^(pytania (sprawdzajace|diagnostyczne)|diagnostic questions)/.test(h)) return "questions";
  return "section";
}

/** The note's own `type: course-textbook`, or the routine's file name for one. */
export function isTextbookFile(path: string, type: string | null | undefined): boolean {
  if ((type ?? "").trim().toLowerCase() === "course-textbook") return true;
  return /^Lectures\/[^/]+\/_(Podręcznik|Podrecznik|Textbook)\.md$/i.test(path);
}

const PL_HINT = /[ąćęłńśźż]|(?:^|\s)(się|jest|nie|oraz|że|dla|przez|są|który|która|które)(?=\s|[.,;:]|$)/gi;
const EN_HINT = /(?:^|\s)(the|and|is|of|that|for|are|with|this|which|from)(?=\s|[.,;:]|$)/gi;

/** For a note without `language:`: Polish letters and words against English ones. */
export function guessLanguage(text: string): LectureLanguage {
  const pl = text.match(PL_HINT)?.length ?? 0;
  const en = text.match(EN_HINT)?.length ?? 0;
  return pl > en ? "pl" : "en";
}

/** The "## " sections of a body, with the text before the first one as the preamble. */
export function splitLectureBody(body: string): { preamble: string; sections: { heading: string; text: string }[] } {
  const sections: { heading: string; text: string }[] = [];
  let preamble = "";
  let current: { heading: string; lines: string[] } | null = null;
  const pre: string[] = [];
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const f = /^\s*(?:>\s*)*(```+|~~~+)/.exec(line);
    if (f) fence = fence === null ? f[1][0] : f[1][0] === fence ? null : fence;
    const h = fence === null && !f ? /^##[ \t]+(.+?)[ \t]*$/.exec(line) : null;
    if (h) {
      if (current) sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
      current = { heading: h[1], lines: [] };
    } else if (current) current.lines.push(line);
    else pre.push(line);
  }
  if (current) sections.push({ heading: current.heading, text: current.lines.join("\n").trim() });
  preamble = pre.join("\n").trim();
  return { preamble, sections };
}

/** Text with links as their labels, math and emphasis marks dropped: for cards and search. */
export function plainText(s: string): string {
  return replaceWikiLinks(s, (l) => (sourceRef(l) ? "" : l.alias || l.name))
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*>\s?\[![^\]]+\][+-]?/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const asLink = (v: string) => wikiLinks(v)[0] ?? null;

export function parseLectureSummary(f: VaultFile): LectureSummary {
  const { data, body: raw } = parseFrontmatter(f.content);
  const name = noteName(f.path);
  const legacy = /^Sessions\//i.test(f.path);
  const textbook = !legacy && isTextbookFile(f.path, scalar(data.type));
  const { title, rest } = stripTitle(raw);
  const body = rest.trim();
  const { preamble, sections } = splitLectureBody(body);
  const legacyKey = /^Summary (.+)$/i.exec(name)?.[1] ?? null;
  const sessions = [...list(data.sessions), ...list(data.session)]
    .map((v) => asLink(v)?.name ?? noteName(v))
    .filter(Boolean);
  if (sessions.length === 0 && legacyKey) sessions.push(legacyKey);
  const lang = scalar(data.language)?.toLowerCase();
  const src = scalar(data.source)?.toLowerCase();
  const short = sections.find((x) => lectureSectionKind(x.heading) === "short")?.text;
  const firstPara = (preamble || body)
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .find((b) => b && !/^(>|#|```|\$\$|[-*+]\s|\|)/.test(b));
  const datePart = (s: string | null | undefined) => (s ? /^(\d{4}-\d{2}-\d{2})/.exec(s)?.[1] ?? null : null);
  // A legacy note's "# Summary 2026-10-13 15-53" is its file name, not a topic.
  const heading = title && !/^summary\s+\d{4}-/i.test(title) ? title : null;
  const language: LectureLanguage = lang === "pl" || lang === "en" ? lang : guessLanguage(body);
  const parsedSections = sections.map((x) => {
    const links = wikiLinks(x.heading);
    const moment = links.map(sourceRef).find((r): r is SourceRef => r !== null) ?? null;
    return {
      heading: x.heading,
      title: replaceWikiLinks(x.heading, (l) => (sourceRef(l) ? "" : l.alias || l.name)).replace(/\s+/g, " ").trim(),
      kind: lectureSectionKind(x.heading),
      moment,
    };
  });
  if (textbook) {
    // The course is the frontmatter's, else the folder the routine wrote it in.
    const folder = /^Lectures\/([^/]+)\//i.exec(f.path)?.[1] ?? null;
    return {
      kind: "textbook",
      path: f.path,
      name,
      vault: f.vault,
      modified: f.modified_at,
      course: scalar(data.course) || folder,
      topic: scalar(data.topic) || heading || (language === "pl" ? "Podręcznik przedmiotu" : "Course textbook"),
      date: datePart(scalar(data.updated)) || datePart(scalar(data.date)) || datePart(f.modified_at),
      language,
      source: "recording",
      sessions: [],
      legacy: false,
      body,
      short: plainText(short ?? firstPara ?? ""),
      sections: parsedSections,
      summaries: [...new Set(list(data.summaries).map((v) => asLink(v)?.target ?? v.replace(/\.md$/i, "").trim()).filter(Boolean))],
    };
  }
  return {
    kind: "summary",
    path: f.path,
    name,
    vault: f.vault,
    modified: f.modified_at,
    course: scalar(data.course),
    topic: scalar(data.topic) || heading || name.replace(/^(summary\s+)?\d{4}-\d{2}-\d{2}( \d{2}-\d{2})?\s*/i, "") || legacyKey || name,
    date: datePart(scalar(data.date)) || datePart(name) || datePart(legacyKey) || datePart(scalar(data.created)),
    language,
    source: src === "import" || src === "youtube" ? src : "recording",
    sessions: [...new Set(sessions)],
    legacy,
    body,
    short: plainText(short ?? firstPara ?? ""),
    sections: parsedSections,
    summaries: [],
  };
}

/** The course a summary is listed under: unknown courses (every legacy summary) go to "Inne". */
export const OTHER_COURSE = "Inne";
export const courseOf = (l: Pick<LectureSummary, "course">) => l.course?.trim() || OTHER_COURSE;

export interface CourseGroup {
  course: string;
  lectures: LectureSummary[];
  /** The course's textbook, listed before its lectures; null when there is none (or it does not match the search). */
  textbook: LectureSummary | null;
}

/**
 * Summaries grouped by course, newest first inside a course and the course
 * with the newest lecture first ("Inne" last), each with its textbook. Every
 * word of `query` has to appear in the course, topic or text; case and
 * diacritics do not matter. A course whose textbook matches is listed even
 * when none of its lectures does.
 */
export function groupLectures(lectures: LectureSummary[], query = "", textbooks: LectureSummary[] = []): CourseGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hay = (l: LectureSummary) => fold(`${courseOf(l)}\n${l.topic}\n${l.date ?? ""}\n${l.body}`);
  const matches = (l: LectureSummary) => {
    if (!words.length) return true;
    const h = hay(l);
    return words.every((w) => h.includes(w));
  };
  const newest = (a: LectureSummary, b: LectureSummary) =>
    (b.date ?? "").localeCompare(a.date ?? "") || b.modified.localeCompare(a.modified) || a.topic.localeCompare(b.topic);
  const map = new Map<string, CourseGroup>();
  const group = (course: string) => {
    let g = map.get(course);
    if (!g) map.set(course, (g = { course, lectures: [], textbook: null }));
    return g;
  };
  for (const l of lectures.filter(matches).sort(newest)) group(courseOf(l)).lectures.push(l);
  // One textbook per course: the newest, if the routine ever wrote two.
  for (const t of [...textbooks].sort((a, b) => b.modified.localeCompare(a.modified))) {
    if (!matches(t) || map.get(courseOf(t))?.textbook) continue;
    group(courseOf(t)).textbook = t;
  }
  const head = (g: CourseGroup) => g.lectures[0] ?? g.textbook!;
  return [...map.values()].sort(
    (a, b) =>
      (a.course === OTHER_COURSE ? 1 : 0) - (b.course === OTHER_COURSE ? 1 : 0) ||
      newest(head(a), head(b)) ||
      a.course.localeCompare(b.course),
  );
}

// -- the routine's log -------------------------------------------------------------------

export interface RoutineEntry {
  /** "2026-10-11 15:05", as in the entry's heading. */
  when: string;
  /** The entry's "- key: value" lines in order: sessions, summaries, notes, problems. */
  items: { key: string; value: string }[];
  /** The "problems:" line, null when it says none. */
  problems: string | null;
}

export interface RoutineLog {
  /** The newest of `last_run:` and the last entry's time, local; null when neither parses. */
  lastRun: Date | null;
  last: RoutineEntry | null;
}

export const ROUTINE_LOG_PATH = "_SYSTEM/routine-log.md";

/** "2026-10-11 15:05" (or "…T15:05", seconds optional) as a local time. */
export function parseLocalStamp(s: string | null | undefined): Date | null {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2})[:-](\d{2}))?/.exec(s.trim()) : null;
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)) : null;
}

/** `_SYSTEM/routine-log.md`: `last_run:` in the frontmatter and the last "## <time>" entry. */
export function parseRoutineLog(content: string): RoutineLog {
  const { data, body } = parseFrontmatter(content);
  let last: RoutineEntry | null = null;
  const re = /^##[ \t]+(\d{4}-\d{2}-\d{2}[ T]\d{1,2}[:-]\d{2})[^\n]*\n([\s\S]*?)(?=^##[ \t]|(?![\s\S]))/gm;
  for (const m of body.matchAll(re)) {
    const items: { key: string; value: string }[] = [];
    for (const line of m[2].split(/\r?\n/)) {
      const kv = /^\s*[-*]\s+([^:]+):\s*(.*)$/.exec(line);
      if (kv) items.push({ key: kv[1].trim().toLowerCase(), value: kv[2].trim() });
    }
    const p = items.find((i) => /^(problems?|problemy)$/.test(i.key))?.value ?? "";
    last = { when: m[1], items, problems: !p || /^(none|brak|nie ma|-)\.?$/i.test(p) ? null : p };
  }
  const stamps = [parseLocalStamp(scalar(data.last_run)), parseLocalStamp(last?.when)].filter((d): d is Date => d !== null);
  return { lastRun: stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null, last };
}

// -- the index ---------------------------------------------------------------------------

export interface VaultIndex {
  notes: KnowledgeNote[];
  sessions: Map<string, SessionNote>;
  /** Lower-cased note name -> note, as Obsidian resolves [[links]]. */
  byName: Map<string, KnowledgeNote>;
  /** Note name -> names of the notes that link to it. */
  backlinks: Map<string, string[]>;
  /** Lecture summaries, Lectures/ and the legacy Sessions/Summary notes. */
  lectures: LectureSummary[];
  /** Course textbooks (`type: course-textbook`), at most one per course in practice. */
  textbooks: LectureSummary[];
  /** Lower-cased path without ".md", and lower-cased file name -> summary or textbook. */
  lectureByPath: Map<string, LectureSummary>;
  lectureByName: Map<string, LectureSummary>;
  /** The routine's log, when the tracker mirrors it (1.3 and later). */
  routineLog: RoutineLog | null;
}

export function indexVault(files: VaultFile[]): VaultIndex {
  const notes: KnowledgeNote[] = [];
  const sessions = new Map<string, SessionNote>();
  const lectures: LectureSummary[] = [];
  const textbooks: LectureSummary[] = [];
  let routineLog: RoutineLog | null = null;
  for (const f of files) {
    if (!/\.md$/i.test(f.path)) continue;
    if (/^Knowledge\//i.test(f.path)) notes.push(parseKnowledgeNote(f));
    else if (isLectureSummaryPath(f.path)) {
      const l = parseLectureSummary(f);
      (l.kind === "textbook" ? textbooks : lectures).push(l);
    } else if (/^Sessions\//i.test(f.path)) {
      const s = parseSessionNote(f);
      sessions.set(s.key, s);
    } else if (f.path.toLowerCase() === ROUTINE_LOG_PATH.toLowerCase()) routineLog = parseRoutineLog(f.content);
  }
  const byName = new Map(notes.map((n) => [n.name.toLowerCase(), n]));
  const backlinks = new Map<string, string[]>();
  for (const n of notes) {
    for (const l of n.links) {
      const to = byName.get(l.toLowerCase());
      if (!to) continue;
      const arr = backlinks.get(to.name) ?? [];
      if (!arr.includes(n.name)) arr.push(n.name);
      backlinks.set(to.name, arr);
    }
  }
  const all = [...lectures, ...textbooks];
  const lectureByPath = new Map(all.map((l) => [l.path.replace(/\.md$/i, "").toLowerCase(), l]));
  const lectureByName = new Map(all.map((l) => [l.name.toLowerCase(), l]));
  return { notes, sessions, byName, backlinks, lectures, textbooks, lectureByPath, lectureByName, routineLog };
}

export type LinkTarget =
  | { kind: "moment"; ref: SourceRef }
  | { kind: "note"; note: KnowledgeNote }
  | { kind: "lecture"; lecture: LectureSummary }
  | { kind: "missing" };

/** What a [[link]] in a summary points at, resolved as Obsidian does: the path first, then the name. */
export function resolveLink(index: Pick<VaultIndex, "byName" | "lectureByPath" | "lectureByName">, l: WikiLink): LinkTarget {
  const ref = sourceRef(l);
  if (ref) return { kind: "moment", ref };
  const key = l.target.toLowerCase();
  const lecture = index.lectureByPath.get(key) ?? (key.includes("/") ? undefined : index.lectureByName.get(key));
  if (lecture) return { kind: "lecture", lecture };
  if (!/^(Sessions|Lectures|_SYSTEM)\//i.test(l.target) && (!key.includes("/") || /^Knowledge\//i.test(l.target))) {
    const note = index.byName.get(l.name.toLowerCase());
    if (note) return { kind: "note", note };
  }
  return { kind: "missing" };
}

/** Sessions still waiting for the routine (`status: new`) whose note has not changed for `hours`. */
export function staleSessions(index: Pick<VaultIndex, "sessions">, now = new Date(), hours = 24): SessionNote[] {
  const limit = now.getTime() - hours * 3600_000;
  return [...index.sessions.values()].filter((s) => {
    const t = Date.parse(s.modified);
    return s.status === "new" && Number.isFinite(t) && t < limit;
  });
}

// -- recordings --------------------------------------------------------------------

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** The paragraph number (1-based) of an import without times; the anchor ^pNNNN points at it. */
  p?: number;
}

export interface RecordingRow {
  id: string;
  file_name: string;
  note_name: string | null;
  recorded_at: string;
  duration_seconds: number;
  session_key: string;
  part: number;
  language: string | null;
  model: string;
  /** "recording" (a transcribed MP3), "import" (a file from the vault's Import/ folder) or "youtube"; absent before tracker 1.3. */
  source?: string | null;
  /** An import's file or folder name, as the user downloaded it. */
  original_name?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The recording's note name: stored since the tracker sends it; for older rows
 * rebuilt as the tracker builds it (local start time + the file's name).
 */
export function recordingNote(r: Pick<RecordingRow, "note_name" | "recorded_at" | "file_name">): string {
  if (r.note_name) return r.note_name;
  const d = new Date(r.recorded_at);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${stamp} ${r.file_name.replace(/\.[^.]+$/, "")}`.replace(/\//g, "-");
}

/** The start time in a recording's note name ("2026-10-07 14-03-12 ..."), local. */
export function noteDate(note: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})/.exec(note);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

/** "7 Oct, 14:03 · 12:30" ("7 paź, 14:03 · 12:30" with locale "pl-PL"): where a source points, for a chip. */
export function sourceLabel(s: SourceRef, locale = "en-GB"): string {
  const d = noteDate(s.note);
  const when = d
    ? `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : s.note.length > 28 ? `${s.note.slice(0, 27)}…` : s.note;
  const at = momentLabel(s);
  return at === null ? when : `${when} · ${at}`;
}

/** 750 -> "12:30", 4000 -> "1:06:40". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** 4320 -> "1h 12m", 300 -> "5 min". */
export function durationLabel(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}

/** A transcript without times (an imported text): its moments are paragraphs, not seconds. */
export const isUntimed = (segments: Segment[]) => segments.length > 0 && segments.every((s) => !s.start && !s.end);

/** The segment holding paragraph `n` (its `p`, else the n-th segment). */
export function segmentForParagraph(segments: Segment[], n: number): number {
  const i = segments.findIndex((s) => s.p === n);
  if (i >= 0) return i;
  return Math.min(segments.length - 1, Math.max(0, n - 1));
}

/** The segment playing at `seconds` (the last one that started by then). */
export function segmentAt(segments: Segment[], seconds: number): number {
  let found = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start <= seconds + 0.5) found = i;
    else break;
  }
  return found < 0 ? 0 : found;
}

export function asSegments(v: unknown): Segment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s, i) => {
      const seg: Segment = { start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? "").trim() };
      const p = Number(s.p ?? s.paragraph);
      if (Number.isFinite(p) && p > 0) seg.p = p;
      else if (!seg.start && !seg.end) seg.p = i + 1;
      return seg;
    })
    .filter((s) => s.text);
}

export interface Session {
  key: string;
  start: Date;
  parts: RecordingRow[];
  seconds: number;
  note: SessionNote | null;
  /** Knowledge notes citing any of its parts or listed in its session note. */
  knowledge: KnowledgeNote[];
  /** Its lecture summary: one listing this session, or the one its session note links. */
  summary: LectureSummary | null;
}

/** Recordings grouped by session, newest first, with the session note and the notes citing them. */
export function groupSessions(rows: RecordingRow[], index: VaultIndex | null): Session[] {
  const map = new Map<string, RecordingRow[]>();
  for (const r of rows) map.set(r.session_key, [...(map.get(r.session_key) ?? []), r]);
  const citing = new Map<string, KnowledgeNote[]>();
  for (const n of index?.notes ?? []) {
    for (const note of new Set(n.sources.map((s) => s.note))) citing.set(note, [...(citing.get(note) ?? []), n]);
  }
  const summaryOf = new Map<string, LectureSummary>();
  for (const l of index?.lectures ?? []) {
    for (const k of l.sessions) {
      const had = summaryOf.get(k);
      // A v2 summary wins over a legacy one for the same session.
      if (!had || (had.legacy && !l.legacy)) summaryOf.set(k, l);
    }
  }
  const out: Session[] = [];
  for (const [key, parts] of map) {
    parts.sort((a, b) => a.part - b.part || a.recorded_at.localeCompare(b.recorded_at));
    const knowledge = new Set<KnowledgeNote>();
    for (const p of parts) for (const n of citing.get(recordingNote(p)) ?? []) knowledge.add(n);
    for (const name of index?.sessions.get(key)?.knowledge ?? []) {
      const n = index?.byName.get(name.toLowerCase());
      if (n) knowledge.add(n);
    }
    out.push({
      key,
      start: new Date(parts[0].recorded_at),
      parts,
      seconds: parts.reduce((s, p) => s + Number(p.duration_seconds), 0),
      note: index?.sessions.get(key) ?? null,
      knowledge: [...knowledge],
      summary: (() => {
        const linked = index?.sessions.get(key)?.summary;
        return (linked ? index?.lectureByPath.get(linked.toLowerCase()) : undefined) ?? summaryOf.get(key) ?? null;
      })(),
    });
  }
  return out.sort((a, b) => b.start.getTime() - a.start.getTime());
}
