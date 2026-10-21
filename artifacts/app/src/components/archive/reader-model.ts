/**
 * The note reader's logic, kept apart from React so it can be tested: how a
 * note is cut into parts it can render one at a time, which note comes next
 * when one is deleted, and what a swipe means.
 */
import { autoTitle } from "@/lib/archive-data";

/** A note longer than this opens with its start only; "Show all" renders the rest, a part at a time. */
export const READER_FIRST_CHARS = 30_000;
/** The size of each part a long note is rendered in (one parse and one commit each). */
export const READER_PIECE_CHARS = 10_000;

export type ReaderPiece = { kind: "text"; text: string } | { kind: "image"; url: string };

/** "[image] https://…" on a line of its own: how the Inbox stores a pasted image. */
const IMAGE_LINE = /^[ \t]*\[image\][ \t]*(https?:\/\/\S+)\s*$/;
/** A fenced code block's opening line, as lectures/markdown.ts reads it. */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;

/**
 * The note as the reader renders it: its text in parts of about `pieceChars`
 * characters, and each "[image] url" line as an image of its own.
 *
 * Text is cut at a blank line where one is near, else at a line end, never
 * inside a fenced code block (one longer than two parts is closed and opened
 * again around the cut), and a single line longer than a part is cut at a
 * space. Pass Infinity to keep the text whole (only images split it).
 */
