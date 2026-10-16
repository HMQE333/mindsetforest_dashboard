import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// A minimal hook harness: no DOM or React renderer in this test setup, so the
// hook runs as a plain function over a slot array (effects are not run; the
// tests call refetch themselves). Each render() resets the slot cursor.
vi.mock("react", () => {
  let slots: unknown[] = [];
  let i = 0;
  return {
    __reset: (fresh = false) => { if (fresh) slots = []; i = 0; },
    useState: (init: unknown) => {
      const k = i++;
      if (!(k in slots)) slots[k] = typeof init === "function" ? (init as () => unknown)() : init;
      return [slots[k], (v: unknown) => { slots[k] = typeof v === "function" ? (v as (p: unknown) => unknown)(slots[k]) : v; }];
    },
    useRef: (init: unknown) => {
      const k = i++;
      if (!(k in slots)) slots[k] = { current: init };
      return slots[k];
    },
    useCallback: (fn: unknown) => { i++; return fn; },
    useEffect: () => { i++; },
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }));

type Op = { table: string; kind: string; payload?: unknown; filters: [string, string, unknown][]; single?: boolean };
const calls: Op[] = [];
let rows: Record<string, unknown>[] = [];
let failNext: ((op: Op) => boolean) | null = null;

function respond(op: Op) {
  calls.push(op);
  if (failNext && failNext(op)) { failNext = null; return { data: null, error: { message: "boom" } }; }
  if (op.kind === "select") return { data: rows, error: null };
  if (op.kind === "insert") {
    const list = (op.payload as Record<string, unknown>[]).map((r, n) => ({
      id: r.id ?? `new${calls.length}-${n}`, created_at: "2026-10-15T12:00:00+00:00", notes: "", mentions: [], level: "task", ...r,
    }));
    return { data: op.single ? list[0] : list, error: null };
  }
  if (op.kind === "update" && op.single) {
    const id = op.filters.find((f) => f[1] === "id")?.[2];
    const row = rows.find((r) => r.id === id);
    return { data: { ...row, ...(op.payload as object) }, error: null };
  }
  return { data: null, error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const op: Op = { table, kind: "", filters: [] };
      const b: Record<string, unknown> = {
        select: () => { if (!op.kind) op.kind = "select"; return b; },
        insert: (p: unknown) => { op.kind = "insert"; op.payload = p; return b; },
        update: (p: unknown) => { op.kind = "update"; op.payload = p; return b; },
        delete: () => { op.kind = "delete"; return b; },
        eq: (c: string, v: unknown) => { op.filters.push(["eq", c, v]); return b; },
        in: (c: string, v: unknown) => { op.filters.push(["in", c, v]); return b; },
        or: (v: string) => { op.filters.push(["or", "", v]); return b; },
        order: () => b,
        single: () => { op.single = true; return b; },
        then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(respond(op)).then(ok, bad),
      };
      return b;
    },
  },
}));

import * as React from "react";
import { chunks, usePlanningState, IDS_PER_REQUEST, PLANNING_TASKS_CHANGED_EVENT } from "../hooks/usePlanningState";
import { parseLine, parsePaste } from "../lib/planning-model";

const events: string[] = [];
const hadWindow = "window" in globalThis;
if (!hadWindow) (globalThis as unknown as { window: EventTarget }).window = new EventTarget();
window.addEventListener(PLANNING_TASKS_CHANGED_EVENT, () => events.push("changed"));
afterAll(() => {
  if (!hadWindow) delete (globalThis as unknown as { window?: EventTarget }).window;
});

const render = () => {
  (React as unknown as { __reset: () => void }).__reset();
  return usePlanningState(undefined, { boardId: "b1" });
};

function row(id: string, parent_id: string | null, title: string, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: "u1", board_id: "b1", parent_id, title, ask: false, done: false, dropped: false,
    guess: null, outcome: null, verdict: null, closed_at: null, sort_order: 1, created_at: "2026-10-15T10:00:00+00:00",
    notes: "", url: null, mentions: [], position_x: 10, position_y: 20, level: "task", ...extra,
  };
}

const writes = () => calls.filter((c) => c.kind !== "select");
const idsOf = (op: Op) => {
  const f = op.filters.find((x) => x[1] === "id");
  return f ? (f[0] === "in" ? f[2] : [f[2]]) : [];
};

