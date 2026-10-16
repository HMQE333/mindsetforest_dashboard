import { describe, it, expect } from "vitest";
import { parsePaste, planMove, planTree, settleDrops, statePatch, type PlanNode } from "../lib/planning-model";
import {
  answerChoices,
  childCounts,
  draftIndex,
  homeDescription,
  homeOutcome,
  indentTarget,
  isMultiline,
  listItems,
  matchChoice,
  openLoopIds,
  outdentTarget,
  parentKey,
  ROOT_KEY,
  rowKeyAction,
  rowTails,
  stepTarget,
  type ListItem,
  type ListView,
} from "../lib/planning-list";

const T0 = "2026-10-15T10:00:00.000Z";
const NOW = "2026-10-15T12:00:00.000Z";

let seq = 0;
function node(id: string, parent_id: string | null, title: string, extra: Partial<PlanNode> = {}): PlanNode {
  seq += 1;
  return {
    id, board_id: "b1", parent_id, title,
    ask: false, done: false, dropped: false, guess: null, outcome: null, verdict: null, closed_at: null,
    sort_order: seq, created_at: T0,
    ...extra,
  };
}

/** A pasted outline as stored nodes (what insertTree writes), ids n1, n2, ... */
function treeOf(text: string): PlanNode[] {
  let i = 0;
  const plan = planTree(parsePaste(text), null, 1, () => `n${++i}`);
  return plan.rows.map((r) => ({
    id: r.id, board_id: "b1", parent_id: r.parent_id, title: r.title,
    ask: r.ask, done: r.done, dropped: false, guess: r.guess, outcome: r.outcome, verdict: null,
    closed_at: r.done ? T0 : null, sort_order: r.sort_order, created_at: T0,
  }));
}

const apply = (nodes: PlanNode[], ids: string[], patch: Partial<PlanNode>) =>
  nodes.map((n) => (ids.includes(n.id) ? { ...n, ...patch } : n));
const idOf = (nodes: PlanNode[], title: string) => {
  const n = nodes.find((x) => x.title === title);
  if (!n) throw new Error(`no node "${title}"`);
  return n.id;
};

const VIEW: ListView = { showClosed: new Set(), folded: new Set(), keep: new Set() };
/** The list as text: "  ○ title" rows and "  [Show 2 closed]" toggles, two spaces per depth. */
function render(items: ListItem<PlanNode>[]): string[] {
  return items.map((it) => {
    const pad = "  ".repeat(it.depth);
    if (it.kind === "closed") return `${pad}[${it.expanded ? "Hide" : "Show"} ${it.count} closed]`;
    const n = it.node;
    const mark = n.dropped ? "-" : n.ask ? (n.done ? "=" : "?") : n.done ? "x" : "o";
    return `${pad}${mark} ${n.title}${it.folded ? " …" : ""}`;
  });
}

const RYBIAPAKA = [
  "Reach 1,000 active users",
  "  Which channel do we push next month? ~ creators",
  "    Creator partnerships",
  "      Will creators accept CPA? ~ yes if payout > X",
  "        Contact 10 creators",
  "      Which creator size converts best?",
  "      Run micro-creator campaign",
  "    Referral system",
  "      Does the current reward motivate? ~ no",
  "        Test alternative reward",
].join("\n");

/** RybiaPaka with the channel question settled by tapping "Creator partnerships". */
function settledChannel(): PlanNode[] {
  const start = treeOf(RYBIAPAKA);
  const q = start.find((n) => n.title === "Which channel do we push next month?")!;
  const drops = settleDrops(q.id, idOf(start, "Creator partnerships"), start);
  const patch = statePatch(q, "settled", { outcome: "Creator partnerships" }, NOW);
  return apply(apply(start, [q.id], patch), drops, { done: true, dropped: true, closed_at: NOW });
}

