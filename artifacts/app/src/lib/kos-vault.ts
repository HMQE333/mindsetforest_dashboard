/**
 * Knowledge OS in the dashboard: the Obsidian vault's notes as the PC tracker
 * mirrors them (kos_vault_files: path + plain text), read here. Knowledge/
 * holds the atomic notes the Claude routine writes; Sessions/ one note per
 * recorded session with its status. Parsing lives here, not in the tracker, so
 * the view can change without anyone reinstalling the tracker.
 *
 * A knowledge note cites its recording as [[Recordings/<note>#^t0750]]: the
 * block id is the segment's start in whole seconds (0750 = 12:30).
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

/** Leading YAML frontmatter, the subset notes use: scalars, [inline] lists and "- item" lists. */
export function parseFrontmatter(raw: string): { data: Record<string, FrontValue>; body: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  if (!m) return { data: {}, body: raw };
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
  return { data, body: raw.slice(m[0].length) };
}

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
}

/** A link into Recordings/ as a source; null for any other link. */
export function sourceRef(l: WikiLink): SourceRef | null {
  if (!/^Recordings\//i.test(l.target)) return null;
  const t = l.anchor ? /^\^?t(\d+)$/i.exec(l.anchor) : null;
  return { note: l.name, seconds: t ? Number(t[1]) : null };
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
      const key = `${s.note}|${s.seconds}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push(s);
      }
    } else if (!/^Sessions\//i.test(l.target) && l.name !== name) links.add(l.name);
  }
  const blocks = rest.split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  const para = blocks.find((b) => !/^(>|#|[-*+]\s|\d+\.\s|related\s*:)/i.test(b));
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
  /** Names of the knowledge notes listed under "## Knowledge". */
  knowledge: string[];
}

export function parseSessionNote(f: VaultFile): SessionNote {
  const { data, body } = parseFrontmatter(f.content);
  const section = /^##\s+Knowledge\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(body);
  const continues = scalar(data.continues);
  return {
    key: noteName(f.path),
    path: f.path,
    vault: f.vault,
    status: (scalar(data.status) || "new").toLowerCase(),
    topic: scalar(data.topic),
    continues: continues ? wikiLinks(continues)[0]?.name ?? continues : null,
    knowledge: section ? [...new Set(wikiLinks(section[1]).map((l) => l.name))] : [],
  };
}

export interface VaultIndex {
  notes: KnowledgeNote[];
  sessions: Map<string, SessionNote>;
  /** Lower-cased note name -> note, as Obsidian resolves [[links]]. */
  byName: Map<string, KnowledgeNote>;
  /** Note name -> names of the notes that link to it. */
  backlinks: Map<string, string[]>;
}

export function indexVault(files: VaultFile[]): VaultIndex {
  const notes: KnowledgeNote[] = [];
  const sessions = new Map<string, SessionNote>();
  for (const f of files) {
    if (!/\.md$/i.test(f.path)) continue;
    if (/^Knowledge\//i.test(f.path)) notes.push(parseKnowledgeNote(f));
    else if (/^Sessions\//i.test(f.path)) {
      const s = parseSessionNote(f);
      sessions.set(s.key, s);
    }
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
  return { notes, sessions, byName, backlinks };
}

// -- recordings --------------------------------------------------------------------

export interface Segment {
  start: number;
  end: number;
  text: string;
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

/** "7 Oct, 14:03 · 12:30": where a source points, for a chip. */
export function sourceLabel(s: SourceRef): string {
  const d = noteDate(s.note);
  const when = d
    ? `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : s.note.length > 28 ? `${s.note.slice(0, 27)}…` : s.note;
  return s.seconds === null ? when : `${when} · ${clock(s.seconds)}`;
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
    .map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? "").trim() }))
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
}

/** Recordings grouped by session, newest first, with the session note and the notes citing them. */
export function groupSessions(rows: RecordingRow[], index: VaultIndex | null): Session[] {
  const map = new Map<string, RecordingRow[]>();
  for (const r of rows) map.set(r.session_key, [...(map.get(r.session_key) ?? []), r]);
  const citing = new Map<string, KnowledgeNote[]>();
  for (const n of index?.notes ?? []) {
    for (const note of new Set(n.sources.map((s) => s.note))) citing.set(note, [...(citing.get(note) ?? []), n]);
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
    });
  }
  return out.sort((a, b) => b.start.getTime() - a.start.getTime());
}
