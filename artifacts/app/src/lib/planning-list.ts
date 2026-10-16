/**
 * The Planning List as data: which rows show, in what order and at what depth,
 * what each key does, and where a row goes when it is indented or moved.
 *
 * Pure (no React, no Supabase) so it is tested on its own. PlanningStack
 * renders it and writes only through usePlanningState; the model itself (kinds,
 * states, the frontier) lives in lib/planning-model.ts.
 */
import { childrenMap, frontier, siblingsAt, stateOf, wouldCycle, type PlanNode } from "./planning-model";

const isOpen = (n: PlanNode) => !n.done && !n.dropped;

/** The key a parent id is stored under in a Set (null = the board's top level). */
export const ROOT_KEY = "__root__";
export const parentKey = (id: string | null): string => id ?? ROOT_KEY;

// ---------------------------------------------------------------- the [Open loops] filter

/**
 * Frontier nodes plus the ancestors needed to place them (the header's [Open
 * loops] filter). `keep` adds rows that must stay in view while he works on
 * them, with their ancestors: a question just answered leaves the frontier at
 * once, yet its one-time "Did the guess hold?" still has to be asked.
 */
export function openLoopIds(nodes: PlanNode[], keep?: Iterable<string>): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set<string>();
  const place = (start: PlanNode | undefined) => {
    let cur = start;
    while (cur && !out.has(cur.id)) {
      out.add(cur.id);
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  };
  for (const f of frontier(nodes)) place(f);
  for (const id of keep ?? []) place(byId.get(id));
  return out;
}

// ---------------------------------------------------------------- visible rows

export type ListItem<T extends PlanNode> =
  | { kind: "row"; node: T; depth: number; hasChildren: boolean; folded: boolean }
  /** "Show N closed" under `parentId` (null = the top level). */
  | { kind: "closed"; parentId: string | null; depth: number; count: number; expanded: boolean };

export interface ListView {
  /** Parent keys (parentKey) whose closed rows are shown. Default: collapsed. */
  showClosed: ReadonlySet<string>;
  /** Rows whose subtree is folded by its chevron. */
  folded: ReadonlySet<string>;
  /** Rows that stay in view even when closed: just ticked here, being edited, being graded. */
  keep: ReadonlySet<string>;
  /** Only frontier nodes and their ancestors (and `keep`); no "Show N closed". */
  openLoopsOnly?: boolean;
}

/**
 * The rows of the outline, flattened in display order with their depth.
 *
 * Closed rows collapse under a "Show N closed" toggle per parent, except:
 *  - a closed row with open work below it (a settled question keeps its chosen
 *    option open, and that work must stay reachable);
 *  - the dropped options of a settled question ("chosen over": the record of
 *    what the answer was picked over stays visible, faded);
 *  - rows in `keep`, or holding one below them.
 */
export function listItems<T extends PlanNode>(nodes: T[], view: ListView): ListItem<T>[] {
  const kids = childrenMap(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const loops = view.openLoopsOnly ? openLoopIds(nodes, view.keep) : null;

  // "Something below is open / kept", memoised per node and safe on a parent loop.
  const below = new Map<string, { open: boolean; kept: boolean }>();
  const scan = (id: string, seen: Set<string>): { open: boolean; kept: boolean } => {
    const known = below.get(id);
    if (known) return known;
    const acc = { open: false, kept: false };
    for (const c of kids.get(id) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      const sub = scan(c.id, seen);
      if (sub.open || isOpen(c)) acc.open = true;
      if (sub.kept || view.keep.has(c.id)) acc.kept = true;
    }
    below.set(id, acc);
    return acc;
  };

  const hideable = (c: T, parent: T | undefined): boolean => {
    if (isOpen(c) || view.keep.has(c.id)) return false;
    if (parent && c.dropped && stateOf(parent) === "settled") return false;
    const sub = scan(c.id, new Set([c.id]));
    return !sub.open && !sub.kept;
  };

  const out: ListItem<T>[] = [];
  const seen = new Set<string>();

  const emit = (n: T, depth: number) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const children = kids.get(n.id) ?? [];
    const shown = loops ? children.filter((c) => loops.has(c.id)) : children;
    const folded = view.folded.has(n.id) && shown.length > 0;
    out.push({ kind: "row", node: n, depth, hasChildren: shown.length > 0, folded });
    if (!folded) walk(n.id, depth + 1);
  };

  const walk = (parentId: string | null, depth: number) => {
    const children = kids.get(parentId) ?? [];
    if (loops) {
      for (const c of children) if (loops.has(c.id)) emit(c, depth);
      return;
    }
    const parent = parentId ? byId.get(parentId) : undefined;
    const expanded = view.showClosed.has(parentKey(parentId));
    let hidden = 0;
    for (const c of children) {
      if (hideable(c, parent)) {
        hidden++;
        if (!expanded) continue;
      }
      emit(c, depth);
    }
    if (hidden > 0) out.push({ kind: "closed", parentId, depth, count: hidden, expanded });
  };

  walk(null, 0);
  return out;
}