describe("listItems", () => {
  it("shows an open outline as it is, by depth", () => {
    expect(render(listItems(treeOf(RYBIAPAKA), VIEW))).toEqual([
      "o Reach 1,000 active users",
      "  ? Which channel do we push next month?",
      "    o Creator partnerships",
      "      ? Will creators accept CPA?",
      "        o Contact 10 creators",
      "      ? Which creator size converts best?",
      "      o Run micro-creator campaign",
      "    o Referral system",
      "      ? Does the current reward motivate?",
      "        o Test alternative reward",
    ]);
  });

  it("collapses closed rows under one toggle per parent, and expands them on request", () => {
    const nodes = [
      node("r", null, "Plan"),
      node("a", "r", "Done one", { done: true, closed_at: T0 }),
      node("b", "r", "Still open"),
      node("c", "r", "Dropped one", { done: true, dropped: true, closed_at: T0 }),
      node("z", null, "Closed root", { done: true, closed_at: T0 }),
    ];
    expect(render(listItems(nodes, VIEW))).toEqual([
      "o Plan",
      "  o Still open",
      "  [Show 2 closed]",
      "[Show 1 closed]",
    ]);
    const open = listItems(nodes, { ...VIEW, showClosed: new Set(["r", parentKey(null)]) });
    expect(render(open)).toEqual([
      "o Plan",
      "  x Done one",
      "  o Still open",
      "  - Dropped one",
      "  [Hide 2 closed]",
      "x Closed root",
      "[Hide 1 closed]",
    ]);
    expect(parentKey(null)).toBe(ROOT_KEY);
  });

  it("keeps a settled question with open work below it, and its dropped options as 'chosen over'", () => {
    const rows = render(listItems(settledChannel(), VIEW));
    expect(rows).toEqual([
      "o Reach 1,000 active users",
      "  = Which channel do we push next month?",
      "    o Creator partnerships",
      "      ? Will creators accept CPA?",
      "        o Contact 10 creators",
      "      ? Which creator size converts best?",
      "      o Run micro-creator campaign",
      "    - Referral system",
      "      [Show 1 closed]",
    ]);
  });

  it("folds the settled question away once everything under it is closed", () => {
    let nodes = settledChannel();
    const open = nodes.filter((n) => !n.done).map((n) => n.id).filter((id) => id !== idOf(nodes, "Reach 1,000 active users"));
    nodes = apply(nodes, open, { done: true, closed_at: NOW });
    expect(render(listItems(nodes, VIEW))).toEqual(["o Reach 1,000 active users", "  [Show 1 closed]"]);
  });

  it("keeps rows in `keep` (just ticked, being edited) and whatever holds them", () => {
    const nodes = [
      node("r", null, "Plan", { done: true, closed_at: T0 }),
      node("a", "r", "Just ticked", { done: true, closed_at: NOW }),
      node("b", "r", "Older", { done: true, closed_at: T0 }),
    ];
    expect(render(listItems(nodes, { ...VIEW, keep: new Set(["a"]) }))).toEqual([
      "x Plan",
      "  x Just ticked",
      "  [Show 1 closed]",
    ]);
  });

  it("hides a folded subtree but still marks the row as having children", () => {
    const items = listItems(treeOf(RYBIAPAKA), { ...VIEW, folded: new Set(["n3"]) });
    expect(render(items).slice(0, 4)).toEqual([
      "o Reach 1,000 active users",
      "  ? Which channel do we push next month?",
      "    o Creator partnerships …",
      "    o Referral system",
    ]);
    const row = items[2];
    expect(row.kind === "row" && row.hasChildren && row.folded).toBe(true);
  });

  it("with [Open loops], shows only frontier nodes and the ancestors that place them", () => {
    expect(render(listItems(settledChannel(), { ...VIEW, openLoopsOnly: true }))).toEqual([
      "o Reach 1,000 active users",
      "  = Which channel do we push next month?",
      "    o Creator partnerships",
      "      ? Will creators accept CPA?",
      "        o Contact 10 creators",
      "      ? Which creator size converts best?",
      "      o Run micro-creator campaign",
    ]);
    const ids = openLoopIds(treeOf(RYBIAPAKA));
    expect([...ids].sort()).toEqual(["n1", "n2", "n3", "n6"]);
  });

  it("keeps a just-answered question and its grading in view under [Open loops]", () => {
    // "Will creators accept CPA?" answered: it leaves the frontier, yet its guess is still to be graded.
    let nodes = settledChannel();
    const cpa = idOf(nodes, "Will creators accept CPA?");
    nodes = apply(nodes, [cpa, idOf(nodes, "Contact 10 creators")], { done: true, outcome: "tylko ze stałą opłatą", closed_at: NOW });
    const without = render(listItems(nodes, { ...VIEW, openLoopsOnly: true }));
    expect(without).not.toContain("      = Will creators accept CPA?");
    const kept = render(listItems(nodes, { ...VIEW, openLoopsOnly: true, keep: new Set([cpa]) }));
    expect(kept).toContain("      = Will creators accept CPA?");
    expect(kept.indexOf("    o Creator partnerships")).toBeLessThan(kept.indexOf("      = Will creators accept CPA?"));
    expect([...openLoopIds(nodes, [cpa])]).toContain(cpa);
  });

  it("survives a parent loop already in the data, showing it rather than losing it", () => {
    const nodes = [node("a", "b", "A"), node("b", "a", "B"), node("r", null, "Root")];
    expect(render(listItems(nodes, VIEW))).toEqual(["o A", "  o B", "o Root"]);
    // Shift+Tab on either row of the loop goes to the top level, which breaks the loop.
    expect(outdentTarget("a", nodes)).toEqual({ parentId: null, index: 1 });
    expect(outdentTarget("b", nodes)).toEqual({ parentId: null, index: 1 });
  });
});

