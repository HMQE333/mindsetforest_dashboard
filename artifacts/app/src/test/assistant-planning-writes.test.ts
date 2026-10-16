import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// ---------------------------------------------------------------- a recording client

type Op = { table: string; kind: string; payload?: unknown; filters: [string, string, unknown][]; single?: boolean };
const db = vi.hoisted(() => ({
  calls: [] as Op[],
  rows: [] as Record<string, unknown>[],
  boards: [] as Record<string, unknown>[],
  fail: null as ((op: Op) => boolean) | null,
}));

function respond(op: Op) {
  db.calls.push(op);
  if (db.fail && db.fail(op)) return { data: null, error: { message: "boom" } };
  if (op.kind === "select") {
    const source = op.table === "planning_boards" ? db.boards : db.rows;
    const hits = source.filter((r) => op.filters.every(([kind, col, val]) => kind !== "eq" || r[col] === val));
    return { data: op.single ? hits[0] ?? null : hits, error: null };
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
        eq: (col: string, val: unknown) => { op.filters.push(["eq", col, val]); return b; },
        in: (col: string, val: unknown) => { op.filters.push(["in", col, val]); return b; },
        order: () => b,
        limit: () => b,
        maybeSingle: () => { op.single = true; return Promise.resolve(respond(op)); },
        single: () => { op.single = true; return Promise.resolve(respond(op)); },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(respond(op)).then(res, rej),
      };
      return b;
    },
  },
}));

const board = vi.hoisted(() => ({ remembered: null as string | null, ensure: { id: "b-open" } as { id: string } | { error: string }, ensured: 0 }));
vi.mock("@/lib/planning-board", () => ({
  getRememberedBoard: () => board.remembered,
  ensureBoard: async () => { board.ensured++; return board.ensure; },
}));

// emitAppEvent dispatches on window; this test runs without a DOM.
const events: string[] = [];
const hadWindow = "window" in globalThis;
if (!hadWindow) {
  (globalThis as Record<string, unknown>).window = { dispatchEvent: (e: Event) => { events.push(e.type); return true; } };
}
afterAll(() => { if (!hadWindow) delete (globalThis as Record<string, unknown>).window; });

import {
  addPlanningNodes,
  completePlanningTask,
  findAttachTarget,
  matchOpenNode,
  matchOpenNodes,
  missingAnswerError,
  planAssistantNodes,
  resolveAttachTarget,
  resolvePlanningCompletion,
} from "../lib/assistant-writes";
import { PLANNING_TASKS_CHANGED_EVENT } from "../hooks/usePlanningState";

const node = (id: string, over: Record<string, unknown> = {}) => ({
  id, user_id: "u1", board_id: "b-open", parent_id: null, title: id, ask: false, done: false, dropped: false,
  guess: null, outcome: null, verdict: null, closed_at: null, sort_order: 1, created_at: "2026-10-15T10:00:00+00:00", ...over,
});

beforeEach(() => {
  db.calls = [];
  db.rows = [];
  db.boards = [{ id: "b-open", name: "RybiaPaka", emoji: "🐟", user_id: "u1" }, { id: "b-other", name: "Inbox", emoji: "📥", user_id: "u1" }];
  db.fail = null;
  board.remembered = "b-open";
  board.ensure = { id: "b-open" };
  board.ensured = 0;
  events.length = 0;
});

const writes = () => db.calls.filter((c) => c.kind === "insert" || c.kind === "update");

// ---------------------------------------------------------------- pure helpers

