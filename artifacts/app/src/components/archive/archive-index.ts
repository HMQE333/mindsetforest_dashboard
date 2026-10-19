import { LINK_REGEX, type ArchiveBlock } from "@/lib/archive-data";

/**
 * What the Archive views read out of a note, worked out once per note.
 *
 * Every view used to run its regexes over every note's full text on every
 * render: the Library card for its thumbnails, the tab bar for its link and
 * image counts, Links for its rows. One pasted list of ~10,000 links is a
 * 500k-character note, so that was most of the cost of typing a letter.
 *
 * The cache is keyed by the note object. The list comes from React Query,
 * which keeps an unchanged row the same object across refetches, and an edit
 * makes a new object, so a note is read again exactly when it changed.
 */

const IMAGE_TAG_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;
const BARE_IMG_REGEX = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)/gi;
const VIDEO_DOMAINS = ["youtube.com", "youtu.be", "vimeo.com", "twitch.tv", "dailymotion.com"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"];

/** Characters of a note shown on a Library card (three lines show; the rest stays out of the page). */
export const PREVIEW_CHARS = 600;
/** Characters of a note's own text shown under each of its links. */
export const LINK_NOTE_CHARS = 200;

export type LinkKind = "video" | "image" | "link";

export interface LinkInfo {
  url: string;
  /** The URL in lower case, for search. */
  lower: string;
  type: LinkKind;
  /** Host without "www.", "" when the URL does not parse. */
  host: string;
}

export interface BlockLinks {
  links: LinkInfo[];
  /** The note's text without its links, cut to LINK_NOTE_CHARS. */
  note: string;
}

export interface CardView {
  title: string;
  preview: string;
  /** Up to 4 image URLs for thumbnails. */
  images: string[];
  imageCount: number;
  date: string;
}

interface Entry {
  urls?: string[];
  links?: BlockLinks;
  images?: string[];
  card?: CardView;
  hay?: { title: string; content: string; tags: string[] };
}

const cache = new WeakMap<ArchiveBlock, Entry>();
const entry = (b: ArchiveBlock): Entry => {
  let e = cache.get(b);
  if (!e) {
    e = {};
    cache.set(b, e);
  }
  return e;
};

/** A URL's kind and host from one parse. */
export function classifyUrl(url: string): { type: LinkKind; host: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (VIDEO_DOMAINS.some((d) => u.hostname.includes(d))) return { type: "video", host };
    const path = u.pathname.toLowerCase();
    if (IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext))) return { type: "image", host };
    return { type: "link", host };
  } catch {
    return { type: "link", host: "" };
  }
}

/** The distinct links in a note, as the Links view reads them, in order, plus its source_url. */
export function blockUrls(b: ArchiveBlock): string[] {
  const e = entry(b);
  if (!e.urls) {
    const set = new Set<string>(b.content.match(LINK_REGEX) ?? []);
    if (b.source_url) set.add(b.source_url);
    e.urls = [...set];
  }
  return e.urls;
}

/** Text without its links, with blank runs folded, cut to `max` characters. */
export function noteWithoutLinks(content: string, max = LINK_NOTE_CHARS): string {
  return content.replace(LINK_REGEX, "").replace(/\n{2,}/g, "\n").trim().slice(0, max);
}

export function blockLinks(b: ArchiveBlock): BlockLinks {
  const e = entry(b);
  if (!e.links) {
    const urls = blockUrls(b);
    e.links = {
      links: urls.map((url) => ({ url, lower: url.toLowerCase(), ...classifyUrl(url) })),
      note: urls.length ? noteWithoutLinks(b.content) : "",
    };
  }
  return e.links;
}

/** "[image] url" tags first, then bare image links, each once. */
export function blockImages(b: ArchiveBlock): string[] {
  const e = entry(b);
  if (!e.images) {
    const urls = new Set<string>();
    for (const m of b.content.matchAll(IMAGE_TAG_REGEX)) urls.add(m[1]);
    for (const m of b.content.matchAll(BARE_IMG_REGEX)) urls.add(m[0]);
    e.images = [...urls];
  }
  return e.images;
}

