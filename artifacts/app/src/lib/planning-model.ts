/**
 * Planning: two kinds of open loop.
 *
 * Every planning node is an open loop of one of two kinds. A Step waits to be
 * done (tick it). A Question waits to be answered (one line), optionally after
 * a guess is written first; when it is answered the guess is graded once
 * (right / wrong / unknown), the node-sized twin of paths.diagnosis.
 *
 * Everything else the seven ChatGPT types named is a position or a state:
 * Target = a root, Plan = a Step with children, Option = a child of a Question,
 * Test = a Step under a Question, Decision = a settled Question, Model = the
 * guess. There is no relationship table: structure carries tests and answers,
 * "chosen over" is the dropped children of a settled Question, and "depends on"
 * is sibling order.
 *
 * Pure: no React, no Supabase. usePlanningState is the only writer; the List,
 * the Map, the paste preview and the assistant all read through this file.
 * His content is Polish, so nothing here assumes English text.
 */

export type Verdict = "right" | "wrong" | "unknown";

/** The row shape every view uses (usePlanningState's PlanningTask is a superset). */
export interface PlanNode {
  id: string;
  board_id: string | null;
  parent_id: string | null;
  title: string;
  /** true = Question, false = Step. */
  ask: boolean;
  done: boolean;
  /** dropped implies done (a DB CHECK holds it). */
  dropped: boolean;
  /** The prior, written before the work. Questions only. */
  guess: string | null;
  /** The line that closed it: the answer, "→ Home: …", or why it was dropped. */
  outcome: string | null;
  /** Only when both a guess and an outcome exist. */
  verdict: Verdict | null;
  closed_at: string | null;
  sort_order: number;
  created_at: string;
}

export type NodeState = "open" | "done" | "dropped" | "settled";

/** settled = a Question that is done and not dropped. */
export function stateOf(n: PlanNode): NodeState {
  if (n.dropped) return "dropped";
  if (n.done) return n.ask ? "settled" : "done";
  return "open";
}

const isOpen = (n: PlanNode) => !n.done && !n.dropped;
const isOpenQuestion = (n: PlanNode) => !!n.ask && isOpen(n);

// ---------------------------------------------------------------- one typed line

export type LineKind = "step" | "question" | "settled" | "note";
export interface ParsedLine { kind: LineKind; title: string; guess?: string; outcome?: string }

const BARE_URL = /^(?:https?:\/\/|www\.)\S+$/i;

/** True for a line that is nothing but a link (it becomes a note, not a node). */
export function isBareUrl(text: string): boolean {
  return BARE_URL.test(text.trim());
}

/**
 * One typed line. Markers count only right after the LAST '?', so maths and
 * Polish inside a question stay text ("Czy X ~ N(0,1)?" is a plain question):
 *   "X"          -> step                     "X?"      -> question
 *   "X? ~ g"     -> question, guess g        "X? = a"  -> settled question, outcome a
 *   "= text"     -> settled statement (a rule with no question: title = outcome = text)
 *   "> text"     -> note for the parent      a bare URL -> note for the parent
 * Text after the last '?' that is not a marker makes the line a step: the kind
 * is read from a trailing '?', so "Why? Because." is a statement. An empty
 * guess or answer ("X? ~") is ignored and leaves a plain question.
 */
export function parseLine(text: string): ParsedLine {
  const t = text.trim();
  if (t.startsWith(">")) return { kind: "note", title: t.slice(1).trim() };
  if (BARE_URL.test(t)) return { kind: "note", title: t };
  if (t.startsWith("=")) {
    const s = t.slice(1).trim();
    return { kind: "settled", title: s, outcome: s };
  }
  const q = t.lastIndexOf("?");
  if (q < 0) return { kind: "step", title: t };
  const title = t.slice(0, q + 1).trim();
  const tail = t.slice(q + 1).trim();
  if (!tail) return { kind: "question", title };
  if (tail.startsWith("~")) {
    const guess = tail.slice(1).trim();
    return guess ? { kind: "question", title, guess } : { kind: "question", title };
  }
  if (tail.startsWith("=")) {
    const outcome = tail.slice(1).trim();
    return outcome ? { kind: "settled", title, outcome } : { kind: "question", title };
  }
  return { kind: "step", title: t };
}

/** "X" -> "X?" so the line reads back as a question (a toggled question may lack its '?'). */
const asQuestion = (title: string) => (title.trimEnd().endsWith("?") ? title.trimEnd() : `${title.trimEnd()}?`);