/**
 * Where a new (not yet saved) row typed under `parentId` shows: right after
 * `afterId`'s subtree, or at the end of the parent's children (before the
 * parent's own "Show N closed" toggle). Returns an index into `items`.
 */
export function draftIndex<T extends PlanNode>(items: ListItem<T>[], parentId: string | null, afterId: string | null): number {
  const rowAt = (id: string) => items.findIndex((it) => it.kind === "row" && it.node.id === id);
  const regionEnd = (start: number, depth: number) => {
    let i = start + 1;
    while (i < items.length && items[i].depth > depth) i++;
    return i;
  };
  if (afterId) {
    const at = rowAt(afterId);
    if (at >= 0) return regionEnd(at, items[at].depth);
  }
  let end: number;
  if (parentId) {
    const at = rowAt(parentId);
    if (at < 0) return items.length;
    end = regionEnd(at, items[at].depth);
  } else {
    end = items.length;
  }
  const last = items[end - 1];
  if (last && last.kind === "closed" && last.parentId === parentId) return end - 1;
  return end;
}

/** Direct children counts for the "closed/total" tag on parents. */
export function childCounts(nodes: PlanNode[]): Map<string, { closed: number; total: number }> {
  const out = new Map<string, { closed: number; total: number }>();
  for (const [pid, list] of childrenMap(nodes)) {
    if (!pid) continue;
    out.set(pid, { closed: list.filter((c) => !isOpen(c)).length, total: list.length });
  }
  return out;
}

// ---------------------------------------------------------------- settling

/**
 * The one-tap answers for a question: its open direct children with no tick
 * history (no ticked Step anywhere in their subtree). A child that has been
 * worked on is a way of finding out, not a candidate answer.
 */
export function answerChoices<T extends PlanNode>(questionId: string, nodes: T[]): T[] {
  const kids = childrenMap(nodes);
  const ticked = (id: string, seen: Set<string>): boolean => {
    for (const c of kids.get(id) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      if ((c.done && !c.dropped) || ticked(c.id, seen)) return true;
    }
    return false;
  };
  return (kids.get(questionId) ?? []).filter((c) => isOpen(c) && !ticked(c.id, new Set([c.id])));
}

/** The choice a typed answer names (same text, ignoring case and spacing), if any. */
export function matchChoice<T extends PlanNode>(text: string, choices: T[]): T | undefined {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const t = norm(text);
  if (!t) return undefined;
  return choices.find((c) => norm(c.title) === t);
}

// ---------------------------------------------------------------- keys

export type RowKeyAction =
  | "newBelow" | "indent" | "outdent" | "moveUp" | "moveDown" | "close" | "toggleKind"
  | "deleteEmpty" | "stop" | "focusUp" | "focusDown";

export interface KeyLike {
  key: string;
  code?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  /** An auto-repeat of a held key (KeyboardEvent.repeat). */
  repeat?: boolean;
}

/**
 * What a key does while a row is being edited. Ctrl and Alt are each required
 * alone, because AltGr (Polish letters on Windows) reports Ctrl+Alt together:
 * "ą" must never reorder or close a row. Backspace on an empty row deletes it
 * only on a fresh press: holding Backspace to clear a line must not run on
 * into the row above (focus lands there) and delete that one too.
 */
export function rowKeyAction(e: KeyLike, text: string): RowKeyAction | null {
  if (e.isComposing) return null;
  const ctrl = (e.ctrlKey || e.metaKey) && !e.altKey;
  const alt = !!e.altKey && !e.ctrlKey && !e.metaKey;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (e.key === "Enter") {
    if (ctrl) return "close";
    if (plain && !e.shiftKey) return "newBelow";
    return null;
  }
  if (e.key === "Tab" && plain) return e.shiftKey ? "outdent" : "indent";
  if (e.key === "ArrowUp") return alt ? "moveUp" : plain && !e.shiftKey ? "focusUp" : null;
  if (e.key === "ArrowDown") return alt ? "moveDown" : plain && !e.shiftKey ? "focusDown" : null;
  if (ctrl && (e.key === "/" || e.code === "Slash")) return "toggleKind";
  if (e.key === "Backspace" && plain && text === "") return e.repeat ? null : "deleteEmpty";
  if (e.key === "Escape") return "stop";
  return null;
}

