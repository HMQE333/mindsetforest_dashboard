import { CATEGORIES } from "./dashboard-data";

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

/** A #tag standing on its own; the # of a URL fragment (page#section) is not a tag. */
export const HASHTAG_REGEX = /(^|\s)#([a-zA-Z0-9_-]+)/g;

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