export function readerPieces(content: string, pieceChars = READER_PIECE_CHARS): ReaderPiece[] {
  const out: ReaderPiece[] = [];
  let buf: string[] = [];
  let size = 0;
  /** Lines in `buf` up to the last blank line outside a fence (0: none), and their characters. */
  let blankCut = 0;
  let blankSize = 0;
  let fence: { marker: string; line: string } | null = null;

  const pushText = (text: string) => {
    if (text.trim()) out.push({ kind: "text", text });
  };
  const cut = (n: number) => {
    pushText(buf.slice(0, n).join("\n"));
    buf = buf.slice(n);
    size = buf.reduce((s, l) => s + l.length + 1, 0);
    blankCut = 0;
  };

  for (const line of content.split("\n")) {
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.marker[0] === "`" ? "`" : "~"}{${fence.marker.length},}\\s*$`);
      if (close.test(line)) fence = null;
    } else {
      const image = IMAGE_LINE.exec(line);
      if (image) {
        cut(buf.length);
        out.push({ kind: "image", url: image[1] });
        continue;
      }
      const open = FENCE_OPEN.exec(line);
      if (open) fence = { marker: open[1], line };
    }

    if (line.length > pieceChars && !fence) {
      // One enormous line (a paste without line breaks): its own parts, cut at spaces.
      cut(buf.length);
      let rest = line;
      while (rest.length > pieceChars) {
        const space = rest.lastIndexOf(" ", pieceChars);
        const at = space > pieceChars / 2 ? space + 1 : pieceChars;
        pushText(rest.slice(0, at));
        rest = rest.slice(at);
      }
      buf = [rest];
      size = rest.length + 1;
      continue;
    }

    buf.push(line);
    size += line.length + 1;
    if (!line.trim() && !fence) {
      blankCut = buf.length;
      blankSize = size;
    }

    if (size >= pieceChars) {
      // At the last blank line unless that leaves a short part; else right here.
      if (!fence) cut(blankCut > 0 && blankSize > pieceChars / 2 ? blankCut : buf.length);
      else if (size >= pieceChars * 2) {
        // A code block longer than two parts: close it here and open it again in the next part.
        const reopen = fence.line;
        pushText(`${buf.join("\n")}\n${fence.marker}`);
        buf = [reopen];
        size = reopen.length + 1;
        blankCut = 0;
      }
    }
  }
  cut(buf.length);
  return out;
}

/** How many parts open at first: as many as fit in `budget` characters, at least one. */
export function firstPieceCount(pieces: ReaderPiece[], budget = READER_FIRST_CHARS): number {
  let chars = 0;
  for (let i = 0; i < pieces.length; i++) {
    chars += pieceChars(pieces[i]);
    if (chars > budget) return Math.max(1, i);
  }
  return pieces.length;
}

/** The characters a part stands for (an image counts as its link). */
export const pieceChars = (p: ReaderPiece) => (p.kind === "text" ? p.text.length : p.url.length);

/**
 * The note to show once `removedId` is gone: the next one still there in the
 * list's order, else the one before it, else null (the list is empty).
 */
export function neighbourAfterRemoval(order: readonly string[], removedId: string, isThere: (id: string) => boolean): string | null {
  const at = order.indexOf(removedId);
  if (at < 0) return order.find((id) => id !== removedId && isThere(id)) ?? null;
  for (let i = at + 1; i < order.length; i++) if (isThere(order[i])) return order[i];
  for (let i = at - 1; i >= 0; i--) if (isThere(order[i])) return order[i];
  return null;
}

/** A finished touch: +1 (swiped left: the next note), -1 (swiped right: the previous one) or 0. */
export function swipeStep({ dx, dy, ms }: { dx: number; dy: number; ms: number }): 1 | -1 | 0 {
  if (ms > 800 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}

/** A title to read: without the Markdown heading marks and emphasis an auto-title keeps from the note's first line. */
export function readerTitle(title: string): string {
  const t = title
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\*\*(.+?)\*\*/, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return t || "Untitled";
}

export interface NoteHeading {
  /** The note's name: for the dialog, the neighbour cards and the delete confirmation. */
  title: string;
  /** Whether the header shows it; an auto-title is the start of the text, which the body already shows. */
  shown: boolean;
  /** Characters at the start of the content the body leaves out (a first-line heading that became the title). */
  skip: number;
}

const FIRST_HEADING = /^\s*#{1,6}[ \t]+([^\n]*?)[ \t#]*(?:\r?\n|$)/;
const FIRST_LINE = /^\s*([^\n]*)/;

/**
 * What the reader calls a note. A title of its own (typed, or written by the
 * AI) is shown as it is. The Inbox's title is the first 60 characters of the
 * text, cut mid-word: then a first-line heading becomes the title (and leaves
 * the body), and otherwise there is no separate title, the text starts the page.
 */
/** A bare URL as a short title: "example.com/articles/2026/10/how-to…" (host without www, path start, no query). */
export function shortUrlTitle(text: string): string | null {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return null;
  try {
    const u = new URL(t);
    const host = u.hostname.replace(/^www\./, "");
    const path = decodeURIComponent(u.pathname).replace(/\/+$/, "");
    const full = `${host}${path}`;
    return full.length > 60 ? `${full.slice(0, 59)}…` : full;
  } catch {
    return null;
  }
}

export function noteHeading(title: string, content: string): NoteHeading {
  const h = noteHeadingRaw(title, content);
  const short = shortUrlTitle(h.title.replace(/…$/, ""));
  return short ? { ...h, title: short } : h;
}

function noteHeadingRaw(title: string, content: string): NoteHeading {
  const heading = FIRST_HEADING.exec(content);
  if (title.trim() && title !== autoTitle(content)) {
    // A first heading that says the same as the title is not repeated under it.
    const same = !!heading && readerTitle(heading[1]) === readerTitle(title);
    return { title: readerTitle(title), shown: true, skip: same ? heading[0].length : 0 };
  }
  if (heading && heading[1].trim()) return { title: readerTitle(heading[1]), shown: true, skip: heading[0].length };
  const line = (FIRST_LINE.exec(content)?.[1] ?? "").trim();
  if (/^\[image\]\s*https?:\/\/\S+$/i.test(line)) return { title: "Image note", shown: false, skip: 0 };
  const name = readerTitle(line);
  return { title: name.length > 80 ? `${name.slice(0, 79)}…` : name, shown: false, skip: 0 };
}

/** 503164 -> "503k", 1250 -> "1.3k", 812 -> "812". */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(n / 1000)}k`;
}

/** "~4 min read" for a note worth timing; a note too long to read through shows its size instead. */
export function readingLabel(chars: number): string | null {
  if (chars < 600) return null;
  if (chars > READER_FIRST_CHARS * 2) return `${compactCount(chars)} characters`;
  // About 6 characters a word (Polish and English) and 220 words a minute.
  return `~${Math.max(1, Math.round(chars / 6 / 220))} min read`;
}