describe("draftIndex", () => {
  const nodes = [
    node("r", null, "Plan"),
    node("a", "r", "First"),
    node("a1", "a", "Under first"),
    node("b", "r", "Second", { done: true, closed_at: T0 }),
    node("s", null, "Second root"),
  ];
  const items = listItems(nodes, VIEW);

  it("puts a new row right after a sibling's whole subtree", () => {
    expect(render(items)).toEqual(["o Plan", "  o First", "    o Under first", "  [Show 1 closed]", "o Second root"]);
    expect(draftIndex(items, "r", "a")).toBe(3);
    expect(draftIndex(items, null, "r")).toBe(4);
  });

  it("puts a row added at the end of a parent before that parent's closed toggle", () => {
    expect(draftIndex(items, "r", null)).toBe(3);
    expect(draftIndex(items, "a", null)).toBe(3);
    expect(draftIndex(items, null, null)).toBe(5);
  });

  it("falls back to the end of the parent when the sibling is not on screen", () => {
    expect(draftIndex(items, "r", "b")).toBe(3);
    expect(draftIndex(items, "gone", null)).toBe(items.length);
  });
});

describe("childCounts", () => {
  it("counts closed and total direct children", () => {
    const counts = childCounts(settledChannel());
    expect(counts.get("n2")).toEqual({ closed: 1, total: 2 });
    expect(counts.get("n1")).toEqual({ closed: 1, total: 1 });
    expect(counts.has("n5")).toBe(false);
  });
});

describe("settling", () => {
  it("offers open direct children with no tick history as one-tap answers", () => {
    const nodes = [
      node("q", null, "Which channel?", { ask: true }),
      node("a", "q", "Creators"),
      node("b", "q", "Ads"),
      node("b1", "b", "Ran a test", { done: true, closed_at: T0 }),
      node("c", "q", "SEO", { done: true, dropped: true, closed_at: T0 }),
      node("d", "q", "Referrals"),
      node("d1", "d", "Dropped idea", { done: true, dropped: true, closed_at: T0 }),
    ];
    expect(answerChoices("q", nodes).map((n) => n.title)).toEqual(["Creators", "Referrals"]);
  });

  it("matches a typed answer to a choice ignoring case and spacing", () => {
    const choices = [node("a", "q", "Creator  partnerships"), node("b", "q", "Ads")];
    expect(matchChoice("  creator partnerships ", choices)?.id).toBe("a");
    expect(matchChoice("Ad", choices)).toBeUndefined();
    expect(matchChoice("", choices)).toBeUndefined();
  });
});