beforeEach(async () => {
  (React as unknown as { __reset: (fresh: boolean) => void }).__reset(true);
  calls.length = 0;
  events.length = 0;
  toast.mockClear();
  failNext = null;
  rows = [
    row("q", null, "Which channel?", { ask: true, guess: "creators", sort_order: 1 }),
    row("a", "q", "Creator partnerships", { sort_order: 1 }),
    row("a1", "a", "Run campaign", { sort_order: 1 }),
    row("b", "q", "Referral system", { sort_order: 2 }),
    row("b1", "b", "Test reward", { sort_order: 1 }),
    row("r2", null, "Second root", { sort_order: 2 }),
  ];
  await render().refetch();
  calls.length = 0;
});

describe("usePlanningState", () => {
  it("loads the board's rows with the open-loop columns", () => {
    const h = render();
    expect(h.tasks.map((t) => t.id)).toEqual(["q", "a", "a1", "b", "b1", "r2"]);
    expect(h.tasks[0]).toMatchObject({ ask: true, guess: "creators", dropped: false, verdict: null });
  });

  it("adds a typed question right after a sibling and renumbers the ones below", async () => {
    const created = await render().addNode({ boardId: "b1", parentId: "q", line: parseLine("Paid ads? ~ too pricey"), afterId: "a" });
    expect(created).toMatchObject({ title: "Paid ads?", ask: true, guess: "too pricey", sort_order: 2, parent_id: "q" });
    const [insert, ...bumps] = writes();
    expect(insert.kind).toBe("insert");
    expect(insert.payload).toEqual([expect.objectContaining({ board_id: "b1", parent_id: "q", ask: true, done: false, guess: "too pricey", sort_order: 2 })]);
    expect((insert.payload as Record<string, unknown>[])[0]).not.toHaveProperty("level");
    expect(bumps.map((b) => [idsOf(b), b.payload])).toEqual([[["b"], { sort_order: 3 }]]);
    expect(render().tasks.find((t) => t.id === "b")!.sort_order).toBe(3);
    expect(events).toEqual(["changed"]);
  });

  it("appends a note line to the parent's notes instead of adding a node", async () => {
    const parent = await render().addNode({ boardId: "b1", parentId: "a", line: parseLine("https://rybiapaka.pl/brief") });
    expect(writes()).toEqual([expect.objectContaining({ kind: "update", payload: { notes: "https://rybiapaka.pl/brief", url: "https://rybiapaka.pl/brief" } })]);
    expect(parent).toMatchObject({ id: "a", notes: "https://rybiapaka.pl/brief" });
  });

  it("inserts a pasted tree in ONE insert with client ids", async () => {
    const inserted = await render().insertTree("b1", "r2", parsePaste(["Spec", "  Model danych?", "  > z Prismy", "Warsztat UI"].join("\n")));
    const ins = writes().filter((w) => w.kind === "insert");
    expect(ins).toHaveLength(1);
    const payload = ins[0].payload as Record<string, unknown>[];
    expect(payload.map((p) => [p.title, p.parent_id === "r2" ? "r2" : p.parent_id === payload[0].id ? "Spec" : p.parent_id, p.sort_order]))
      .toEqual([["Spec", "r2", 1], ["Model danych?", "Spec", 1], ["Warsztat UI", "r2", 2]]);
    // The '>' line is a sibling of "Model danych?", so it is a note for their parent.
    expect(payload[0]).toMatchObject({ ask: false, notes: "z Prismy" });
    expect(payload[1]).toMatchObject({ ask: true, notes: "" });
    expect(inserted!.map((t) => t.title)).toEqual(["Spec", "Model danych?", "Warsztat UI"]);
  });

  it("settles a question by picking a child: the dropped options first, then the question", async () => {
    expect(await render().settleWithChild("q", "a")).toBe(true);
    // A failure between the two leaves the question open, so trying again finishes it.
    const [drop, settle] = writes();
    expect(idsOf(settle)).toEqual(["q"]);
    expect(settle.payload).toMatchObject({ done: true, dropped: false, outcome: "Creator partnerships", verdict: null });
    const closedAt = (settle.payload as { closed_at: string }).closed_at;
    expect(idsOf(drop)).toEqual(["b", "b1"]);
    expect(drop.payload).toEqual({ done: true, dropped: true, closed_at: closedAt });

    // Grading keeps closed_at; reopening brings the dropped options back.
    calls.length = 0;
    await render().setNodeState("q", "settled", { verdict: "right" });
    expect(writes()[0].payload).toMatchObject({ verdict: "right", closed_at: closedAt, outcome: "Creator partnerships" });
    calls.length = 0;
    await render().setNodeState("q", "open");
    const [restore, reopen] = writes();
    expect(reopen.payload).toEqual({ done: false, dropped: false, outcome: null, verdict: null, closed_at: null });
    expect(idsOf(restore)).toEqual(["b", "b1"]);
    expect(render().tasks.filter((t) => t.dropped)).toEqual([]);
  });

  it("closes and drops the open nodes below in the same closed_at", async () => {
    await render().setNodeState("a", "done", { dropOpenChildren: true });
    const [drop, close] = writes();
    expect(idsOf(close)).toEqual(["a"]);
    expect(idsOf(drop)).toEqual(["a1"]);
    expect((drop.payload as { closed_at: string }).closed_at).toBe((close.payload as { closed_at: string }).closed_at);
  });

  it("Undo of a reopen settles again and drops only the options the reopen brought back", async () => {
    await render().settleWithChild("q", "a");
    await render().setNodeState("q", "settled", { verdict: "right" });
    await render().setNodeState("q", "open", { keepOutcome: true });
    calls.length = 0;
    expect(await render().setNodeState("q", "settled", { outcome: "Creator partnerships", verdict: "right", dropIds: ["b", "b1"] })).toBe(true);
    const [drop, settle] = writes();
    expect(idsOf(drop)).toEqual(["b", "b1"]);
    expect(idsOf(settle)).toEqual(["q"]);
    expect(settle.payload).toMatchObject({ done: true, outcome: "Creator partnerships", verdict: "right" });
    expect((drop.payload as { closed_at: string }).closed_at).toBe((settle.payload as { closed_at: string }).closed_at);
    const t = render().tasks;
    expect(t.filter((x) => x.dropped).map((x) => x.id)).toEqual(["b", "b1"]);
    expect(t.find((x) => x.id === "a")!.done).toBe(false);
  });

  it("moves a node, refusing a cycle, renumbering both places and clearing Map positions", async () => {
    expect(await render().moveNode("q", "a1", 0)).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Can't move it there" }));
    expect(writes()).toEqual([]);

    expect(await render().moveNode("b", "a", 0)).toBe(true);
    const [move, subtree, ...orders] = writes();
    expect(move.payload).toEqual({ parent_id: "a", sort_order: 1, position_x: null, position_y: null });
    expect(idsOf(subtree)).toEqual(["b1"]);
    expect(orders.map((o) => [idsOf(o), o.payload])).toEqual([[["a1"], { sort_order: 2 }]]);
    const t = render().tasks;
    expect(t.find((x) => x.id === "b")).toMatchObject({ parent_id: "a", position_x: null });
    expect(t.find((x) => x.id === "b1")).toMatchObject({ position_x: null, position_y: null });
  });

  it("re-parses an edited title and refuses to delete a record", async () => {
    await render().updateNode("a1", { title: "Run campaign? ~ 3 tygodnie" });
    expect(writes()[0].payload).toEqual({ title: "Run campaign?", ask: true, guess: "3 tygodnie" });

    await render().settleWithChild("q", "a");
    calls.length = 0;
    expect(await render().deleteNodes(["q"])).toBe(false);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "This holds a record" }));
    expect(writes()).toEqual([]);

    expect(await render().deleteNodes(["r2"])).toBe(true);
    expect(writes()).toEqual([expect.objectContaining({ kind: "delete" })]);
    expect(render().tasks.some((t) => t.id === "r2")).toBe(false);
  });

  it("toasts, refetches and leaves local state alone when a write fails", async () => {
    failNext = (op) => op.kind === "update";
    expect(await render().setNodeState("a1", "done")).toBe(false);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Could not update it", variant: "destructive" }));
    expect(calls.some((c) => c.kind === "select")).toBe(true);
    expect(render().tasks.find((t) => t.id === "a1")!.done).toBe(false);
  });

  it("clears Map positions for many nodes in one update and one event", async () => {
    expect(await render().clearPositions(["q", "a", "b"])).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].payload).toEqual({ position_x: null, position_y: null });
    expect(idsOf(writes()[0])).toEqual(["q", "a", "b"]);
    expect(events).toEqual(["changed"]);
    expect(render().tasks.filter((t) => ["q", "a", "b"].includes(t.id)).every((t) => t.position_x === null)).toBe(true);
    expect(render().tasks.find((t) => t.id === "r2")!.position_x).toBe(10);
  });

  it("splits a big drop into requests of at most IDS_PER_REQUEST ids, the node last", async () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    for (let i = 0; i < 250; i++) rows.push(row(`p${i}`, "r2", `Pasted ${i}`, { sort_order: i + 1 }));
    await render().refetch();
    calls.length = 0;
    expect(await render().setNodeState("r2", "dropped", { dropOpenChildren: true })).toBe(true);
    const w = writes();
    expect(w.map((x) => idsOf(x).length)).toEqual([IDS_PER_REQUEST, IDS_PER_REQUEST, 50, 1]);
    expect(idsOf(w[w.length - 1])).toEqual(["r2"]);
    expect(render().tasks.filter((t) => t.parent_id === "r2").every((t) => t.dropped)).toBe(true);
  });

  it("settles through a typed '= answer' like the answer field: an option's name drops the others", async () => {
    expect(await render().updateNode("q", { title: "Which channel? = creator partnerships" })).toBe(true);
    const [drop, settle] = writes();
    expect(idsOf(drop)).toEqual(["b", "b1"]);
    expect(idsOf(settle)).toEqual(["q"]);
    // The option's own words are the answer, as when it is tapped.
    expect(settle.payload).toMatchObject({ done: true, dropped: false, outcome: "Creator partnerships", verdict: null });
    expect(settle.payload).not.toHaveProperty("title");
    expect((drop.payload as { closed_at: string }).closed_at).toBe((settle.payload as { closed_at: string }).closed_at);
    expect(render().tasks.find((t) => t.id === "q")!.guess).toBe("creators");

    // An answer that names no option drops nothing.
    calls.length = 0;
    expect(await render().updateNode("a1", { title: "Run campaign? = w maju" })).toBe(true);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].payload).toMatchObject({ title: "Run campaign?", ask: true, done: true, outcome: "w maju" });
  });

  it("never turns a settled question into a step (its guess and grade are the record)", async () => {
    await render().settleWithChild("q", "a");
    await render().setNodeState("q", "settled", { verdict: "right" });
    calls.length = 0;
    expect(await render().updateNode("q", { ask: false })).toBe(true);
    expect(writes()).toEqual([]);
    expect(render().tasks.find((t) => t.id === "q")).toMatchObject({ ask: true, guess: "creators", verdict: "right" });
  });

  it("inserts a pasted list where the draft was: after the sibling, renumbering the ones below", async () => {
    const inserted = await render().insertTree("b1", "q", parsePaste(["Paid ads", "  Budget?", "Partnerships"].join("\n")), "a");
    const [ins, ...bumps] = writes();
    const payload = ins.payload as Record<string, unknown>[];
    expect(payload.map((p) => [p.title, p.sort_order])).toEqual([["Paid ads", 2], ["Budget?", 1], ["Partnerships", 3]]);
    expect(bumps.map((b) => [idsOf(b), b.payload])).toEqual([[["b"], { sort_order: 4 }]]);
    expect(inserted!.map((t) => t.title)).toEqual(["Paid ads", "Budget?", "Partnerships"]);
    // peek() sees the rows before React re-renders.
    expect(render().peek().some((t) => t.title === "Paid ads")).toBe(true);
  });

  it("exposes only the open-loop API (no legacy level-era writers)", () => {
    const api = render() as unknown as Record<string, unknown>;
    for (const gone of ["addTask", "updateTask", "deleteTask", "toggleTask", "getProjectTasks", "getChildTasks"]) {
      expect(api).not.toHaveProperty(gone);
    }
  });
});