/**
 * The canonical text back: "X", "X? ~ g", "X? = a", "= text". A settled
 * question whose answer is its own title (a rule) prints as "= text"; a dropped
 * node prints in its open form (its outcome is why it was dropped, not an
 * answer). A guess or answer that itself ends in '?' cannot round-trip (the
 * last-'?' rule reads it as part of the title).
 */
export function lineOf(n: PlanNode): string {
  const title = n.title.trim();
  if (!n.ask) return title;
  if (n.done && !n.dropped) {
    const outcome = n.outcome?.trim();
    if (!outcome || outcome === title) return `= ${title}`;
    return `${asQuestion(title)} = ${outcome}`;
  }
  const guess = n.guess?.trim();
  return guess ? `${asQuestion(title)} ~ ${guess}` : asQuestion(title);
}

/**
 * The columns a parsed line becomes (a note is not a node; the caller appends
 * it to the parent's notes). A settled line without an answer keeps
 * outcome = title for a rule ("= ZAKAZ LOSOWANIA") and null for a question.
 */
export function nodeFieldsOf(line: ParsedLine): { ask: boolean; done: boolean; title: string; guess: string | null; outcome: string | null } {
  const title = line.title.trim();
  const guess = line.guess?.trim() || null;
  switch (line.kind) {
    case "question":
      return { ask: true, done: false, title, guess, outcome: null };
    case "settled": {
      const outcome = line.outcome?.trim() || (title.endsWith("?") ? null : title);
      return { ask: true, done: true, title, guess, outcome };
    }
    default:
      return { ask: false, done: false, title, guess: null, outcome: null };
  }
}

// ---------------------------------------------------------------- a multi-line paste

export interface PasteRow { depth: number; heading: boolean; line: ParsedLine }

const tabWidth = 4;
const indentOf = (s: string) => {
  let w = 0;
  for (const ch of s) {
    if (ch === " ") w += 1;
    else if (ch === "\t") w += tabWidth;
    else break;
  }
  return w;
};
const HEADING = /^\s*(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const BULLET = /^([-*+]|\d+[.)])(?:\s+|$)/;
const CHECKBOX = /^\[[ xX]\]\s+/;
const RULE = /^\s*(?:([-*_])\s*(?:\1\s*){2,}|```.*|~~~.*|#{1,6})\s*$/;
const stripEmphasis = (s: string) => s.replace(/\*\*|__/g, "").trim();

/**
 * A multi-line paste (his real specs are Markdown) as rows to preview:
 *  - '#' headings become parents by heading level (heading=true);
 *  - '-', '*', '+', '1.' / '1)' bullets, a task box '[ ]' and '**' / '__' are stripped;
 *  - a line starting with a single space, or one indented at or past the previous
 *    bullet's text with no bullet of its own, continues the previous line (joined
 *    with a space), so wrapped bullets stay one row;
 *  - depth is relative to the smallest indent (counted afresh under each heading);
 *  - blank lines, horizontal rules and code fences are skipped.
 * Every row is parsed with parseLine after its continuations are joined, so a
 * '?' on a wrapped line still makes a question.
 */
export function parsePaste(text: string): PasteRow[] {
  type Raw = { depth: number; heading: boolean; text: string; textCol: number | null };
  const raws: Raw[] = [];
  const headings: { level: number; depth: number }[] = [];
  let base = 0;
  let indents: { indent: number; depth: number }[] = [];

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!rawLine.trim() || RULE.test(rawLine)) continue;

    const h = HEADING.exec(rawLine);
    if (h) {
      const level = h[1].length;
      while (headings.length && headings[headings.length - 1].level >= level) headings.pop();
      const depth = headings.length ? headings[headings.length - 1].depth + 1 : 0;
      headings.push({ level, depth });
      base = depth + 1;
      indents = [];
      const title = stripEmphasis(h[2]).replace(BULLET, "");
      if (title) raws.push({ depth, heading: true, text: title, textCol: null });
      continue;
    }

    const indent = indentOf(rawLine);
    const body = rawLine.trim();
    const bullet = BULLET.exec(body);
    const prev = raws[raws.length - 1];
    // A note ("> x", a bare link) under a bullet is its own row, not more of the bullet's text.
    const continues = !!prev && !bullet && !body.startsWith(">") && !BARE_URL.test(body) && (
      /^ \S/.test(rawLine) || (prev.textCol !== null && indent >= prev.textCol)
    );
    if (continues) {
      const more = stripEmphasis(body);
      if (more) prev.text = prev.text ? `${prev.text} ${more}` : more;
      continue;
    }

    let rest = body;
    let textCol: number | null = null;
    if (bullet) {
      rest = body.slice(bullet[0].length);
      textCol = indent + bullet[0].length;
      const box = CHECKBOX.exec(rest);
      if (box) rest = rest.slice(box[0].length);
    }
    const title = stripEmphasis(rest);
    if (!title) continue;

    while (indents.length && indents[indents.length - 1].indent > indent) indents.pop();
    let depth: number;
    if (indents.length && indents[indents.length - 1].indent === indent) {
      depth = indents[indents.length - 1].depth;
    } else {
      depth = indents.length ? indents[indents.length - 1].depth + 1 : 0;
      indents.push({ indent, depth });
    }
    raws.push({ depth: base + depth, heading: false, text: title, textCol });
  }

  return raws.map((r) => ({ depth: r.depth, heading: r.heading, line: parseLine(r.text) }));
}

/**
 * One tap per heading: every non-heading row below the heading (its whole
 * section, up to the next row at the heading's depth or shallower) gets `kind`.
 * Only the kind changes; the parsed title, guess and answer stay on the row, so
 * tapping another kind is reversible.
 */
export function setKindUnder(rows: PasteRow[], headingIndex: number, kind: LineKind): PasteRow[] {
  const head = rows[headingIndex];
  if (!head) return rows;
  let end = headingIndex + 1;
  while (end < rows.length && rows[end].depth > head.depth) end++;
  return rows.map((r, i) =>
    i > headingIndex && i < end && !r.heading ? { ...r, line: { ...r.line, kind } } : r,
  );
}

/** A note line appended to existing notes, one per line. */
export function appendNote(notes: string | null | undefined, line: string): string {
  const prev = (notes ?? "").replace(/\s+$/, "");
  return prev ? `${prev}\n${line}` : line;
}

/** "www.x.pl" -> "https://www.x.pl"; anything else unchanged. */
export function linkOf(text: string): string {
  const t = text.trim();
  return /^www\./i.test(t) ? `https://${t}` : t;
}

