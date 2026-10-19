/**
 * The pure half of ai-suggest-tags (mode "learn"): the tag rules, how similar
 * notes and the user's past answers score a tag, what goes to the model, and
 * how everything becomes at most five chips. No imports, so the app's tests
 * load this file as it is (artifacts/app/src/test/archive-tags.test.ts).
 *
 * The block between the "tag rules" markers is a word-for-word copy of the one
 * in artifacts/app/src/lib/archive-tags.ts (an edge function cannot import from
 * the app); the test fails when the two drift.
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
 * stay ("Książki" -> "książki"); "#2" -> "" (no letter).
 */
export function normaliseTag(raw: string): string {
  const t = String(raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
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