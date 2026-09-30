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

export const DIRECTIONS = [
  { id: "direction", label: "Direction", icon: "🧭" },
  { id: "goals", label: "Goals", icon: "🎯" },
  { id: "wisdom", label: "Wisdom", icon: "📖" },
  { id: "freedom", label: "Freedom", icon: "🕊️" },
  { id: "protection", label: "Protection", icon: "🛡️" },
  { id: "creation", label: "Creation", icon: "🔨" },
  { id: "expression", label: "Expression", icon: "🎤" },
  { id: "community", label: "Community", icon: "🤝" },
] as const;

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
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  from_seed_id?: string | null;
};