/** One row of a planned tree insert (client ids, so the whole tree is one insert). */
export interface TreeRow {
  id: string;
  parent_id: string | null;
  title: string;
  ask: boolean;
  done: boolean;
  guess: string | null;
  outcome: string | null;
  notes: string;
  url: string | null;
  sort_order: number;
}

/**
 * How a preview's rows hang together, the one rule planTree and the paste
 * preview's labels share: `parent[i]` is the index of the row that row i hangs
 * from (the nearest row above at a smaller depth that becomes a node; a depth
 * that jumps attaches to the deepest row available), or null for the row the
 * paste goes under (or the top level). `node[i]` says whether row i becomes a
 * node: a note does not (it goes to its parent's notes), except with no parent
 * at all (a note at the top of a board), where it becomes a plain step so no
 * pasted text is lost. Rows with no text are neither.
 */
export function pasteStructure(rows: PasteRow[], underParent: boolean): { parent: (number | null)[]; node: boolean[] } {
  const stack: (number | undefined)[] = [];
  const parent: (number | null)[] = [];
  const node: boolean[] = [];
  rows.forEach((r, i) => {
    const depth = Math.max(0, r.depth);
    let p: number | null = null;
    for (let k = Math.min(depth, stack.length) - 1; k >= 0; k--) {
      const j = stack[k];
      if (j !== undefined) { p = j; break; }
    }
    parent.push(p);
    const text = r.line.kind === "note" ? r.line.title.trim() : nodeFieldsOf(r.line).title;
    const isNode = !!text && (r.line.kind !== "note" || (p === null && !underParent));
    node.push(isNode);
    if (isNode) {
      stack[depth] = i;
      stack.length = depth + 1;
    }
  });
  return { parent, node };
}

/**
 * Turns preview rows into the rows of ONE insert under `parentId`: parent ids
 * are resolved by depth (pasteStructure), siblings are numbered from
 * `firstOrder` at the top level and from 1 under a new row. A note row goes to
 * its parent's notes (and fills the parent's empty url when it is a bare link):
 * a new parent's in the plan, the existing parent's through `parentNotes`, and
 * with no parent at all (a note at the top of a board) it becomes a plain step,
 * so no pasted text is lost. Notes are transparent to structure: a row indented
 * under a note belongs to the row the note belongs to.
 */