describe("rowKeyAction", () => {
  const k = (key: string, mods: Partial<Record<"shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "isComposing", boolean>> = {}, code?: string) =>
    ({ key, code, ...mods });

  it("maps the outliner keys", () => {
    expect(rowKeyAction(k("Enter"), "x")).toBe("newBelow");
    expect(rowKeyAction(k("Tab"), "x")).toBe("indent");
    expect(rowKeyAction(k("Tab", { shiftKey: true }), "x")).toBe("outdent");
    expect(rowKeyAction(k("ArrowUp", { altKey: true }), "x")).toBe("moveUp");
    expect(rowKeyAction(k("ArrowDown", { altKey: true }), "x")).toBe("moveDown");
    expect(rowKeyAction(k("Enter", { ctrlKey: true }), "x")).toBe("close");
    expect(rowKeyAction(k("Enter", { metaKey: true }), "x")).toBe("close");
    expect(rowKeyAction(k("/", { ctrlKey: true }), "x")).toBe("toggleKind");
    expect(rowKeyAction(k("?", { ctrlKey: true, shiftKey: true }, "Slash"), "x")).toBe("toggleKind");
    expect(rowKeyAction(k("Escape"), "x")).toBe("stop");
    expect(rowKeyAction(k("ArrowUp"), "x")).toBe("focusUp");
    expect(rowKeyAction(k("ArrowDown"), "x")).toBe("focusDown");
  });

  it("deletes only an empty row on Backspace, and only on a fresh press", () => {
    expect(rowKeyAction(k("Backspace"), "")).toBe("deleteEmpty");
    expect(rowKeyAction(k("Backspace"), "a")).toBeNull();
    expect(rowKeyAction(k("Backspace", { ctrlKey: true }), "")).toBeNull();
    // Holding Backspace to clear a line: the auto-repeat must not delete the row, or the next one up.
    expect(rowKeyAction({ key: "Backspace", repeat: true }, "")).toBeNull();
    expect(rowKeyAction({ key: "ArrowUp", repeat: true }, "x")).toBe("focusUp");
  });

  it("ignores AltGr (Ctrl+Alt: Polish letters) and IME composition", () => {
    expect(rowKeyAction(k("ArrowUp", { altKey: true, ctrlKey: true }), "x")).toBeNull();
    expect(rowKeyAction(k("Enter", { altKey: true, ctrlKey: true }), "x")).toBeNull();
    expect(rowKeyAction(k("/", { altKey: true, ctrlKey: true }), "x")).toBeNull();
    expect(rowKeyAction(k("Enter", { isComposing: true }), "x")).toBeNull();
    expect(rowKeyAction(k("ą"), "x")).toBeNull();
    expect(rowKeyAction(k("Enter", { shiftKey: true }), "x")).toBeNull();
  });
});

describe("isMultiline", () => {
  it("is true only for more than one non-blank line", () => {
    expect(isMultiline("a\nb")).toBe(true);
    expect(isMultiline("a\r\nb")).toBe(true);
    expect(isMultiline("one line\n")).toBe(false);
    expect(isMultiline("\n  one line  \n\n")).toBe(false);
  });
});

describe("moving", () => {
  const nodes = [
    node("a", null, "A"),
    node("b", null, "B"),
    node("b1", "b", "B1"),
    node("x", null, "X (closed)", { done: true, closed_at: T0 }),
    node("c", null, "C"),
  ];
  const all = () => true;
  const onScreen = (id: string) => id !== "x";
  const order = (list: PlanNode[], parent: string | null) =>
    list.filter((n) => n.parent_id === parent).sort((p, q) => p.sort_order - q.sort_order).map((n) => n.id);
  const move = (id: string, t: { parentId: string | null; index: number }) => {
    const plan = planMove(nodes, id, t.parentId, t.index)!;
    let next = apply(nodes, [id], { parent_id: plan.parent_id, sort_order: plan.sort_order });
    for (const o of plan.orders) next = apply(next, [o.id], { sort_order: o.sort_order });
    return next;
  };

  it("indents under the sibling above on screen, at the end of its children", () => {
    expect(indentTarget("c", nodes, onScreen)).toEqual({ parentId: "b", index: Infinity });
    expect(indentTarget("c", nodes, all)).toEqual({ parentId: "x", index: Infinity });
    expect(indentTarget("a", nodes)).toBeNull();
    expect(order(move("c", indentTarget("c", nodes, onScreen)!), "b")).toEqual(["b1", "c"]);
  });

  it("outdents to right after the parent", () => {
    const t = outdentTarget("b1", nodes)!;
    expect(t).toEqual({ parentId: null, index: 2 });
    expect(order(move("b1", t), null)).toEqual(["a", "b", "b1", "x", "c"]);
    expect(outdentTarget("a", nodes)).toBeNull();
  });

  it("moves one place up or down among the siblings on screen", () => {
    const up = stepTarget("c", -1, nodes, onScreen)!;
    expect(order(move("c", up), null)).toEqual(["a", "c", "b", "x"]);
    const down = stepTarget("b", 1, nodes, onScreen)!;
    expect(order(move("b", down), null)).toEqual(["a", "x", "c", "b"]);
    expect(order(move("a", stepTarget("a", 1, nodes)!), null)).toEqual(["b", "a", "x", "c"]);
    expect(stepTarget("a", -1, nodes)).toBeNull();
    expect(stepTarget("c", 1, nodes)).toBeNull();
  });
});

describe("copy", () => {
  it("writes the muted tail: guess, answer, Home, or why it was dropped", () => {
    expect(rowTails(node("q", null, "Q?", { ask: true, guess: "60%" }))).toEqual([{ kind: "guess", text: "60%" }]);
    expect(rowTails(node("q", null, "Q?", { ask: true, guess: "a", done: true, outcome: "b", closed_at: T0 }))).toEqual([
      { kind: "guess", text: "a" }, { kind: "answer", text: "b" },
    ]);
    expect(rowTails(node("r", null, "ZAKAZ LOSOWANIA", { ask: true, done: true, outcome: "ZAKAZ LOSOWANIA", closed_at: T0 }))).toEqual([]);
    expect(rowTails(node("s", null, "Push-ups", { done: true, outcome: "→ Home: Body", closed_at: T0 }))).toEqual([
      { kind: "home", text: "→ Home: Body" },
    ]);
    expect(rowTails(node("d", null, "Ads", { done: true, dropped: true, outcome: "za drogie", closed_at: T0 }))).toEqual([
      { kind: "why", text: "za drogie" },
    ]);
    expect(rowTails(node("g", null, "Step with a stray guess", { guess: "x" }))).toEqual([]);
  });

  it("names where a Home mission came from", () => {
    expect(homeDescription("📁 Grow RybiaPaka", "Reach 1,000 active users")).toBe("From Planning: 📁 Grow RybiaPaka › Reach 1,000 active users");
    expect(homeDescription("📥 Inbox", null)).toBe("From Planning: 📥 Inbox");
    expect(homeDescription(null, undefined)).toBe("From Planning");
    expect(homeDescription("b", "x".repeat(400))).toHaveLength(240);
    expect(homeOutcome(" Body ")).toBe("→ Home: Body");
  });
});
