/**
 * The Markdown a lecture summary is written in (Obsidian's flavour, as the
 * routine's format 2 uses it) parsed into a small tree the reader renders:
 * headings, paragraphs with Obsidian's line breaks, nested lists, tables,
 * quotes and callouts (> [!type]- Title, nested), fenced code (mermaid, plot,
 * plot3d), $$ math $$, and inline **bold**, *italic*, `code`, $math$,
 * ==highlight==, ~~strike~~, [[wiki links]] and [links](https://…).
 *
 * Nothing here produces HTML: the tree is rendered as React elements, so the
 * text of a note can never inject markup. Raw HTML in a note stays text.
 */
import { wikiLinks, type WikiLink } from "@/lib/kos-vault";

export type Inline =
  | { t: "text"; v: string }
  | { t: "br" }
  | { t: "strong" | "em" | "del" | "mark"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "math"; v: string; display: boolean }
  | { t: "wiki"; link: WikiLink; embed: boolean }
  | { t: "link"; href: string; c: Inline[] };

export type Align = "left" | "center" | "right" | null;

export interface ListItem {
  /** null: no checkbox; true / false: a task item. */
  task: boolean | null;
  c: Block[];
}

export type Block =
  | { t: "heading"; level: number; c: Inline[]; raw: string }
  | { t: "para"; c: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { t: "quote"; c: Block[] }
  | { t: "callout"; kind: string; fold: "open" | "closed" | null; title: Inline[] | null; c: Block[] }
  | { t: "code"; lang: string; v: string }
  | { t: "math"; v: string }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

// -- blocks ------------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const QUOTE = /^ {0,3}>/;
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const BLOCK_ID = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/;

const indentOf = (line: string) => {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
};

/** Removes up to `n` columns of leading indentation. */
function dedent(line: string, n: number): string {
  let i = 0;
  let col = 0;
  while (i < line.length && col < n && (line[i] === " " || line[i] === "\t")) {
    col += line[i] === "\t" ? 4 : 1;
    i++;
  }
  return line.slice(i);
}

/** A pipe row split into cells; pipes inside `code`, $math$ and [[link|alias]] do not split. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let code = false;
  let math = false;
  let wiki = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (c === "`" && !math) code = !code;
    else if (c === "$" && !code) math = !math;
    else if (c === "[" && s[i + 1] === "[" && !code) {
      wiki++;
      cur += "[[";
      i++;
      continue;
    } else if (c === "]" && s[i + 1] === "]" && wiki > 0) {
      wiki--;
      cur += "]]";
      i++;
      continue;
    } else if (c === "|" && !code && !math && wiki === 0) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const c = cell.trim();
  const l = c.startsWith(":");
  const r = c.endsWith(":");
  return l && r ? "center" : r ? "right" : l ? "left" : null;
}

const startsBlock = (line: string, next: string | undefined) =>
  FENCE.test(line) ||
  HEADING.test(line) ||
  QUOTE.test(line) ||
  LIST.test(line) ||
  /^\s*\$\$/.test(line) ||
  HR.test(line) ||
  (line.includes("|") && next !== undefined && TABLE_DELIM.test(next) && next.includes("-"));

export function parseBlocks(src: string): Block[] {
  return blocks(stripComments(src).split(/\r?\n/));
}

/**
 * Obsidian comments (%%...%%) are hidden in reading view, but not inside a
 * fenced code block, where "%%" is mermaid's own comment syntax.
 */
function stripComments(src: string): string {
  const chunks: string[] = [];
  let prose: string[] = [];
  let fence: string | null = null;
  const flushProse = () => {
    if (prose.length) chunks.push(prose.join("\n").replace(/%%[\s\S]*?%%/g, ""));
    prose = [];
  };
  for (const line of src.split(/\r?\n/)) {
    const m = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
    if (fence === null && m) {
      flushProse();
      fence = m[1];
      chunks.push(line);
    } else if (fence !== null) {
      chunks.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
    } else {
      prose.push(line);
    }
  }
  flushProse();
  return chunks.join("\n");
}

function blocks(lines: string[]): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const indent = indentOf(line);
      const body: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`).test(lines[i])) {
        body.push(dedent(lines[i], indent));
        i++;
      }
      i++; // the closing fence (or the end)
      out.push({ t: "code", lang: fence[2].toLowerCase(), v: body.join("\n") });
      continue;
    }

    const math = /^\s*\$\$(.*)$/.exec(line);
    if (math) {
      const first = math[1];
      const oneLine = /^(.*?)\$\$\s*$/.exec(first);
      if (oneLine) {
        out.push({ t: "math", v: oneLine[1].trim() });
        i++;
        continue;
      }
      const body: string[] = first.trim() ? [first] : [];
      i++;
      while (i < lines.length) {
        const end = /^(.*?)\$\$\s*$/.exec(lines[i]);
        if (end) {
          if (end[1].trim()) body.push(end[1]);
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      out.push({ t: "math", v: body.join("\n").trim() });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      out.push({ t: "heading", level: heading[1].length, c: parseInline(heading[2].replace(BLOCK_ID, "")), raw: heading[2] });
      i++;
      continue;
    }

    if (HR.test(line)) {
      out.push({ t: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(/^ {0,3}> ?/, ""));
        i++;
      }
      const callout = /^\[!([A-Za-z0-9_-]+)\]([+-]?)[ \t]*(.*)$/.exec(inner[0]?.trim() ?? "");
      if (callout) {
        const title = callout[3].trim();
        out.push({
          t: "callout",
          kind: callout[1].toLowerCase(),
          fold: callout[2] === "-" ? "closed" : callout[2] === "+" ? "open" : null,
          title: title ? parseInline(title) : null,
          c: blocks(inner.slice(1)),
        });
      } else out.push({ t: "quote", c: blocks(inner) });
      continue;
    }

    const next = lines[i + 1];
    if (line.includes("|") && next !== undefined && TABLE_DELIM.test(next) && next.includes("-")) {
      const head = splitRow(line);
      const align = splitRow(next).map(alignOf);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        rows.push(head.map((_, k) => parseInline(cells[k] ?? "")));
        i++;
      }
      out.push({ t: "table", align: head.map((_, k) => align[k] ?? null), head: head.map((h) => parseInline(h)), rows });
      continue;
    }

    if (LIST.test(line)) {
      const parsed = list(lines, i);
      out.push(parsed.block);
      i = parsed.next;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i], lines[i + 1]))) {
      para.push(lines[i].trim().replace(BLOCK_ID, ""));
      i++;
    }
    out.push({ t: "para", c: parseInline(para.join("\n")) });
  }
  return out;
}

/** One list from line `start`: its items, each item's lines dedented and parsed as blocks. */
function list(lines: string[], start: number): { block: Block; next: number } {
  const first = LIST.exec(lines[start])!;
  const base = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const items: { lines: string[] }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = LIST.exec(line);
    if (m && indentOf(m[1]) === base) {
      if (/\d/.test(m[2]) !== ordered) break;
      // Continuation lines are dedented to where this item's text starts.
      items.push({ lines: [m[3]] });
      i++;
      continue;
    }
    if (!line.trim()) {
      // A blank line ends the list unless an indented continuation follows.
      const after = lines[i + 1];
      if (after !== undefined && after.trim() && indentOf(after) > base) {
        items[items.length - 1].lines.push("");
        i++;
        continue;
      }
      break;
    }
    if (indentOf(line) > base) {
      items[items.length - 1].lines.push(dedent(line, base + 2));
      i++;
      continue;
    }
    // A lazy continuation of the item's paragraph.
    if (!startsBlock(line, lines[i + 1])) {
      items[items.length - 1].lines.push(line.trim());
      i++;
      continue;
    }
    break;
  }
  return {
    block: {
      t: "list",
      ordered,
      start: ordered ? parseInt(first[2], 10) || 1 : 1,
      items: items.map((it) => {
        const task = /^\[([ xX])\][ \t]+/.exec(it.lines[0]);
        if (task) it.lines[0] = it.lines[0].slice(task[0].length);
        return { task: task ? task[1] !== " " : null, c: blocks(it.lines) };
      }),
    },
    next: i,
  };
}

// -- inline ------------------------------------------------------------------------------

// obsidian:// only to open or search: its other actions (new, overwrite...) would let a
// note written from third-party text change the vault with one click.
const SAFE_HREF = /^(https?:|mailto:|obsidian:\/\/(?:open|search)\?)/i;
/** How far an emphasis run looks for its end: keeps a malformed paragraph linear. */
const EMPHASIS_REACH = 500;

/** Where a closing `marker` is, for an emphasis run that starts at `from` (not after a space). */
function closing(s: string, marker: string, from: number): number {
  const last = Math.min(s.length - marker.length, from + EMPHASIS_REACH);
  for (let j = from; j <= last; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "`") {
      const end = s.indexOf("`", j + 1);
      if (end > 0) j = end;
      continue;
    }
    if (s.startsWith(marker, j) && j > from && !/\s/.test(s[j - 1])) {
      // "**" inside a "*" run is not the end of the "*" run.
      if (marker.length === 1 && s[j + 1] === marker) {
        j++;
        continue;
      }
      return j;
    }
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let noClose = Infinity;
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const rest = s.slice(i);

    if (c === "\\" && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|$=~<>^]/.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (c === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (c === "`") {
      const run = /^`+/.exec(rest)![0];
      const end = s.indexOf(run, i + run.length);
      if (end > 0) {
        flush();
        out.push({ t: "code", v: s.slice(i + run.length, end).replace(/^ (.*) $/, "$1") });
        i = end + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }
    if (rest.startsWith("$$")) {
      const end = s.indexOf("$$", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "math", v: s.slice(i + 2, end).trim(), display: true });
        i = end + 2;
        continue;
      }
    }
    if (c === "$") {
      // Obsidian's rule: no space just inside the dollars, no digit right after the closing one ($5 and $10 stay text).
      if (s[i + 1] && !/\s/.test(s[i + 1])) {
        let j = i + 1;
        let end = -1;
        while (j < s.length) {
          if (s[j] === "\\") {
            j += 2;
            continue;
          }
          if (s[j] === "$") {
            if (!/\s/.test(s[j - 1]) && !/\d/.test(s[j + 1] ?? "")) end = j;
            break;
          }
          if (s[j] === "\n" && s[j + 1] === "\n") break;
          j++;
        }
        if (end > i + 1) {
          flush();
          out.push({ t: "math", v: s.slice(i + 1, end), display: false });
          i = end + 1;
          continue;
        }
      }
      text += c;
      i++;
      continue;
    }
    if (rest.startsWith("[[") || rest.startsWith("![[")) {
      const embed = c === "!";
      const open = embed ? i + 1 : i;
      // Once no "]]" is left, later "[[" need not look again (20000 of them must not be quadratic).
      const end = noClose <= open ? -1 : s.indexOf("]]", open + 2);
      if (end < 0) noClose = Math.min(noClose, open);
      if (end > 0) {
        const link = wikiLinks(s.slice(open, end + 2))[0];
        if (link) {
          flush();
          out.push({ t: "wiki", link, embed });
          i = end + 2;
          continue;
        }
      }
    }
    if (c === "[") {
      // Bounded label and address: an unclosed "[" must not scan the rest of the paragraph each time.
      const m = /^\[([^\]\n]{1,500})\]\(\s*<?([^)\s>]{1,2000})>?(?:\s+"[^"\n]{0,300}")?\s*\)/.exec(rest);
      if (m) {
        flush();
        const inner = parseInline(m[1]);
        if (SAFE_HREF.test(m[2])) out.push({ t: "link", href: m[2], c: inner });
        else out.push(...inner);
        i += m[0].length;
        continue;
      }
    }
    const url = /^https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?"'”’)]/.exec(rest);
    if (url && (i === 0 || !/[\w/]/.test(s[i - 1]))) {
      flush();
      out.push({ t: "link", href: url[0], c: [{ t: "text", v: url[0] }] });
      i += url[0].length;
      continue;
    }
    const pair = (["**", "__", "~~", "=="] as const).find((m) => rest.startsWith(m));
    if (pair && s[i + 2] && !/\s/.test(s[i + 2])) {
      const end = closing(s, pair, i + 2);
      if (end > 0 && (pair !== "__" || !/\w/.test(s[end + 2] ?? ""))) {
        flush();
        const t = pair === "~~" ? "del" : pair === "==" ? "mark" : "strong";
        out.push({ t, c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((c === "*" || c === "_") && s[i + 1] && !/\s/.test(s[i + 1]) && s[i + 1] !== c) {
      // "_" inside a word (snake_case) is not emphasis.
      if (c === "*" || i === 0 || !/[\p{L}\p{N}]/u.test(s[i - 1])) {
        const end = closing(s, c, i + 1);
        if (end > 0 && (c === "*" || !/[\p{L}\p{N}]/u.test(s[end + 1] ?? ""))) {
          flush();
          out.push({ t: "em", c: parseInline(s.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }
    text += c;
    i++;
  }
  flush();
  return out;
}

/** The plain words of inline content (for ids, labels and search). */
export function inlineText(c: Inline[]): string {
  return c
    .map((x) => {
      switch (x.t) {
        case "text":
          return x.v;
        case "br":
          return " ";
        case "code":
        case "math":
          return x.v;
        case "wiki":
          return x.link.alias || x.link.name;
        default:
          return inlineText(x.c);
      }
    })
    .join("");
}

/** "1. Zdanie logiczne" -> "1-zdanie-logiczne": a heading's anchor id. */
export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/ł/g, "l")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}