export function planTree(
  rows: PasteRow[],
  parentId: string | null,
  firstOrder: number,
  newId: () => string,
): { rows: TreeRow[]; parentNotes: string[]; parentUrl: string | null } {
  const out: TreeRow[] = [];
  const made = new Map<number, TreeRow>();
  const next = new Map<string | null, number>();
  const parentNotes: string[] = [];
  let parentUrl: string | null = null;
  const shape = pasteStructure(rows, parentId !== null);

  rows.forEach((r, i) => {
    const p = shape.parent[i];
    const target = p === null ? undefined : made.get(p);
    const parent = target ? target.id : parentId;
    if (shape.node[i]) {
      const f = r.line.kind === "note"
        ? { title: r.line.title.trim(), ask: false, done: false, guess: null, outcome: null }
        : nodeFieldsOf(r.line);
      const url = r.line.kind === "note" && isBareUrl(f.title) ? linkOf(f.title) : null;
      const n = next.get(parent) ?? (parent === parentId ? firstOrder : 1);
      next.set(parent, n + 1);
      const row: TreeRow = { id: newId(), parent_id: parent, sort_order: n, ...f, notes: "", url };
      out.push(row);
      made.set(i, row);
      return;
    }
    if (r.line.kind !== "note") return;
    const text = r.line.title.trim();
    if (!text) return;
    const link = isBareUrl(text) ? linkOf(text) : null;
    if (target) {
      target.notes = appendNote(target.notes, text);
      if (link && !target.url) target.url = link;
    } else {
      parentNotes.push(text);
      if (link && !parentUrl) parentUrl = link;
    }
  });
  return { rows: out, parentNotes, parentUrl };
}

// ---------------------------------------------------------------- tree helpers

