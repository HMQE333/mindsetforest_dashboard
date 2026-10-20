/**
 * Archive tags: the one set of rules every part of the Archive reads tags by.
 *
 * - A tag is lowercase Unicode letters and digits plus "-", "_" and "/" (a
 *   folder path), with at least one letter: "#książki" is the tag "książki",
 *   "#2" and "#13" are not tags. Inline #tags are read from the text and stay
 *   in it.
 * - His eight note types are ordinary tags (English, lowercase, no prefix). A
 *   note carries at most one; a new type replaces the old one. Choosing a type
 *   adds nothing new to the note, it just adds the right tag.
 * - detectType names the type only when the text leaves no doubt; otherwise
 *   it says null and the AI (ai-suggest-tags) decides.
 * - "a/b/c" puts a note in folder a, sub-folder b, sub-folder c.
 *
 * The block between the "tag rules" markers is copied word for word into
 * supabase/functions/_shared/archive-tags.ts (an edge function cannot import
 * from the app); src/test/archive-tags.test.ts fails when the two drift.
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
 * stay ("Książki" -> "książki"); "#2" -> "" (no letter). A language's "#" and
 * "++" are spelled out, so "C#" and "C++" stay apart: "csharp", "cpp".
 */
export function normaliseTag(raw: string): string {
  const t = String(raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/(?<=[\p{L}\p{N}])#(?!\p{L})/gu, "sharp")
    .replace(/(?<=[\p{L}\p{N}])\+\+(?!\p{L})/gu, "pp")
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

/** For the type chips and the type filter row. */
export const TYPE_INFO: Record<TypeTag, { label: string; hint: string }> = {
  insight: { label: "Insight", hint: "Your own thought, principle or realisation" },
  framework: { label: "Framework", hint: "A system, list, checklist or template" },
  quote: { label: "Quote", hint: "Someone else's words, kept with the source" },
  source: { label: "Source", hint: "A link or resource to read later" },
  question: { label: "Question", hint: "An open question or a prompt" },
  task: { label: "Task", hint: "Something to do" },
  capture: { label: "Capture", hint: "A file, image, screenshot or video" },
  fragment: { label: "Fragment", hint: "A raw note that doesn't fit yet" },
};

/**
 * An inline #tag: at the start or after a space, "(" or "[", so "page#section"
 * is not one, nor a link's anchor ("[Intro](#intro)") or an Obsidian heading
 * link ("[[#Heading]]"). A language's "#" or "++" at its end belongs to it
 * ("#C#", "#C++").
 */
export const INLINE_TAG_REGEX = /(^|[\s([])(?<!\]\(|\[\[)#([\p{L}\p{M}\p{N}_/-]+(?:(?:\+\+|#)(?![\p{L}\p{M}\p{N}_/-]))?)/gu;

/** A colour, not a label: "#FF5733", "#1e1e1e80" (six or eight hex digits, at least one a digit). */
const HEX_COLOUR = /^(?=[a-f]*\d)(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * The text without its code: fenced blocks (``` or ~~~) and inline `code`
 * spans, where "#include", "#define" and "#fff" are code, not tags.
 */
function withoutCode(text: string): string {
  let fence: string | null = null;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      out.push("");
      continue;
    }
    if (open) {
      fence = open[1];
      out.push("");
      continue;
    }
    out.push(line.replace(/(`+)(?:(?!\1)[^\n])*?\1/g, " "));
  }
  return out.join("\n");
}

/**
 * The #tags written in a note, normalised, each once, in the order written.
 * The text itself is not changed. "#2" is not a tag; "#projekty/RybiaPaka/" is
 * "projekty/rybiapaka". Code (fenced or inline) and colours ("#FF5733") are
 * not read as tags.
 */
export function parseInlineTags(text: string): string[] {
  const out: string[] = [];
  for (const m of withoutCode(String(text ?? "").normalize("NFC").replace(/\r\n?/g, "\n")).matchAll(INLINE_TAG_REGEX)) {
    if (HEX_COLOUR.test(m[2])) continue;
    const tag = normaliseTag(m[2]);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** The note's type tag, if it carries one (the first, should old data hold two). */
export function typeOf(tags: readonly string[]): TypeTag | null {
  for (const t of tags) if (isTypeTag(t)) return t;
  return null;
}

/**
 * `current` plus `add`: a type in `add` replaces the note's type (the last one
 * in `add` wins), every other tag is added once. Tags already on the note stay
 * as they are, in their order; added ones are normalised and anything that is
 * not a tag is skipped.
 */
export function mergeTags(current: readonly string[], add: readonly string[]): string[] {
  const incoming = add.map(normaliseTag).filter(Boolean);
  const newType = [...incoming].reverse().find(isTypeTag) ?? null;
  const out = newType ? current.filter((t) => !isTypeTag(t)) : [...current];
  for (const t of incoming) {
    if (isTypeTag(t) && t !== newType) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** `current` without the given tags (compared in normal form, so "#Książki" removes "książki"). */
export function removeTags(current: readonly string[], remove: readonly string[]): string[] {
  const drop = new Set(remove.map((t) => normaliseTag(t) || t));
  return current.filter((t) => !drop.has(t) && !drop.has(normaliseTag(t)));
}

/** "a/b/c" -> ["a", "a/b", "a/b/c"]: the folders a tag sits in, itself last. */
export function tagPaths(tag: string): string[] {
  const parts = tag.split("/").filter(Boolean);
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** The tag is the folder or sits anywhere below it. */
export function inFolder(tag: string, folder: string): boolean {
  return tag === folder || tag.startsWith(`${folder}/`);
}

/** The tag after renaming folder `from` to `to` (its sub-paths move with it); other tags unchanged. */
export function renameTag(tag: string, from: string, to: string): string {
  return inFolder(tag, from) ? `${to}${tag.slice(from.length)}` : tag;
}

/** How many notes carry each tag (a tag written twice on one note counts once). */
export function countTags(tagLists: Iterable<readonly string[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    for (const t of new Set(tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many notes sit in each folder, sub-folders included, each note once:
 * a note tagged "a/b" and "a/c" counts once in "a". Type tags are not folders.
 */
export function folderNoteCounts(tagLists: Iterable<readonly string[]>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tags of tagLists) {
    const paths = new Set<string>();
    for (const t of tags) if (!isTypeTag(t)) for (const p of tagPaths(t)) paths.add(p);
    for (const p of paths) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

export interface TagNode {
  /** The last segment: "rybiapaka" for "projekty/rybiapaka". */
  name: string;
  /** The whole tag: what a note carries to sit here. */
  path: string;
  /** Notes tagged exactly this path. */
  own: number;
  /** Notes here and in every sub-folder. */
  count: number;
  children: TagNode[];
}

/**
 * The folder tree of the given tags: "a/b" makes folder a with sub-folder b; a
 * plain tag is a top-level folder. `count` adds up the sub-folders; pass
 * `noteCounts` (folderNoteCounts) to count a note that sits in two sub-folders
 * once. Type tags are left out unless `includeTypes`. Folders sort by name.
 */
export function tagTree(
  counts: Iterable<readonly [string, number]>,
  opts: { noteCounts?: ReadonlyMap<string, number>; includeTypes?: boolean } = {},
): TagNode[] {
  interface Draft { name: string; path: string; own: number; kids: Map<string, Draft> }
  const top = new Map<string, Draft>();
  for (const [tag, n] of counts) {
    if (!opts.includeTypes && isTypeTag(tag)) continue;
    const parts = tag.split("/").filter(Boolean);
    let level = top;
    let path = "";
    parts.forEach((name, i) => {
      path = path ? `${path}/${name}` : name;
      let node = level.get(name);
      if (!node) {
        node = { name, path, own: 0, kids: new Map() };
        level.set(name, node);
      }
      if (i === parts.length - 1) node.own += n;
      level = node.kids;
    });
  }
  const finish = (level: Map<string, Draft>): TagNode[] =>
    [...level.values()]
      .sort((a, b) => a.name.localeCompare(b.name, "pl"))
      .map((d) => {
        const children = finish(d.kids);
        const sum = d.own + children.reduce((s, c) => s + c.count, 0);
        return { name: d.name, path: d.path, own: d.own, count: opts.noteCounts?.get(d.path) ?? sum, children };
      });
  return finish(top);
}

/** Where a suggestion came from (the values archive_tag_feedback.source takes, but "manual"). */
export type TagSuggestionSource = "neighbours" | "ai" | "type-rule";

/**
 * One chip offered for a note by ai-suggest-tags (mode "learn"). A suggested
 * pillar is kind "pillar" with the tag "pillar:<id>" (the form its feedback
 * rows take); accepting one adds the pillar to the note, never a tag.
 */
export interface TagSuggestion {
  tag: string;
  kind: "type" | "tag" | "pillar";
  source: TagSuggestionSource;
  /** Short, Polish: "3 podobne notatki mają #rybiapaka", "AI: nowy tag". */
  reason: string;
  /** Higher is surer; only for ordering. */
  score: number;
  /** Not in his vocabulary yet. */
  isNew?: boolean;
}

/** A pillar chip's tag, and its archive_tag_feedback rows' tag: "pillar:<id>". */
export const PILLAR_TAG_PREFIX = "pillar:";
export const isPillarTag = (tag: string): boolean => typeof tag === "string" && tag.startsWith(PILLAR_TAG_PREFIX);
export const pillarTag = (id: string): string => `${PILLAR_TAG_PREFIX}${id}`;
/** The pillar id of a "pillar:<id>" tag ("" when it has none). */
export const pillarIdOfTag = (tag: string): string => (isPillarTag(tag) ? tag.slice(PILLAR_TAG_PREFIX.length).trim().toLowerCase() : "");