/** True for pasted text that should open the paste preview (more than one line). */
export function isMultiline(text: string): boolean {
  return /\n/.test(text.replace(/\r\n?/g, "\n").trim());
}

// ---------------------------------------------------------------- moving

export interface MoveTarget { parentId: string | null; index: number }

const parentOf = (n: PlanNode) => n.parent_id ?? null;
const siblingsOf = <T extends PlanNode>(n: T, nodes: T[]) => siblingsAt(nodes, parentOf(n), n.board_id ?? null);

/**
 * Tab: the node becomes the last child of the sibling above it. `visible`
 * limits "above" to rows on screen, so a row never vanishes under a collapsed
 * closed sibling. Null when there is no sibling above.
 */
export function indentTarget<T extends PlanNode>(id: string, nodes: T[], visible?: (id: string) => boolean): MoveTarget | null {
  const n = nodes.find((x) => x.id === id);
  if (!n) return null;
  const sibs = siblingsOf(n, nodes);
  const at = sibs.findIndex((s) => s.id === id);
  for (let i = at - 1; i >= 0; i--) {
    if (visible && !visible(sibs[i].id)) continue;
    return { parentId: sibs[i].id, index: Infinity };
  }
  return null;
}

/**
 * Shift+Tab: the node goes right after its parent. Null at the top level. In a
 * parent loop already in the data (A under B under A) the parent's place is
 * under the node itself, so the node goes to the top level instead, which is
 * also what breaks the loop.
 */
export function outdentTarget<T extends PlanNode>(id: string, nodes: T[]): MoveTarget | null {
  const n = nodes.find((x) => x.id === id);
  const parent = n?.parent_id ? nodes.find((x) => x.id === n.parent_id) : undefined;
  if (!n || !parent) return null;
  if (wouldCycle(id, parentOf(parent), nodes)) {
    return { parentId: null, index: siblingsAt(nodes, null, n.board_id ?? null, id).length };
  }
  const sibs = siblingsOf(parent, nodes);
  return { parentId: parentOf(parent), index: sibs.findIndex((s) => s.id === parent.id) + 1 };
}

/**
 * Alt+Up / Alt+Down: one place up or down among its siblings, skipping rows
 * that are not on screen. The index counts the siblings without the node, as
 * moveNode does. Null at either end.
 */
export function stepTarget<T extends PlanNode>(id: string, dir: -1 | 1, nodes: T[], visible?: (id: string) => boolean): MoveTarget | null {
  const n = nodes.find((x) => x.id === id);
  if (!n) return null;
  const sibs = siblingsOf(n, nodes);
  const at = sibs.findIndex((s) => s.id === id);
  let j = at + dir;
  while (j >= 0 && j < sibs.length && visible && !visible(sibs[j].id)) j += dir;
  if (j < 0 || j >= sibs.length) return null;
  // In the list without the node, index j is just above the sibling it passes
  // (moving up) or just below it (moving down).
  return { parentId: parentOf(n), index: j };
}

// ---------------------------------------------------------------- copy

export type RowTail =
  | { kind: "guess"; text: string }
  | { kind: "answer"; text: string }
  | { kind: "home"; text: string }
  | { kind: "why"; text: string };

/**
 * The muted text after a title: "~ guess", "= answer", "→ Home: …", or why it
 * was dropped. A rule ("= ZAKAZ LOSOWANIA") is its own answer, so it has none.
 */
export function rowTails(n: PlanNode): RowTail[] {
  const out: RowTail[] = [];
  const guess = n.guess?.trim();
  const outcome = n.outcome?.trim();
  if (n.ask && guess) out.push({ kind: "guess", text: guess });
  if (!outcome || outcome === n.title.trim()) return out;
  if (outcome.startsWith("→")) out.push({ kind: "home", text: outcome });
  else if (n.dropped) out.push({ kind: "why", text: outcome });
  else if (n.done) out.push({ kind: "answer", text: outcome });
  return out;
}

/** The mission description for Add to Home: "From Planning: <board> › <parent>". */
export function homeDescription(boardName: string | null | undefined, parentTitle: string | null | undefined): string {
  const where = [boardName?.trim(), parentTitle?.trim()].filter(Boolean).join(" › ");
  return (where ? `From Planning: ${where}` : "From Planning").slice(0, 240);
}

/** The outcome a node closes with when it goes to Home. */
export const homeOutcome = (categoryName: string): string => `→ Home: ${categoryName.trim()}`;