/** Sibling order: sort_order, then created_at, then id (rows inserted together share created_at). */
export function compareSiblings(
  a: Pick<PlanNode, "sort_order" | "created_at" | "id">,
  b: Pick<PlanNode, "sort_order" | "created_at" | "id">,
): number {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Children by parent id, each list sorted by sort_order, then created_at. A
 * node whose parent is not in `nodes` is listed under null (a root), and so is
 * one node of every parent loop (A under B under A, which two devices moving at
 * once can leave in the database): the loop and everything below it would
 * otherwise be unreachable from the roots and vanish from the List and the Map
 * with no way to get at it. The lifted node is the loop's first in sibling
 * order, so the choice is stable.
 */
export function childrenMap<T extends PlanNode>(nodes: T[]): Map<string | null, T[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentOf = (n: T): string | null =>
    n.parent_id && byId.has(n.parent_id) && n.parent_id !== n.id ? n.parent_id : null;
  const map = new Map<string | null, T[]>();
  const add = (key: string | null, n: T) => {
    const list = map.get(key);
    if (list) list.push(n);
    else map.set(key, [n]);
  };
  for (const n of nodes) add(parentOf(n), n);

  // Everything reachable from the roots; whatever is left sits in or under a loop.
  const reached = new Set<string>();
  const mark = (id: string | null) => {
    const stack = [...(map.get(id) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (reached.has(n.id)) continue;
      reached.add(n.id);
      stack.push(...(map.get(n.id) ?? []));
    }
  };
  mark(null);
  if (reached.size < byId.size) {
    for (const n of [...nodes].sort(compareSiblings)) {
      if (reached.has(n.id)) continue;
      // Walking up from an unreached node stays unreached and must come back
      // round: the first node met twice is on the loop.
      const path = new Set<string>();
      let cur = n;
      while (!path.has(cur.id)) {
        path.add(cur.id);
        cur = byId.get(parentOf(cur)!)!;
      }
      const loop: T[] = [cur];
      for (let m = byId.get(parentOf(cur)!)!; m.id !== cur.id; m = byId.get(parentOf(m)!)!) loop.push(m);
      const lift = loop.sort(compareSiblings)[0];
      const from = map.get(parentOf(lift));
      if (from) from.splice(from.indexOf(lift), 1);
      add(null, lift);
      reached.add(lift.id);
      mark(lift.id);
    }
  }
  for (const list of map.values()) list.sort(compareSiblings);
  return map;
}

/** Every id below `id`, in outline order (not including `id`). Safe on a parent loop. */
export function descendants(id: string, nodes: PlanNode[]): string[] {
  const kids = childrenMap(nodes);
  const out: string[] = [];
  const seen = new Set<string>([id]);
  const walk = (pid: string) => {
    for (const c of kids.get(pid) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** True when putting `id` under `newParentId` would make it its own ancestor. */
export function wouldCycle(id: string, newParentId: string | null, nodes: PlanNode[]): boolean {
  if (newParentId === null) return false;
  if (newParentId === id) return true;
  return descendants(id, nodes).includes(newParentId);
}

/** Every node in outline order: roots by sort order, each followed by its subtree. */
export function outline<T extends PlanNode>(nodes: T[]): T[] {
  const kids = childrenMap(nodes);
  const out: T[] = [];
  const seen = new Set<string>();
  const walk = (n: T) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    out.push(n);
    for (const c of kids.get(n.id) ?? []) walk(c);
  };
  for (const r of kids.get(null) ?? []) walk(r);
  return out;
}

// ---------------------------------------------------------------- the frontier

/*
 * THE FRONTIER RULE:
 * "A node is on the frontier when it is open, has no open children, and - if it
 *  is a Step - no open Question above it except possibly its own parent."
 * "Open children" counts any open node below, not only direct children: a
 * settled question keeps its chosen option open, and that open work keeps the
 * question's ancestors (often the root) off the frontier.
 * Steps inside an unchosen option wait until the question settles: under
 * "Which channel? > Creator partnerships > Run campaign", the campaign waits for
 * the channel to be chosen, while "Will creators accept CPA? > Contact 10
 * creators" is the question's own test and only waits on what is above it.
 */

/** An open Step held by an open Question above its own parent. */
export function isWaiting<T extends PlanNode>(n: T, byId: Map<string, T>): boolean {
  if (n.ask || !isOpen(n)) return false;
  const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
  const seen = new Set<string>([n.id]);
  let cur = parent && parent.parent_id ? byId.get(parent.parent_id) : undefined;
  if (parent) seen.add(parent.id);
  while (cur && !seen.has(cur.id)) {
    if (isOpenQuestion(cur)) return true;
    seen.add(cur.id);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return false;
}

/** The open loops that can be worked on now, in outline order. */
export function frontier<T extends PlanNode>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = childrenMap(nodes);
  const openBelow = new Map<string, boolean>();
  const hasOpenBelow = (id: string, seen: Set<string>): boolean => {
    const known = openBelow.get(id);
    if (known !== undefined) return known;
    let any = false;
    for (const c of kids.get(id) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if (hasOpenBelow(c.id, seen) || isOpen(c)) any = true;
    }
    openBelow.set(id, any);
    return any;
  };
  return outline(nodes).filter((n) =>
    isOpen(n) && !hasOpenBelow(n.id, new Set([n.id])) && !isWaiting(n, byId),
  );
}

/** The first frontier Step under each root (the root itself when it is one), in order. */
export function nextPerRoot(nodes: PlanNode[]): Set<string> {
  const front = new Set(frontier(nodes).filter((n) => !n.ask).map((n) => n.id));
  const roots = new Set((childrenMap(nodes).get(null) ?? []).map((n) => n.id));
  const next = new Set<string>();
  let found = false;
  // Outline order visits each root and then its whole subtree before the next root.
  for (const n of outline(nodes)) {
    if (roots.has(n.id)) found = false;
    if (!found && front.has(n.id)) {
      next.add(n.id);
      found = true;
    }
  }
  return next;
}

// ---------------------------------------------------------------- records

/** A settled Question, or anything carrying a verdict. */
export function isRecord(n: PlanNode): boolean {
  return stateOf(n) === "settled" || n.verdict != null;
}

/**
 * True when the node or anything below it is a record. A record is never
 * hard-deleted from the List or Map; it can be dropped. Ticked Steps are not
 * records (the paths rule: a revision changes the map, never the record).
 */
export function hasRecord(id: string, nodes: PlanNode[]): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return [id, ...descendants(id, nodes)].some((i) => {
    const n = byId.get(i);
    return !!n && isRecord(n);
  });
}

/**
 * hasRecord for every node in one pass (a long List asks it of each row): the
 * records and every node above them. Walks up the tree as childrenMap shapes
 * it, so it agrees with hasRecord on a parent loop too.
 */
export function recordIds(nodes: PlanNode[]): Set<string> {
  const up = new Map<string, string>();
  for (const [pid, list] of childrenMap(nodes)) if (pid) for (const c of list) up.set(c.id, pid);
  const out = new Set<string>();
  for (const n of nodes) {
    if (!isRecord(n)) continue;
    for (let id: string | undefined = n.id; id && !out.has(id); id = up.get(id)) out.add(id);
  }
  return out;
}

// ---------------------------------------------------------------- writes as patches

/** What setNodeState writes, in one update. */
export interface StatePatch {
  done: boolean;
  dropped: boolean;
  outcome: string | null;
  verdict: Verdict | null;
  closed_at: string | null;
}

export interface StateOptions {
  outcome?: string | null;
  verdict?: Verdict | null;
  dropOpenChildren?: boolean;
  /**
   * Drops exactly these open nodes below it in the same write (Undo of a
   * reopen puts back the "chosen over" options the reopen brought back).
   */
  dropIds?: string[];
  /** Reopening a question keeps its old answer as a reference (default: cleared). */
  keepOutcome?: boolean;
}

const blankToNull = (s: string | null | undefined) => (s == null ? null : s.trim() || null);

/**
 * The columns a state change writes. "done" and "settled" are the same write
 * (the kind decides which it reads as). A node that stays closed keeps its
 * closed_at, so setting a verdict later does not move it. Reopening clears
 * done, dropped, closed_at and the verdict, and the outcome unless the node is
 * a question and `keepOutcome` (or an explicit `outcome`) asks to keep one.
 * A verdict is written only when a guess and an outcome exist (the DB CHECK),
 * and a stored verdict does not survive a new outcome: it graded the old one
 * ("thought tak, was tak" must never read as a miss).
 */
export function statePatch(n: PlanNode, state: NodeState, opts: StateOptions = {}, now: string): StatePatch {
  if (state === "open") {
    const keep = n.ask && (opts.keepOutcome || opts.outcome !== undefined);
    const outcome = keep ? blankToNull(opts.outcome !== undefined ? opts.outcome : n.outcome) : null;
    return { done: false, dropped: false, outcome, verdict: null, closed_at: null };
  }
  const dropped = state === "dropped";
  const outcome = blankToNull(opts.outcome !== undefined ? opts.outcome : n.outcome);
  const sameOutcome = outcome === blankToNull(n.outcome);
  const wanted = opts.verdict !== undefined ? opts.verdict : sameOutcome ? n.verdict : null;
  const verdict = wanted && n.ask && blankToNull(n.guess) && outcome ? wanted : null;
  const closed_at = n.done && !!n.dropped === dropped && n.closed_at ? n.closed_at : now;
  return { done: true, dropped, outcome, verdict, closed_at };
}

/** The open nodes below `id` (what "close and drop N open under it" drops). */
export function openDescendants(id: string, nodes: PlanNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return descendants(id, nodes).filter((i) => {
    const n = byId.get(i);
    return !!n && isOpen(n);
  });
}

const sameInstant = (a: string | null, b: string | null) =>
  !!a && !!b && (a === b || Date.parse(a) === Date.parse(b));

/**
 * What reopening `id` brings back with it: the nodes below it that were dropped
 * in the same write that closed it (settling by tapping a child, or "close and
 * drop the open ones under it"). Reopen undoes the close, so "chosen over" is
 * never a one-way door.
 */
export function droppedWith(id: string, nodes: PlanNode[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const n = byId.get(id);
  if (!n || !n.done || !n.closed_at) return [];
  return descendants(id, nodes).filter((i) => {
    const d = byId.get(i);
    return !!d && d.dropped && sameInstant(d.closed_at, n.closed_at);
  });
}

/**
 * Settling a question by tapping one of its children: the picked child stays
 * open, and the question's other open direct children are dropped with their
 * open subtrees (they stay visible, faded: "chosen over").
 */
export function settleDrops(questionId: string, childId: string, nodes: PlanNode[]): string[] {
  const kids = childrenMap(nodes).get(questionId) ?? [];
  const out: string[] = [];
  for (const c of kids) {
    if (c.id === childId || !isOpen(c)) continue;
    out.push(c.id, ...openDescendants(c.id, nodes));
  }
  return out;
}

/** The fields a title edit can carry, as updateNode receives them. */
export interface NodeEdit {
  title?: string;
  ask?: boolean;
  guess?: string | null;
}

export interface EditPatch {
  title?: string;
  ask?: boolean;
  guess?: string | null;
  verdict?: Verdict | null;
  done?: boolean;
  dropped?: boolean;
  outcome?: string | null;
  closed_at?: string | null;
}

/** A settled statement ("= ZAKAZ LOSOWANIA"): a settled question whose answer is its own title. */
export function isRule(n: PlanNode): boolean {
  return stateOf(n) === "settled" && (n.outcome ?? "").trim() === n.title.trim();
}

/**
 * A title edit is re-parsed: "X? ~ g" on a step makes it a question with a
 * guess, "X? = a" settles it with that answer, "= text" makes it a settled
 * rule. A plain title never demotes a question (Ctrl+/ does that, and a
 * question typed without '?' must survive a typo fix), and markers that are
 * absent leave the stored guess alone. A note-shaped title ("> x", a bare URL)
 * is kept as literal text: an edit never turns a node into a note.
 * Becoming a step clears the guess and the verdict; clearing the guess clears
 * the verdict (both are DB CHECKs).
 *
 * The same rules hold from every view (the List, the Map's inline editor, the
 * Details title), because they live here:
 *  - a step whose title already ends in '?' (a '?' meaning "maybe", or a
 *    question toggled to a step) stays a step when its title is fixed; only an
 *    added '~ guess' or '= answer' makes it a question;
 *  - a rule's answer is its text, so a plain edit of a rule moves both;
 *  - a record (a settled question, or anything graded) never becomes a step,
 *    which would wipe the guess and the grade and let it be deleted;
 *  - the guess of a closed question is fixed: it was written before the
 *    answer, and rewriting it afterwards would grade a different prior.
 */
export function editPatch(n: PlanNode, edit: NodeEdit, now: string): EditPatch {
  const out: EditPatch = {};
  let ask = !!n.ask;
  let guess = n.guess ?? null;
  const guessFixed = !!n.ask && n.done;
  let keepStep = false;

  if (edit.title !== undefined) {
    const p = parseLine(edit.title);
    if (p.kind === "note" || !p.title) {
      out.title = edit.title.trim();
    } else {
      out.title = p.title;
      keepStep = !n.ask && n.title.trim().endsWith("?") && p.kind === "question" && !p.guess;
      if (p.kind !== "step" && !keepStep) ask = true;
      if (p.guess && !guessFixed) guess = p.guess;
      if (p.kind === "settled") {
        out.done = true;
        out.dropped = false;
        out.outcome = p.outcome?.trim() || null;
        if (!n.done || n.dropped || !n.closed_at) out.closed_at = now;
        if (n.outcome !== out.outcome) out.verdict = null;
      } else if (p.kind === "step" && isRule(n)) {
        out.outcome = p.title;
      }
    }
  }
  if (edit.guess !== undefined && !guessFixed) {
    guess = blankToNull(edit.guess);
    if (guess && edit.ask !== false) ask = true;
  }
  if (edit.ask !== undefined) ask = edit.ask;
  if (!ask && isRecord(n)) ask = true;
  if (!ask) guess = null;

  if (ask !== !!n.ask) out.ask = ask;
  if (guess !== (n.guess ?? null)) out.guess = guess;
  if (!guess && n.verdict != null) out.verdict = null;
  return out;
}

/**
 * A title edit that answers an open question ("X? = a" typed on an open node):
 * the views send it through the same settle flow as the answer field (an
 * answer naming an option drops the others as "chosen over", and a written
 * guess is graded) instead of a bare title write. Null for anything else: a
 * rule ("= text"), a node already closed, a title without an answer.
 */
export function titleSettle(n: PlanNode, text: string): { title: string; outcome: string } | null {
  if (n.done || n.dropped) return null;
  const p = parseLine(text);
  const outcome = p.outcome?.trim();
  if (p.kind !== "settled" || !outcome || !p.title || outcome === p.title.trim()) return null;
  return { title: p.title, outcome };
}

/** The ids that `orderedIds` renumbers to 1..n, with only the changed ones listed. */
export function renumber(orderedIds: string[], current: Map<string, number>): { id: string; sort_order: number }[] {
  const out: { id: string; sort_order: number }[] = [];
  orderedIds.forEach((id, i) => {
    if (current.get(id) !== i + 1) out.push({ id, sort_order: i + 1 });
  });
  return out;
}

/** The siblings of a node under `parentId` (roots: the roots of `boardId`), in order. */
export function siblingsAt<T extends PlanNode>(nodes: T[], parentId: string | null, boardId: string | null, excludeId?: string): T[] {
  return nodes
    .filter((n) => n.id !== excludeId && (n.parent_id ?? null) === parentId &&
      (parentId !== null || (n.board_id ?? null) === boardId))
    .sort(compareSiblings);
}

const sortOrders = (nodes: PlanNode[]) => new Map(nodes.map((n) => [n.id, n.sort_order]));

/**
 * Where new nodes go under `parentId`: last (max + 1), or right after the
 * sibling `afterId`, in which case the siblings are renumbered 1..n and
 * `orders` lists the ones that move. `count` new siblings (a pasted list's top
 * level) take sort_order, sort_order + 1, ... in a row.
 */
export function placeNew(
  nodes: PlanNode[],
  parentId: string | null,
  boardId: string | null,
  afterId?: string | null,
  count = 1,
): { sort_order: number; orders: { id: string; sort_order: number }[] } {
  const siblings = siblingsAt(nodes, parentId, boardId);
  const at = afterId ? siblings.findIndex((s) => s.id === afterId) : -1;
  if (at < 0) {
    return { sort_order: siblings.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0) + 1, orders: [] };
  }
  const slots = Array.from({ length: Math.max(1, count) }, (_, i) => `\u0000new${i}`);
  const ordered = siblings.map((s) => s.id);
  ordered.splice(at + 1, 0, ...slots);
  return { sort_order: at + 2, orders: renumber(ordered, sortOrders(nodes)).filter((o) => !o.id.startsWith("\u0000new")) };
}

/** What moving a node writes, or null when the move would make a cycle (or names a missing node). */
export interface MovePlan {
  parent_id: string | null;
  sort_order: number;
  /** The node's board after the move (a new parent's board). */
  board_id: string | null;
  boardChanged: boolean;
  /** Everything below the node: its Map positions are cleared with the node's. */
  subtree: string[];
  /** Siblings that change place, in the new parent and (when it changed) the old one. */
  orders: { id: string; sort_order: number }[];
}

/**
 * Puts `id` under `newParentId` (null = a root of its board) at `index` among
 * its new siblings (clamped). Both sibling lists are renumbered 1..n.
 */
export function planMove(nodes: PlanNode[], id: string, newParentId: string | null, index: number): MovePlan | null {
  const n = nodes.find((x) => x.id === id);
  if (!n || wouldCycle(id, newParentId, nodes)) return null;
  const parent = newParentId ? nodes.find((x) => x.id === newParentId) : null;
  if (newParentId && !parent) return null;
  const boardId = parent ? parent.board_id ?? null : n.board_id ?? null;
  const current = sortOrders(nodes);
  const dest = siblingsAt(nodes, newParentId, boardId, id).map((s) => s.id);
  const at = Math.max(0, Math.min(Math.round(Number.isFinite(index) ? index : dest.length), dest.length));
  dest.splice(at, 0, id);
  const orders = renumber(dest, current).filter((o) => o.id !== id);
  if ((n.parent_id ?? null) !== newParentId || boardId !== (n.board_id ?? null)) {
    orders.push(...renumber(siblingsAt(nodes, n.parent_id ?? null, n.board_id ?? null, id).map((s) => s.id), current));
  }
  return {
    parent_id: newParentId,
    sort_order: at + 1,
    board_id: boardId,
    boardChanged: boardId !== (n.board_id ?? null),
    subtree: descendants(id, nodes),
    orders,
  };
}

// ---------------------------------------------------------------- copy and counts

export const PLACEHOLDERS = {
  root: "What are you aiming at?",
  underStep: "Next step… (end with ? to ask)",
  underQuestion: "An option, or a way to find out…",
} as const;

/** The add-box placeholder under `parent` (null = a new root). */
export function placeholderFor(parent: PlanNode | null): string {
  if (!parent) return PLACEHOLDERS.root;
  return parent.ask ? PLACEHOLDERS.underQuestion : PLACEHOLDERS.underStep;
}

/** For the header: "2 next · 4 open questions" (next = the tagged step per root). */
export function counts(nodes: PlanNode[]): { next: number; openQuestions: number } {
  return { next: nextPerRoot(nodes).size, openQuestions: nodes.filter(isOpenQuestion).length };
}
