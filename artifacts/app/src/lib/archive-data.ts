import { CATEGORIES } from "./dashboard-data";
import { isTypeTag, normaliseTag } from "./archive-tags";

/** Fired when archive blocks change from outside (e.g. AI saving a quick note). */
export const ARCHIVE_BLOCKS_CHANGED_EVENT = "archive-blocks-changed";

export const PILLARS = CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  iconUrl: c.iconUrl,
  color: c.color,
  colorVar: c.colorVar,
}));

/**
 * Rows for one insert: up to 100 blocks or about 1 MB, in order, so a big
 * import is a series of ordinary requests rather than one giant one. A single
 * block larger than the limit still goes alone.
 */
export function chunkForInsert<T>(items: T[], maxRows = 100, maxBytes = 1_000_000): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    const bytes = JSON.stringify(item).length;
    if (current.length > 0 && (current.length >= maxRows || size + bytes > maxBytes)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += bytes;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * "count:newest updated_at" of a list of notes: the same shape the Archive's
 * poll reads from the server, so a held list is current exactly when they match.
 */
export function archiveFingerprint(blocks: readonly Pick<ArchiveBlock, "updated_at">[]): string {
  let newest = "";
  let newestMs = -Infinity;
  for (const b of blocks) {
    const ms = Date.parse(b.updated_at);
    if (ms > newestMs || (ms === newestMs && b.updated_at > newest)) {
      newestMs = ms;
      newest = b.updated_at;
    }
  }
  return `${blocks.length}:${newest}`;
}

/** A save that stopped part way; `saved` blocks (the first ones, in order) made it. */
export class ArchiveSaveError extends Error {
  constructor(message: string, readonly saved: number) {
    super(message);
    this.name = "ArchiveSaveError";
  }
}

/** A character a link can contain, as the Links view reads links out of a note. */
const URL_CHAR = '[^\\s<>"{}|\\\\^`[\\]]';
export const LINK_REGEX = new RegExp(`https?:\\/\\/${URL_CHAR}+`, "g");

/** The title the inbox gives a note: its first 60 characters, on one line. */
export const autoTitle = (content: string) => content.slice(0, 60).replace(/\n/g, " ");

/**
 * The note without the given links: every occurrence of exactly those links
 * as the Links view reads them (never a longer link that starts with one), an
 * "[image]" tag in front of them, and the line or blank line each leaves
 * behind. The rest of the text is untouched. One pass, however many links.
 */
export function removeUrls(content: string, urls: Iterable<string>): string {
  const drop = new Set(urls);
  if (drop.size === 0) return content;
  const re = new RegExp(`(?:\\[image\\][ \\t]*)?(https?:\\/\\/${URL_CHAR}+)`, "g");
  const out: string[] = [];
  let dropBlank = false;
  let changed = false;
  for (const line of content.split("\n")) {
    if (dropBlank && line.trim() === "") { dropBlank = false; continue; }
    dropBlank = false;
    let hit = false;
    const rest = line.replace(re, (match, url: string) => {
      if (!drop.has(url)) return match;
      hit = true;
      return "";
    });
    if (!hit) { out.push(line); continue; }
    changed = true;
    const tidy = rest.replace(/([^ \t])[ \t]{2,}/g, "$1 ").replace(/[ \t\r]+$/, "");
    if (tidy.trim() !== "") { out.push(tidy); continue; }
    // The whole line was links: drop it, and one of the blank lines around it.
    dropBlank = out.length === 0 || out[out.length - 1].trim() === "";
  }
  if (!changed) return content;
  // Blank lines left at the edges of the note go too.
  const result = out.join("\n").replace(/^(?:[ \t\r]*\n)+/, "").replace(/(?:\n[ \t\r]*)+$/, "");
  return result.trim() === "" ? "" : result;
}

export const removeUrl = (content: string, url: string) => removeUrls(content, [url]);

/** Inbox items are separated by a line holding only ---, so text or a URL with --- inside stays whole. */
export function splitInboxItems(text: string): string[] {
  return text.split(/^[ \t]*---[ \t]*\r?$/m).map((s) => s.trim()).filter(Boolean);
}

/**
 * What one Save of the Inbox makes: one note by default (a paste is one
 * thing), or one note per part between "---" lines when he chose that.
 */
export function inboxNotes(text: string, split: boolean): string[] {
  if (split) return splitInboxItems(text);
  const whole = text.trim();
  return whole ? [whole] : [];
}

/** How long a just-saved note counts for "already saved". */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const sameText = (s: string) => s.replace(/\r\n?/g, "\n").trim();

/**
 * Which of `contents` (by index) are word for word a note saved in the last
 * ten minutes. `recent` is the list newest first (as the Archive holds it), so
 * the scan stops at the first older note; notes saved here this session can
 * be added to it.
 */
export function findRecentDuplicates(
  contents: readonly string[],
  recent: readonly Pick<ArchiveBlock, "content" | "created_at">[],
  now = Date.now(),
  windowMs = DUPLICATE_WINDOW_MS,
): { index: number; savedAt: string }[] {
  const fresh = new Map<string, string>();
  for (const b of recent) {
    const at = Date.parse(b.created_at);
    if (!(now - at <= windowMs)) {
      if (at < now - windowMs) break;
      continue;
    }
    const key = sameText(b.content ?? "");
    if (key && !fresh.has(key)) fresh.set(key, b.created_at);
  }
  const out: { index: number; savedAt: string }[] = [];
  contents.forEach((c, index) => {
    const savedAt = fresh.get(sameText(c));
    if (savedAt) out.push({ index, savedAt });
  });
  return out;
}

/** "3 min ago" for the duplicate notice. */
export function agoText(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return `${m} min ago`;
}

/**
 * A title short enough for a dialog, a toast or a chip: a link becomes its
 * host and "…" ("youtube.com…"), white space is collapsed, and anything past
 * `max` characters is cut with "…".
 */
export function shortTitle(title: string | null | undefined, max = 80): string {
  const t = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "Untitled";
  const link = /^(?:\[image\]\s*)?(https?:\/\/|www\.)([^/\s?#]+)\S*/i.exec(t);
  if (link) {
    const host = link[2].replace(/^www\./i, "");
    const rest = t.slice(link[0].length).trim();
    const shown = rest ? `${host}… ${rest}` : `${host}…`;
    return shown.length > max ? `${shown.slice(0, max - 1).trimEnd()}…` : shown;
  }
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}


/**
 * The tags typed into the edit dialog ("Książki, projekty/RybiaPaka, insight"),
 * read with the tag rules: normalised, each once, in the order typed, one type
 * at most (the last one typed). A stored value that is not a tag by the rules
 * (an old "2" read out of "#2") stays as it is when it is still in the field,
 * so saving the dialog never drops anything he did not remove; a new one is
 * left out.
 */
export function tagsFromInput(input: string, current: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const typed = raw.trim();
    if (!typed) continue;
    const tag = normaliseTag(typed);
    if (!tag) {
      if (current.includes(typed) && !out.includes(typed)) out.push(typed);
      continue;
    }
    if (isTypeTag(tag)) for (let i = out.length - 1; i >= 0; i--) if (isTypeTag(out[i])) out.splice(i, 1);
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

export type ArchiveBlock = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  pillars: string[];
  directions: string[];
  tags: string[];
  source_url: string | null;
  /** Kept at the top of the Library. */
  is_pinned: boolean;
  /** Bookmarked: listed in Bookmarks. Missing on rows from the search RPC. */
  is_starred?: boolean;
  created_at: string;
  updated_at: string;
  from_seed_id?: string | null;
};
