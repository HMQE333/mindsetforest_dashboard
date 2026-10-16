/**
 * Where the Planning Map puts each node. Pure (no React, no React Flow) so it
 * is tested on its own; PlanningMap turns the result into React Flow nodes.
 *
 * The engine is the old Map's: a leaf-count tree under one container node (the
 * board), stored positions respected, anchoring (a node keeps its place when
 * the tree changes around it, and new children sit next to a parent that was
 * moved rather than "running away" to its computed slot), and collision-aware
 * slotting. Children follow sort_order (childrenMap).
 */
import { childrenMap, descendants, type PlanNode } from "./planning-model";

export type XY = { x: number; y: number };

// Approximate node footprint (px) used for overlap tests. Kept below the
// tree spacing so a clean computed layout never registers as a collision;
// only manually-moved or ad-hoc nodes do.
export const NODE_W = 230;
export const NODE_H = 112;
export const X_SPACING = 260;
export const Y_SPACING = 120;

export function nodesOverlap(a: XY, b: XY, w = NODE_W, h = NODE_H): boolean {
  return Math.abs(a.x - b.x) < w && Math.abs(a.y - b.y) < h;
}

/** The nearest non-overlapping spot to `desired`, by an outward ring (spiral) search. */
export function findFreeSpot(desired: XY, occupied: XY[], w = NODE_W, h = NODE_H): XY {
  const collides = (p: XY) => occupied.some((o) => nodesOverlap(p, o, w, h));
  if (!collides(desired)) return desired;
  const stepX = w * 0.8;
  const stepY = h * 0.95;
  for (let ring = 1; ring <= 16; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // perimeter of the ring only
        const p = { x: desired.x + dx * stepX, y: desired.y + dy * stepY };
        if (!collides(p)) return p;
      }
    }
  }
  return desired;
}

export interface MapNode extends PlanNode {
  position_x: number | null;
  position_y: number | null;
}

export interface LayoutOptions {
  /** Use stored position_x/position_y (off in the Open loops view, which is laid out compactly). */
  persisted: boolean;
  /** Where each node (by id) is shown right now; null lays everything out afresh. */
  live: Map<string, XY> | null;
  /** Nodes moved to a new parent: laid out afresh under it, whatever is shown now. */
  relayout?: Set<string>;
}

export interface PlacedNode {
  id: string;
  /** null = a root, drawn under the board node. */
  parentId: string | null;
  position: XY;
  /** Where the leaf-count layout alone would put it. */
  computed: XY;
}

export interface MapLayout {
  board: XY;
  /** Every reachable node, parents before children, siblings in sort order. */
  placed: PlacedNode[];
}

const away = (a: XY, b: XY) => Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1;

/**
 * Lays `nodes` out under the board node. A node goes, in order of preference:
 * to its stored position; where it is shown now; next to its parent's real
 * position when that parent is not at its computed slot; to its computed slot.
 * Every free placement is nudged to the nearest empty spot, and everything
 * already in place counts as occupied before the first free placement.
 */
export function layoutMap(nodes: MapNode[], opts: LayoutOptions): MapLayout {
  const kids = childrenMap(nodes);
  const relayout = opts.relayout ?? new Set<string>();
  const leafMemo = new Map<string, number>();
  const leaves = (id: string, seen = new Set<string>()): number => {
    const known = leafMemo.get(id);
    if (known !== undefined) return known;
    seen.add(id);
    const children = (kids.get(id) ?? []).filter((c) => !seen.has(c.id));
    const n = children.length === 0 ? 1 : children.reduce((s, c) => s + leaves(c.id, seen), 0);
    leafMemo.set(id, n);
    return n;
  };

  const roots = kids.get(null) ?? [];
  const totalLeaves = roots.reduce((s, r) => s + Math.max(1, leaves(r.id)), 0);
  const treeCenterX = (Math.max(1, totalLeaves) * X_SPACING) / 2;
  const board = { x: treeCenterX - 100, y: 0 };

  const storedOf = (n: MapNode): XY | null =>
    opts.persisted && n.position_x != null && n.position_y != null ? { x: n.position_x, y: n.position_y } : null;
  const shownOf = (n: MapNode): XY | null =>
    opts.live && !relayout.has(n.id) ? opts.live.get(n.id) ?? null : null;

  const occupied: XY[] = [board];
  for (const n of nodes) {
    const p = storedOf(n) ?? shownOf(n);
    if (p) occupied.push(p);
  }

  const placed: PlacedNode[] = [];
  const done = new Set<string>();
  const walk = (parentId: string | null, children: MapNode[], depth: number, parentComputedX: number, parentActual: XY, parentMoved: boolean) => {
    const totalWidth = children.reduce((s, c) => s + Math.max(1, leaves(c.id)) * X_SPACING, 0);
    let currentX = parentComputedX - totalWidth / 2 + X_SPACING / 2;
    for (const child of children) {
      if (done.has(child.id)) continue;
      done.add(child.id);
      const leafCount = Math.max(1, leaves(child.id));
      const computed = { x: currentX + (leafCount * X_SPACING) / 2 - X_SPACING / 2, y: depth * Y_SPACING };

      const stored = storedOf(child);
      const shown = stored ? null : shownOf(child);
      let position: XY;
      if (stored) position = stored;
      else if (shown) position = shown;
      else {
        const base = parentMoved
          ? { x: parentActual.x + (computed.x - parentComputedX), y: parentActual.y + Y_SPACING }
          : computed;
        position = findFreeSpot(base, occupied);
        occupied.push(position);
      }
      placed.push({ id: child.id, parentId, position, computed });

      // A node anchors its own children to where it really is when it (or an
      // ancestor) is not at its computed slot.
      const moved = parentMoved || !!stored || (!!shown && away(shown, computed));
      const grandchildren = kids.get(child.id) ?? [];
      if (grandchildren.length > 0) walk(child.id, grandchildren, depth + 1, computed.x, position, moved);
      currentX += leafCount * X_SPACING;
    }
  };
  walk(null, roots, 1, treeCenterX, { x: treeCenterX, y: 0 }, false);
  return { board, placed };
}

/**
 * The nodes whose parent changed since the last layout (`prevParents`), with
 * everything below them: moveNode clears their stored positions, and this tells
 * the layout to place them afresh under the new parent instead of where they
 * are still shown.
 */
export function movedSubtrees(nodes: PlanNode[], prevParents: Map<string, string | null>): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (out.has(n.id) || !prevParents.has(n.id) || prevParents.get(n.id) === (n.parent_id ?? null)) continue;
    out.add(n.id);
    for (const d of descendants(n.id, nodes)) out.add(d);
  }
  return out;
}