describe("planAssistantNodes: one insert for a whole tree", () => {
  it("names parents by client id, numbers new children, and writes no legacy column", () => {
    let n = 0;
    const rows = planAssistantNodes(
      [
        { title: "Reach 1,000 active users", ask: false },
        { title: "Which channel?", ask: true, parentIndex: 0 },
        { title: "Creator partnerships", ask: false, parentIndex: 1 },
        { title: "Referral system", ask: false, parentIndex: 1 },
        { title: "Second root", ask: false },
      ],
      { userId: "u1", boardId: "b1", parentId: null },
      () => `id${++n}`,
    );
    expect(rows.map((r) => [r.id, r.parent_id, r.sort_order, r.ask])).toEqual([
      ["id1", null, undefined, false],
      ["id2", "id1", 1, true],
      ["id3", "id2", 1, false],
      ["id4", "id2", 2, false],
      ["id5", null, undefined, false],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({ user_id: "u1", board_id: "b1", done: false, dropped: false, notes: "" });
      for (const legacy of ["level", "deadline", "standalone", "project_id", "guess", "outcome"]) expect(r).not.toHaveProperty(legacy);
    }
  });

  it("hangs the batch's roots from an existing node and reads an old action's '?' as a question", () => {
    const rows = planAssistantNodes(
      [{ title: "Will creators accept CPA?" } as { title: string }, { title: "Contact 10 creators", parentIndex: 0, notes: "n" }],
      { userId: "u1", boardId: "b1", parentId: "existing" },
      (() => { let i = 0; return () => `x${++i}`; })(),
    );
    expect(rows[0]).toMatchObject({ parent_id: "existing", ask: true });
    expect(rows[0]).not.toHaveProperty("sort_order");
    expect(rows[1]).toMatchObject({ parent_id: "x1", ask: false, sort_order: 1, notes: "n" });
  });
});

describe("finding the node the assistant means", () => {
  const rows = [
    node("a", { title: "Zawody RybiaPaka", board_id: "b-other" }),
    node("b", { title: "Zawody", board_id: "b-open", done: true }),
    node("c", { title: "Zawody: nagrody", board_id: "b-open" }),
    node("d", { title: "Creator partnerships", board_id: "b-open", done: true, dropped: true }),
    node("e", { title: "Creator partnerships (fallback)", board_id: "b-open" }),
  ];

  it("attachTo: the open board first, exact before partial, open before closed, then the shortest title", () => {
    expect(findAttachTarget(rows, "zawody", "b-open")?.id).toBe("b"); // exact on the open board, even closed
    expect(findAttachTarget(rows, "rybiapaka", "b-open")?.id).toBe("a"); // not on the open board: any board
    expect(findAttachTarget(rows, "Creator partnerships", "b-open")?.id).toBe("d"); // exact wins
    expect(findAttachTarget(rows, "creator", "b-open")?.id).toBe("e"); // open beats dropped
    expect(findAttachTarget(rows, "nagrody", null)?.id).toBe("c");
    expect(findAttachTarget(rows, "nothing like it", "b-open")).toBeNull();
    expect(findAttachTarget(rows, "  ", "b-open")).toBeNull();
  });

  it("attachTo matches whole words and prefers the largest overlap, not the shortest title", () => {
    const ai = [node("ai", { title: "AI" }), node("dom", { title: "Domain setup" })];
    // "domain" contains the letters "ai", not the word.
    expect(findAttachTarget(ai, "Domain", "b-open")?.id).toBe("dom");
    const seo = [node("seo", { title: "SEO" }), node("kamp", { title: "Kampania SEO" })];
    expect(findAttachTarget(seo, "Kampania SEO na Instagramie", "b-open")?.id).toBe("kamp");
    // One short word that is a small part of the text is no match: new roots, said on the card.
    expect(findAttachTarget([node("seo", { title: "SEO" })], "Kampania SEO na Instagramie", "b-open")).toBeNull();
    expect(findAttachTarget([node("seo", { title: "SEO" })], "SEO plan", "b-open")?.id).toBe("seo");
  });

  it("complete_task: two open nodes with the same title are ambiguous, and 'Parent > Title' picks one", () => {
    const rows = [
      node("q", { title: "Which channel?", ask: true }),
      node("cr", { title: "Creators", parent_id: "q" }),
      node("rf", { title: "Referral", parent_id: "q" }),
      node("c1", { title: "Ile to kosztuje?", ask: true, parent_id: "cr" }),
      node("c2", { title: "Ile to kosztuje?", ask: true, parent_id: "rf" }),
    ];
    expect(matchOpenNodes(rows, "Ile to kosztuje?", "b-open")).toEqual({ ambiguous: [rows[3], rows[4]] });
    expect(matchOpenNode(rows, "Ile to kosztuje?", "b-open")).toBeNull();
    expect(matchOpenNodes(rows, "Referral > Ile to kosztuje?", "b-open")).toEqual({ node: rows[4] });
    expect(matchOpenNodes(rows, "creators › ile to kosztuje", "b-open")).toEqual({ node: rows[3] });
  });

  it("complete_task: only open nodes, the open board first, and no guess when it is ambiguous", () => {
    const open = [
      node("q1", { title: "Which channel?", ask: true, board_id: "b-open" }),
      node("q2", { title: "Which channel?", ask: true, board_id: "b-other" }),
      node("s1", { title: "Contact 10 creators", board_id: "b-other" }),
      node("s2", { title: "Contact 10 shops", board_id: "b-other" }),
      node("done", { title: "Ship it", done: true }),
    ];
    expect(matchOpenNode(open, "which channel", "b-open")?.id).toBe("q1");
    expect(matchOpenNode(open, "which channel", "b-other")?.id).toBe("q2");
    expect(matchOpenNode(open, "contact 10 creators", "b-open")?.id).toBe("s1");
    expect(matchOpenNode(open, "contact 10", "b-open")).toBeNull();
    expect(matchOpenNode(open, "ship it", "b-open")).toBeNull();
  });
});

// ---------------------------------------------------------------- writes

describe("addPlanningNodes", () => {
  it("writes a new tree in ONE insert on the board open in Planning", async () => {
    const r = await addPlanningNodes("u1", [
      { title: "Launch", ask: false },
      { title: "Which channel?", ask: true, parentIndex: 0 },
      { title: "Creators", ask: false, parentIndex: 1 },
    ]);
    expect(r).toEqual({ ok: true, created: 3, board: { id: "b-open", name: "RybiaPaka", emoji: "🐟" }, attachedTo: null });
    const inserts = db.calls.filter((c) => c.kind === "insert");
    expect(inserts).toHaveLength(1);
    expect(db.calls.filter((c) => c.kind === "update")).toHaveLength(0);
    const rows = inserts[0].payload as Record<string, unknown>[];
    expect(rows).toHaveLength(3);
    expect(rows[1].parent_id).toBe(rows[0].id);
    expect(rows[2].parent_id).toBe(rows[1].id);
    expect(rows.every((x) => typeof x.id === "string" && /^[0-9a-f-]{36}$/.test(x.id as string))).toBe(true);
    expect(rows.map((x) => x.board_id)).toEqual(["b-open", "b-open", "b-open"]);
    expect(events).toEqual([PLANNING_TASKS_CHANGED_EVENT]);
  });

  it("extends under the matched node, on that node's board, searching the open board first", async () => {
    db.rows = [
      node("far", { title: "Creator partnerships", board_id: "b-other" }),
      node("near", { title: "Creator partnerships", board_id: "b-open" }),
    ];
    board.remembered = "b-open";
    const r = await addPlanningNodes("u1", [{ title: "Will creators accept CPA?", ask: true }], { attachTo: "creator partnerships" });
    expect(r).toMatchObject({ ok: true, created: 1, attachedTo: "Creator partnerships", board: { id: "b-open", name: "RybiaPaka", emoji: "🐟" } });
    expect(board.ensured).toBe(0);
    const [ins] = db.calls.filter((c) => c.kind === "insert");
    expect(ins.payload).toEqual([expect.objectContaining({ parent_id: "near", board_id: "b-open", ask: true, title: "Will creators accept CPA?" })]);

    board.remembered = "b-other";
    db.calls = [];
    const far = await addPlanningNodes("u1", [{ title: "Step", ask: false }], { attachTo: "creator partnerships" });
    // Named in the toast: it may not be the board on screen.
    expect(far).toMatchObject({ ok: true, board: { id: "b-other", name: "Inbox", emoji: "📥" } });
    expect(db.calls.filter((c) => c.kind === "insert").map((c) => c.payload)).toEqual([
      [expect.objectContaining({ parent_id: "far", board_id: "b-other" })],
    ]);
  });

  it("with no match the nodes become new roots on the default board", async () => {
    const r = await addPlanningNodes("u1", [{ title: "A", ask: false }], { attachTo: "Nowhere" });
    expect(r).toMatchObject({ ok: true, attachedTo: null, board: { id: "b-open" } });
    expect(board.ensured).toBe(1);
    expect(db.calls.find((c) => c.kind === "insert")!.payload).toEqual([expect.objectContaining({ parent_id: null, board_id: "b-open" })]);
  });

  it("reports a failed insert or a missing board in Polish and fires nothing", async () => {
    db.fail = (op) => op.kind === "insert";
    const r = await addPlanningNodes("u1", [{ title: "A", ask: false }, { title: "B", ask: false }]);
    expect(r).toEqual({ ok: false, error: "Nie udało się zapisać 2 węzły w Planning: boom" });
    expect(events).toEqual([]);

    db.fail = null;
    db.calls = [];
    board.ensure = { error: "Nie udało się utworzyć tablicy „Inbox”" };
    expect(await addPlanningNodes("u1", [{ title: "A", ask: false }])).toEqual({ ok: false, error: "Nie udało się utworzyć tablicy „Inbox”" });
    expect(db.calls.filter((c) => c.kind === "insert")).toHaveLength(0);
  });
});

describe("complete_task", () => {
  it("refuses a question without an answer before the confirm card, naming it exactly", async () => {
    db.rows = [node("q", { title: "Which channel do we push next month?", ask: true })];
    const r = await resolvePlanningCompletion("u1", { title: "which channel" });
    expect(r).toEqual({ ok: false, error: missingAnswerError("Which channel do we push next month?") });
    expect(missingAnswerError("Q?")).toBe("„Q?” to otwarte pytanie: napisz, jaka jest odpowiedź, a wtedy je zamknę.");
    expect(await resolvePlanningCompletion("u1", { title: "which channel", outcome: "Creators" }))
      .toEqual({ ok: true, nodeId: "q", title: "Which channel do we push next month?", ask: true, parentTitle: null, drops: 0 });
    expect(await resolvePlanningCompletion("u1", { title: "missing" }))
      .toEqual({ ok: false, error: "Nie znaleziono otwartego kroku ani pytania „missing” w Planning" });
    expect(writes()).toHaveLength(0);
  });

  it("settles a question with the user's answer in ONE update and never sets a verdict", async () => {
    db.rows = [node("q", { title: "Which channel?", ask: true, guess: "creators" })];
    const r = await completePlanningTask("u1", { title: "Which channel?", outcome: "Creator partnerships", nodeId: "q" });
    expect(r).toEqual({ ok: true, title: "Which channel?", ask: true });
    const [w] = writes();
    expect(writes()).toHaveLength(1);
    expect(w.payload).toEqual({ done: true, dropped: false, outcome: "Creator partnerships", verdict: null, closed_at: expect.any(String) });
    expect(w.filters).toEqual(expect.arrayContaining([["eq", "id", "q"], ["eq", "user_id", "u1"]]));
    expect(events).toEqual([PLANNING_TASKS_CHANGED_EVENT]);
  });

  it("ticks a step and ignores an outcome the model sent for it", async () => {
    db.rows = [node("s", { title: "Contact 10 creators" })];
    const r = await completePlanningTask("u1", { title: "contact 10 creators", outcome: "done!" });
    expect(r).toEqual({ ok: true, title: "Contact 10 creators", ask: false });
    expect(writes()[0].payload).toEqual({ done: true, dropped: false, outcome: null, verdict: null, closed_at: expect.any(String) });
  });

  it("refuses an unanswered question at apply time too, and a node closed meanwhile", async () => {
    db.rows = [node("q", { title: "Which channel?", ask: true }), node("gone", { title: "Shipped", done: true })];
    expect(await completePlanningTask("u1", { title: "Which channel?" })).toEqual({ ok: false, error: missingAnswerError("Which channel?") });
    expect(await completePlanningTask("u1", { title: "Shipped", nodeId: "gone" })).toEqual({ ok: false, error: "„Shipped” jest już zamknięte" });
    expect(writes()).toHaveLength(0);
  });

  it("refuses a title that fits two open nodes before the card, saying where each one is", async () => {
    db.rows = [
      node("cr", { title: "Creators" }),
      node("rf", { title: "Referral" }),
      node("c1", { title: "Ile to kosztuje?", ask: true, parent_id: "cr" }),
      node("c2", { title: "Ile to kosztuje?", ask: true, parent_id: "rf" }),
    ];
    const r = await resolvePlanningCompletion("u1", { title: "Ile to kosztuje?", outcome: "500 zł" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe(
      "„Ile to kosztuje?” pasuje do 2 otwartych węzłów w Planning: „Ile to kosztuje?” pod „Creators”, „Ile to kosztuje?” pod „Referral”. " +
      "Napisz, o który chodzi (np. „Creators > Ile to kosztuje?”).",
    );
    expect(await resolvePlanningCompletion("u1", { title: "Referral > Ile to kosztuje?", outcome: "500 zł" }))
      .toEqual({ ok: true, nodeId: "c2", title: "Ile to kosztuje?", ask: true, parentTitle: "Referral", drops: 0 });
    // Applied without a node id, the same title is refused rather than guessed.
    expect(await completePlanningTask("u1", { title: "Ile to kosztuje?", outcome: "500 zł" })).toMatchObject({ ok: false });
    expect(writes()).toHaveLength(0);
  });

  it("settling with an option's name drops the other open options, first, with the question's closed_at", async () => {
    db.rows = [
      node("q", { title: "Which channel?", ask: true, guess: "creators" }),
      node("cr", { title: "Creators", parent_id: "q" }),
      node("rf", { title: "Referral system", parent_id: "q", sort_order: 2 }),
      node("rp", { title: "Build referral page", parent_id: "rf" }),
    ];
    const m = await resolvePlanningCompletion("u1", { title: "Which channel?", outcome: "creators" });
    expect(m).toMatchObject({ ok: true, nodeId: "q", drops: 2 });
    const r = await completePlanningTask("u1", { title: "Which channel?", outcome: "creators", nodeId: "q" });
    expect(r).toEqual({ ok: true, title: "Which channel?", ask: true });
    const [drop, settle] = writes();
    expect(drop.filters).toEqual(expect.arrayContaining([["in", "id", ["rf", "rp"]]]));
    expect(drop.payload).toEqual({ done: true, dropped: true, closed_at: (settle.payload as { closed_at: string }).closed_at });
    expect(settle.payload).toMatchObject({ done: true, outcome: "creators", verdict: null });
    expect(settle.filters).toEqual(expect.arrayContaining([["eq", "id", "q"]]));

    // An answer that names no option leaves them open.
    db.rows = db.rows.map((x) => (x.id === "q" ? { ...x, done: false } : x));
    db.calls = [];
    await completePlanningTask("u1", { title: "Which channel?", outcome: "Both, half each", nodeId: "q" });
    expect(writes()).toHaveLength(1);
  });

  it("resolves extend_mindmap's target before the card, or says nothing matches", async () => {
    db.rows = [node("ai", { title: "AI" }), node("dom", { title: "Domain setup" })];
    expect(await resolveAttachTarget("u1", "Domain")).toEqual({ ok: true, target: { id: "dom", title: "Domain setup" } });
    expect(await resolveAttachTarget("u1", "Nowhere at all")).toEqual({ ok: true, target: null });
    // The confirmed node is used as named, even if titles changed meanwhile.
    const r = await addPlanningNodes("u1", [{ title: "Buy it", ask: false }], { attachTo: "Domain", attachId: "ai" });
    expect(r).toMatchObject({ ok: true, attachedTo: "AI" });
  });

  it("ticks a row from before the open-loops migration the old way", async () => {
    db.rows = [{ id: "old", user_id: "u1", title: "Old task", done: false, board_id: null }];
    expect(await completePlanningTask("u1", { title: "old task" })).toEqual({ ok: true, title: "Old task", ask: false });
    expect(writes()[0].payload).toEqual({ done: true });
  });
});
