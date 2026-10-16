import { describe, it, expect } from "vitest";
import {
  findFreeSpot,
  layoutMap,
  movedSubtrees,
  nodesOverlap,
  NODE_H,
  NODE_W,
  X_SPACING,
  Y_SPACING,
  type MapNode,
  type XY,
} from "../lib/planning-map-layout";

const T0 = "2026-10-15T10:00:00.000Z";

let seq = 0;
function node(id: string, parent_id: string | null, extra: Partial<MapNode> = {}): MapNode {
  seq += 1;
  return {
    id,
    board_id: "b1",
    parent_id,
    title: id,
    ask: false,
    done: false,
    dropped: false,
    guess: null,
    outcome: null,
    verdict: null,
    closed_at: null,
    sort_order: seq,
    created_at: T0,
    position_x: null,
    position_y: null,
    ...extra,
  };
}

const posOf = (layout: ReturnType<typeof layoutMap>, id: string): XY => {
  const p = layout.placed.find((x) => x.id === id);
  if (!p) throw new Error(`${id} not placed`);
  return p.position;
};

describe("layoutMap: leaf-count tree under the board", () => {
  it("centres the board over its roots and spaces leaves by X_SPACING", () => {
    const nodes = [node("a", null), node("a1", "a"), node("a2", "a"), node("b", null)];
    const l = layoutMap(nodes, { persisted: true, live: null });
    // 3 leaves -> tree 780 wide, centre 390.
    expect(l.board).toEqual({ x: 390 - 100, y: 0 });
    expect(posOf(l, "a1")).toEqual({ x: X_SPACING / 2, y: 2 * Y_SPACING });
    expect(posOf(l, "a2")).toEqual({ x: X_SPACING / 2 + X_SPACING, y: 2 * Y_SPACING });
    // A parent sits over the middle of its leaves.
    expect(posOf(l, "a").x).toBe((posOf(l, "a1").x + posOf(l, "a2").x) / 2);
    expect(posOf(l, "a").y).toBe(Y_SPACING);
    expect(posOf(l, "b")).toEqual({ x: X_SPACING / 2 + 2 * X_SPACING, y: Y_SPACING });
  });

  it("orders siblings by sort_order, not insertion", () => {
    const nodes = [node("p", null), node("late", "p", { sort_order: 2 }), node("early", "p", { sort_order: 1 })];
    const l = layoutMap(nodes, { persisted: true, live: null });
    expect(posOf(l, "early").x).toBeLessThan(posOf(l, "late").x);
    expect(l.placed.map((p) => p.id)).toEqual(["p", "early", "late"]);
  });

  it("records each node's parent (null for roots)", () => {
    const nodes = [node("r", null), node("c", "r")];
    const l = layoutMap(nodes, { persisted: true, live: null });
    expect(l.placed.map((p) => [p.id, p.parentId])).toEqual([["r", null], ["c", "r"]]);
  });

  it("survives a parent loop without hanging, and still places it", () => {
    const nodes = [node("r", null), node("x", "y"), node("y", "x")];
    const l = layoutMap(nodes, { persisted: true, live: null });
    // One node of the loop hangs from the board, the other from it: nothing disappears.
    expect(l.placed.map((p) => [p.id, p.parentId])).toEqual([["r", null], ["x", null], ["y", "x"]]);
  });
});

describe("layoutMap: stored positions and anchoring", () => {
  it("respects a stored position and hangs new children off the real spot", () => {
    const nodes = [node("r", null, { position_x: 1000, position_y: 500 }), node("c", "r")];
    const l = layoutMap(nodes, { persisted: true, live: null });
    expect(posOf(l, "r")).toEqual({ x: 1000, y: 500 });
    expect(posOf(l, "c")).toEqual({ x: 1000, y: 500 + Y_SPACING });
  });

  it("ignores stored positions in the Open loops view (persisted: false)", () => {
    const nodes = [node("r", null, { position_x: 1000, position_y: 500 })];
    const l = layoutMap(nodes, { persisted: false, live: null });
    expect(posOf(l, "r")).toEqual({ x: X_SPACING / 2, y: Y_SPACING });
  });

  it("keeps a shown node where it is when the tree grows around it", () => {
    const shown = new Map<string, XY>([["a", { x: 130, y: 120 }], ["b", { x: 390, y: 120 }]]);
    // "a" gains two children, which would push "b" right in a fresh layout.
    const nodes = [node("a", null), node("b", null), node("a1", "a"), node("a2", "a")];
    const l = layoutMap(nodes, { persisted: true, live: shown });
    expect(posOf(l, "b")).toEqual({ x: 390, y: 120 });
    expect(posOf(l, "a")).toEqual({ x: 130, y: 120 });
  });

  it("puts a new child next to a parent that is shown away from its computed slot", () => {
    const shown = new Map<string, XY>([["p", { x: 2000, y: 900 }]]);
    const nodes = [node("p", null), node("kid", "p")];
    const l = layoutMap(nodes, { persisted: true, live: shown });
    expect(posOf(l, "kid")).toEqual({ x: 2000, y: 900 + Y_SPACING });
  });

  it("lays a moved subtree out afresh under its new parent (relayout)", () => {
    const shown = new Map<string, XY>([
      ["a", { x: 130, y: 120 }],
      ["b", { x: 390, y: 120 }],
      ["m", { x: 5000, y: 5000 }],
    ]);
    const nodes = [node("a", null), node("b", null), node("m", "b")];
    const l = layoutMap(nodes, { persisted: true, live: shown, relayout: new Set(["m"]) });
    expect(posOf(l, "m")).toEqual({ x: 390, y: 120 + Y_SPACING });
  });

  it("nudges a free node off an occupied spot", () => {
    // "s" is stored right where "c" would go.
    const nodes = [node("r", null), node("c", "r"), node("s", null, { position_x: 130, position_y: 240 })];
    const l = layoutMap(nodes, { persisted: true, live: null });
    const c = posOf(l, "c");
    expect(nodesOverlap(c, { x: 130, y: 240 })).toBe(false);
  });
});

describe("findFreeSpot", () => {
  it("returns the desired spot when it is free", () => {
    expect(findFreeSpot({ x: 0, y: 0 }, [{ x: 1000, y: 1000 }])).toEqual({ x: 0, y: 0 });
  });
  it("finds the nearest free ring position", () => {
    const p = findFreeSpot({ x: 0, y: 0 }, [{ x: 0, y: 0 }]);
    expect(nodesOverlap(p, { x: 0, y: 0 })).toBe(false);
    // Ring steps are 0.8 / 0.95 of the footprint, so the first ring still overlaps and the second is free.
    expect(Math.abs(p.x)).toBeLessThanOrEqual(2 * 0.8 * NODE_W);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(2 * 0.95 * NODE_H);
  });
});

describe("movedSubtrees", () => {
  it("lists a node whose parent changed, with everything below it", () => {
    const nodes = [node("a", null), node("b", null), node("m", "b"), node("m1", "m"), node("z", "a")];
    const prev = new Map<string, string | null>([["a", null], ["b", null], ["m", "a"], ["m1", "m"], ["z", "a"]]);
    expect([...movedSubtrees(nodes, prev)].sort()).toEqual(["m", "m1"]);
  });
  it("ignores new nodes and unchanged ones", () => {
    const nodes = [node("a", null), node("n", "a")];
    expect(movedSubtrees(nodes, new Map([["a", null]])).size).toBe(0);
  });
});