/** The title a card shows: a note that is only an image link reads "Image block". */
export function displayTitle(b: ArchiveBlock): string {
  return /^\[image\]\s*https?:\/\/\S+$/i.test(b.title?.trim() || "") ? "Image block" : b.title || "Untitled";
}

/**
 * The card's preview: the start of the note without "[image]" tags. Only the
 * start is read, so a long note costs the same as a short one.
 */
export function previewText(content: string, max = PREVIEW_CHARS): string {
  // Twice the length leaves room for the tags taken out of it.
  return content.slice(0, max * 2).replace(IMAGE_TAG_REGEX, "").trim().slice(0, max);
}

export function cardView(b: ArchiveBlock): CardView {
  const e = entry(b);
  if (!e.card) {
    const images = blockImages(b);
    e.card = {
      title: displayTitle(b),
      preview: previewText(b.content) || "Image block",
      images: images.slice(0, 4),
      imageCount: images.length,
      date: new Date(b.created_at).toLocaleDateString(),
    };
  }
  return e.card;
}

function haystack(b: ArchiveBlock) {
  const e = entry(b);
  if (!e.hay) e.hay = { title: b.title.toLowerCase(), content: b.content.toLowerCase(), tags: (b.tags || []).map((t) => t.toLowerCase()) };
  return e.hay;
}

/** Keyword match on title and text (and tags when asked); `q` is already lower case. */
export function matchesQuery(b: ArchiveBlock, q: string, includeTags = false): boolean {
  if (!q) return true;
  const h = haystack(b);
  return h.title.includes(q) || h.content.includes(q) || (includeTags && h.tags.some((t) => t.includes(q)));
}

export const hasLink = (b: ArchiveBlock) => !!b.source_url || blockUrls(b).length > 0;

export type SortMode = "newest" | "oldest" | "az";

export interface LibraryFilter {
  search: string;
  includeTags: boolean;
  pillar: string | null;
  hideLinks: boolean;
  sort: SortMode;
}

const pinnedFirst = (list: ArchiveBlock[]) => [...list.filter((b) => b.is_pinned), ...list.filter((b) => !b.is_pinned)];

/** The Library's list for a keyword search, filters and sort: pinned notes first. */
export function filterLibrary(blocks: ArchiveBlock[], f: LibraryFilter): ArchiveBlock[] {
  const q = f.search.trim().toLowerCase();
  const list = blocks.filter((b) => {
    if (f.pillar && !b.pillars.includes(f.pillar)) return false;
    if (f.hideLinks && hasLink(b)) return false;
    return matchesQuery(b, q, f.includeTags);
  });
  const time = (b: ArchiveBlock) => Date.parse(b.created_at) || 0;
  if (f.sort === "oldest") list.sort((a, b) => time(a) - time(b));
  else if (f.sort === "az") list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => time(b) - time(a));
  return pinnedFirst(list);
}

/** Smart-search results in their ranked order, as the live notes (current pin and star), filtered the same way. */
export function filterRanked(results: ArchiveBlock[], live: ArchiveBlock[], f: Pick<LibraryFilter, "pillar" | "hideLinks">): ArchiveBlock[] {
  const byId = new Map(live.map((b) => [b.id, b]));
  let list = results.map((r) => byId.get(r.id) ?? r);
  if (f.pillar) list = list.filter((b) => b.pillars.includes(f.pillar!));
  if (f.hideLinks) list = list.filter((b) => !hasLink(b));
  return pinnedFirst(list);
}

/** Distinct links across notes (the Links tab's count). */
export function countLinks(blocks: ArchiveBlock[]): number {
  const all = new Set<string>();
  for (const b of blocks) for (const u of blockUrls(b)) all.add(u);
  return all.size;
}

/** Distinct images across notes (the Images tab's count). */
export function countImages(blocks: ArchiveBlock[]): number {
  const all = new Set<string>();
  for (const b of blocks) for (const u of blockImages(b)) all.add(u);
  return all.size;
}
