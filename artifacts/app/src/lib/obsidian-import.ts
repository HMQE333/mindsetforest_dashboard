import { unzipSync, strFromU8 } from "fflate";

export interface ParsedObsidianNote {
  fileName: string;
  title: string;
  content: string;
  tags: string[];
}

function stripQuotes(s: string): string {
  return s.replace(/^["']/, "").replace(/["']$/, "").trim();
}

/** Parse leading YAML frontmatter (a very small subset: scalars + simple lists). */
function parseFrontmatter(raw: string): { body: string; fm: Record<string, unknown> } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { body: raw, fm: {} };
  const fmBlock = match[1];
  const body = raw.slice(match[0].length);
  const fm: Record<string, unknown> = {};
  const lines = fmBlock.split(/\r?\n/);
  let currentKey: string | null = null;
  for (const line of lines) {
    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      const arr = Array.isArray(fm[currentKey]) ? (fm[currentKey] as string[]) : [];
      arr.push(stripQuotes(listItem[1]));
      fm[currentKey] = arr;
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      currentKey = kv[1];
      const rest = kv[2].trim();
      fm[currentKey] = rest === "" ? [] : stripQuotes(rest);
    }
  }
  return { body, fm };
}

function normalizeTag(s: string): string {
  return s.replace(/^#/, "").trim().toLowerCase();
}

function tagsFromFrontmatter(fm: Record<string, unknown>): string[] {
  const out: string[] = [];
  const raw = (fm.tags ?? fm.tag) as unknown;
  if (!raw) return out;
  const push = (s: string) => {
    const t = normalizeTag(s);
    if (t) out.push(t);
  };
  if (Array.isArray(raw)) {
    raw.forEach((x) => push(String(x)));
  } else {
    let s = String(raw).trim();
    if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
    s.split(",").forEach((x) => push(x));
  }
  return out;
}

/** Inline Obsidian tags like `#idea` or `#area/work`. Headings (`# Title`) are excluded (space after #). */
function inlineTags(body: string): string[] {
  const out: string[] = [];
  const re = /(?:^|[\s(])#([A-Za-z0-9_][\w/-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(normalizeTag(m[1]));
  }
  return out;
}

function baseName(path: string): string {
  const parts = path.split(/[/\\]/);
  const last = parts[parts.length - 1] || path;
  return last.replace(/\.md$/i, "");
}

/** Parse a single markdown note into { title, content, tags }. */
export function parseMarkdown(fileName: string, raw: string): ParsedObsidianNote {
  const { body, fm } = parseFrontmatter(raw);
  const h1 = /^#\s+(.+?)\s*$/m.exec(body);
  const fmTitle = typeof fm.title === "string" ? (fm.title as string).trim() : "";
  const title = (fmTitle || (h1 ? h1[1].trim() : "") || baseName(fileName) || "Untitled").slice(0, 200);

  const tags = Array.from(new Set([...tagsFromFrontmatter(fm), ...inlineTags(body)]));
  const content = body.trim();

  return { fileName, title, content, tags };
}

/** Extract all `.md` notes from a zipped vault, skipping Obsidian config/trash folders. */
export function parseVaultZip(buffer: Uint8Array): ParsedObsidianNote[] {
  const entries = unzipSync(buffer, {
    filter: (f) => {
      const name = f.name.toLowerCase();
      if (!name.endsWith(".md")) return false;
      if (name.includes("/.obsidian/") || name.startsWith(".obsidian/")) return false;
      if (name.includes("/.trash/") || name.startsWith(".trash/")) return false;
      return true;
    },
  });
  const notes: ParsedObsidianNote[] = [];
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue;
    try {
      notes.push(parseMarkdown(name, strFromU8(data)));
    } catch {
      // skip unreadable entry, don't abort the whole import
    }
  }
  return notes;
}

/** Fast local guess for keep/skip, used before AI and as a fallback if AI is unavailable. */
export function heuristicKeep(note: ParsedObsidianNote): { keep: boolean; reason: string } {
  const trimmed = note.content.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  if (trimmed.length < 30 || wordCount < 5) {
    return { keep: false, reason: "Very short / stub note" };
  }
  const lines = note.content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const meaningful = lines.filter(
    (l) => !/^#{1,6}\s/.test(l) && !/^[-*+]\s*$/.test(l) && !/^-\s*\[[ x]\]\s*$/i.test(l),
  );
  if (meaningful.length === 0) {
    return { keep: false, reason: "Only headings / empty scaffolding" };
  }
  return { keep: true, reason: "Substantive note" };
}
