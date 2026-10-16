import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  PLAN_LINE_MAX_CHARS,
  PLAN_OPEN_QUESTIONS_HEADER,
  PLAN_SETTLED_HEADER,
  PLAN_TREE_MAX_CHARS,
  capItems,
  planningContext,
  toPlanNode,
} from "../lib/assistant-context";
import {
  OPEN_QUESTIONS_HEADER,
  PLAN_LINE_MAX_CHARS as SERVER_LINE_MAX_CHARS,
  SETTLED_HEADER,
  capItems as serverCapItems,
  planGuessLines,
  planningLines,
} from "../../../../supabase/functions/_shared/planning-lines";

const planner = () => readFileSync(new URL("../../../../supabase/functions/_shared/planner.ts", import.meta.url), "utf8");
const serverLinesSource = () => readFileSync(new URL("../../../../supabase/functions/_shared/planning-lines.ts", import.meta.url), "utf8");

type Row = Record<string, unknown>;
let clock = 0;
/** A planning_tasks row as the database returns it (created in call order). */
function row(id: string, over: Row = {}): Row {
  clock += 1;
  return {
    id, user_id: "u1", board_id: "b1", parent_id: null, title: id, ask: false, done: false, dropped: false,
    guess: null, outcome: null, verdict: null, closed_at: null, sort_order: 1,
    created_at: `2026-10-15T10:${String(clock).padStart(2, "0")}:00+00:00`,
    notes: "", url: null, level: "task", ...over,
  };
}

const T1 = "2026-10-15T12:00:00+00:00";

/**
 * The worked example after "Which channel?" was settled by tapping "Creator
 * partnerships" (its sibling dropped with its subtree at the same instant) and
 * "Contact 10 creators" was ticked; plus a rule, a step sent to Home and a
 * dropped root.
 */
function rybiaPaka(): Row[] {
  return [
    row("r", { title: "Reach 1,000 active users", sort_order: 1 }),
    row("q1", { parent_id: "r", title: "Which channel do we push next month?", ask: true, guess: "creators", done: true, outcome: "Creator partnerships", verdict: "right", closed_at: T1 }),
    row("o1", { parent_id: "q1", title: "Creator partnerships", sort_order: 1 }),
    row("q2", { parent_id: "o1", title: "Will creators accept CPA?", ask: true, guess: "yes if payout > X", sort_order: 1 }),
    row("t1", { parent_id: "q2", title: "Contact 10 creators", done: true, closed_at: T1 }),
    row("q3", { parent_id: "o1", title: "Which creator size converts best?", ask: true, sort_order: 2 }),
    row("p1", { parent_id: "o1", title: "Run micro-creator campaign", sort_order: 3 }),
    row("o2", { parent_id: "q1", title: "Referral system", sort_order: 2, done: true, dropped: true, closed_at: T1 }),
    row("q4", { parent_id: "o2", title: "Does the current reward motivate?", ask: true, guess: "no", done: true, dropped: true, closed_at: T1 }),
    row("t2", { parent_id: "q4", title: "Test alternative reward", done: true, dropped: true, closed_at: T1 }),
    row("rule", { title: "ZAKAZ LOSOWANIA", ask: true, done: true, outcome: "ZAKAZ LOSOWANIA", closed_at: T1, sort_order: 2 }),
    row("home", { title: "Buy a domain", done: true, outcome: "→ Home: Mind", closed_at: T1, sort_order: 3 }),
    row("tiktok", { title: "TikTok ads", done: true, dropped: true, outcome: "too expensive", closed_at: T1, sort_order: 4 }),
  ];
}

const boards = [
  { id: "b2", name: "Inbox", emoji: "📥" },
  { id: "b1", name: "RybiaPaka", emoji: "🐟" },
];

describe("gatherPlanning: the plan as the assistant reads it", () => {
  it("prints the open board first as a tree with the List's markers, then the two lines", () => {
    const rows = [...rybiaPaka(), row("inbox-q", { board_id: "b2", title: "Kto fizycznie wysyła nagrody?", ask: true, guess: "sponsor" })];
    const text = planningContext(rows.map(toPlanNode), boards, "b1");
    expect(text.split("\n")).toEqual([
      "Planning: 3 open step(s), 3 open question(s), 2 settled, 2 done, 4 dropped.",
      "Markers: [ ] open step, [x] done step, [?] open question (~ the guess the user wrote), [=] settled question (= the answer), [-] dropped.",
      "📁 🐟 RybiaPaka (open in Planning; new nodes land here)",
      "  [ ] Reach 1,000 active users",
      "    [=] Which channel do we push next month? = Creator partnerships (their guess: creators, it held)",
      "      [ ] Creator partnerships",
      "        [?] Will creators accept CPA? ~ yes if payout > X",
      "          [x] Contact 10 creators",
      "        [?] Which creator size converts best?",
      "        [ ] Run micro-creator campaign",
      "      [-] Referral system",
      "        [-] Does the current reward motivate?",
      "          [-] Test alternative reward",
      "  [=] ZAKAZ LOSOWANIA",
      "  [x] Buy a domain (→ Home: Mind)",
      "  [-] TikTok ads (why dropped: too expensive)",
      "📁 📥 Inbox",
      "  [?] Kto fizycznie wysyła nagrody? ~ sponsor",
      `${PLAN_OPEN_QUESTIONS_HEADER}: Will creators accept CPA? (their guess: yes if payout > X); Which creator size converts best?; Kto fizycznie wysyła nagrody? (their guess: sponsor)`,
      `${PLAN_SETTLED_HEADER}: Which channel do we push next month? → Creator partnerships (dropped: Referral system); ZAKAZ LOSOWANIA`,
    ]);
  });

  it("uses the contract's two headers", () => {
    expect(PLAN_OPEN_QUESTIONS_HEADER).toBe("Open questions (do not invent answers; you may suggest how to find out)");
    expect(PLAN_SETTLED_HEADER).toBe("Settled (treat as decided; do not reopen or re-propose what was dropped)");
  });

  it("puts the remembered board first whatever the board order, and other boards after it", () => {
    const rows = [row("a", { board_id: "b1", title: "On fish" }), row("b", { board_id: "b2", title: "In the inbox" })];
    const fishFirst = planningContext(rows.map(toPlanNode), boards, "b1");
    expect(fishFirst.indexOf("🐟 RybiaPaka (open in Planning")).toBeLessThan(fishFirst.indexOf("📥 Inbox"));
    const inboxFirst = planningContext(rows.map(toPlanNode), boards, "b2");
    expect(inboxFirst.indexOf("📥 Inbox (open in Planning")).toBeLessThan(inboxFirst.indexOf("🐟 RybiaPaka"));
    // Nothing remembered: no board claims to be open.
    expect(planningContext(rows.map(toPlanNode), boards, null)).not.toContain("open in Planning");
  });

  it("keeps rows without a known board, and a child whose parent is gone becomes a root", () => {
    const rows = [row("lost", { board_id: null, title: "Legacy row" }), row("orphan", { parent_id: "gone", title: "Orphan" })];
    const text = planningContext(rows.map(toPlanNode), boards, "b1");
    expect(text).toContain("📁 🐟 RybiaPaka (open in Planning; new nodes land here)\n  [ ] Orphan");
    expect(text).toContain("📁 (no board)\n  [ ] Legacy row");
  });

  it("caps the tree and says how much is not shown", () => {
    const rows = [row("root", { title: "Root" })];
    for (let i = 0; i < 300; i++) rows.push(row(`s${i}`, { parent_id: "root", title: `Step number ${i} with a longer title`, sort_order: i + 1 }));
    const text = planningContext(rows.map(toPlanNode), boards, "b1");
    const tree = text.split("\n").filter((l) => l.startsWith("  "));
    expect(tree.join("\n").length).toBeLessThanOrEqual(PLAN_TREE_MAX_CHARS + 200);
    expect(text).toMatch(/ {2}\.\.\. and \d+ more node\(s\) not shown/);
    const shown = tree.filter((l) => l.includes("[ ]")).length;
    expect(text).toContain(`... and ${301 - shown} more node(s) not shown`);
  });

  it("caps each line with '+N more' and lists questions the tree had no room for", () => {
    const rows: Row[] = [];
    for (let i = 0; i < 200; i++) rows.push(row(`q${i}`, { title: `Pytanie numer ${i}, czy to ma sens?`, ask: true, sort_order: i + 1 }));
    const text = planningContext(rows.map(toPlanNode), boards, "b1");
    const line = text.split("\n").find((l) => l.startsWith(PLAN_OPEN_QUESTIONS_HEADER))!;
    expect(line).toMatch(/; \+\d+ more$/);
    expect(line.length).toBeLessThanOrEqual(PLAN_OPEN_QUESTIONS_HEADER.length + 2 + PLAN_LINE_MAX_CHARS + 20);
    expect(capItems(["a", "b", "c"], 4)).toBe("a; b; +1 more");
    expect(capItems(["way too long for the cap"], 3)).toBe("way too long for the cap");
  });

  it("reads rows from before the open-loops migration as open steps, with no question lines", () => {
    const legacy = [{ id: "x", user_id: "u1", board_id: "b1", parent_id: null, title: "Old task", level: "phase", done: false, sort_order: 0, created_at: "2026-01-01" }];
    const node = toPlanNode(legacy[0]);
    expect(node).toMatchObject({ ask: false, dropped: false, guess: null, outcome: null, verdict: null, closed_at: null });
    const text = planningContext(legacy.map(toPlanNode), boards, null);
    expect(text).toContain("  [ ] Old task");
    expect(text).not.toContain(PLAN_OPEN_QUESTIONS_HEADER);
    expect(text).not.toContain(PLAN_SETTLED_HEADER);
    expect(planningContext([], boards, null)).toBe("No planning nodes yet.");
  });

  it("says a settled question has no answer written instead of passing it off as a rule", () => {
    const rows = [
      row("q", { title: "Is it worth it?", ask: true, done: true, closed_at: T1 }),
      row("g", { title: "Price?", ask: true, guess: "60%", done: true, outcome: "50%", verdict: "wrong", closed_at: T1 }),
    ];
    const text = planningContext(rows.map(toPlanNode), boards, "b1");
    expect(text).toContain("[=] Is it worth it?\n");
    expect(text).toContain("[=] Price? = 50% (their guess: 60%, it missed)");
    expect(text).toContain(`${PLAN_SETTLED_HEADER}: Is it worth it? → (no answer written); Price? → 50%`);
  });
});

describe("planner.ts: the same two lines and the plan-guess tally", () => {
  it("writes exactly the client's lines for the same plan", () => {
    const rows = rybiaPaka();
    const client = planningContext(rows.map(toPlanNode), boards, "b1").split("\n")
      .filter((l) => l.startsWith(PLAN_OPEN_QUESTIONS_HEADER) || l.startsWith(PLAN_SETTLED_HEADER));
    expect(client).toHaveLength(2);
    // The server reads newest first; the order it is given must not matter.
    expect(planningLines([...rows].reverse())).toEqual(client);
  });

  it("names the options already dropped under a question that is still open, in both copies", () => {
    const rows = [
      row("q", { title: "Which channel?", ask: true, guess: "creators" }),
      row("c", { parent_id: "q", title: "Creators", sort_order: 1 }),
      row("t", { parent_id: "q", title: "TikTok ads", sort_order: 2, done: true, dropped: true, outcome: "too expensive", closed_at: T1 }),
      row("q2", { title: "Who pays?", ask: true, sort_order: 2 }),
      row("x", { parent_id: "q2", title: "Sponsor", done: true, dropped: true, closed_at: T1 }),
    ];
    const line = `${OPEN_QUESTIONS_HEADER}: Which channel? (their guess: creators; dropped: TikTok ads); Who pays? (dropped: Sponsor)`;
    expect(planningLines(rows)).toEqual([line]);
    const client = planningContext(rows.map(toPlanNode), boards, "b1").split("\n").filter((l) => l.startsWith(PLAN_OPEN_QUESTIONS_HEADER));
    expect(client).toEqual([line]);
  });

  it("keeps rows caught in a parent loop in the lines rather than losing them", () => {
    const rows = [row("a", { parent_id: "b", title: "A?", ask: true }), row("b", { parent_id: "a", title: "B?", ask: true })];
    expect(planningLines(rows)).toEqual([`${OPEN_QUESTIONS_HEADER}: A?; B?`]);
  });

  it("shares the headers and the cap with the client", () => {
    expect(OPEN_QUESTIONS_HEADER).toBe(PLAN_OPEN_QUESTIONS_HEADER);
    expect(SETTLED_HEADER).toBe(PLAN_SETTLED_HEADER);
    expect(SERVER_LINE_MAX_CHARS).toBe(PLAN_LINE_MAX_CHARS);
    const items = Array.from({ length: 80 }, (_, i) => `Item ${i} `.repeat(4));
    expect(serverCapItems(items)).toBe(capItems(items));
  });

  it("puts the most recently active board first and skips what is not a planning row", () => {
    const rows = [
      row("old", { board_id: "b1", title: "Old board question?", ask: true }),
      row("new", { board_id: "b2", title: "New board question?", ask: true }),
      null, "junk", { title: "no id" },
    ];
    expect(planningLines(rows)).toEqual([`${OPEN_QUESTIONS_HEADER}: New board question?; Old board question?`]);
  });

  it("degrades to nothing when the open-loops columns are missing or the read failed", () => {
    expect(planningLines(null)).toEqual([]);
    expect(planningLines([{ id: "x", title: "Old task", done: false }])).toEqual([]);
    expect(planGuessLines(null)).toEqual([]);
    expect(planGuessLines([{ id: "x", title: "Old task", done: true }])).toEqual([]);
  });

  it("counts plan guesses on their own and lists the misses", () => {
    const rows = [
      row("q1", { title: "Which channel?", ask: true, guess: "creators", done: true, outcome: "Creator partnerships", verdict: "right", closed_at: "2026-10-15T12:00:00+00:00" }),
      row("q2", { title: "Will creators accept CPA?", ask: true, guess: "yes if payout > X", done: true, outcome: "tylko ze stałą opłatą", verdict: "wrong", closed_at: "2026-10-16T12:00:00+00:00" }),
      row("q3", { title: "Size?", ask: true, guess: "micro", done: true, outcome: "unclear yet", verdict: "unknown", closed_at: "2026-10-14T12:00:00+00:00" }),
      // Not graded (no verdict), and a step: neither is counted.
      row("q4", { title: "Price?", ask: true, guess: "60%", done: true, outcome: "50%" }),
      row("s", { title: "Step", done: true }),
    ];
    expect(planGuessLines(rows)).toEqual([
      "Plan guesses: 1 of 3 right (the user's own grading of guesses written on plan questions, counted apart from the path diagnoses; 1 of them could not be told).",
      'Plan guesses that missed: thought "yes if payout > X", was "tylko ze stałą opłatą".',
    ]);
  });

  it("is wired into buildPlannerContext in place of the open-node count", () => {
    const src = planner();
    expect(src).toContain('from "./planning-lines.ts"');
    expect(src).toMatch(/lines\.push\(\.\.\.planningLines\(planRows\)\)/);
    expect(src).toMatch(/lines\.push\(\.\.\.planGuessLines\(planRows\)\)/);
    // The tally sits next to the path diagnoses, as its own count.
    expect(src.indexOf("planGuessLines(planRows)")).toBeGreaterThan(src.indexOf("Past diagnoses:"));
    for (const col of ["ask", "guess", "outcome", "verdict", "dropped", "closed_at"]) expect(src).toMatch(new RegExp(`select\\("[^"]*\\b${col}\\b`));
    expect(src).not.toContain("open node(s)");
    expect(src).not.toContain("deadline");
    // No "next steps" line: it would collide with "never re-skin a task the user already has".
    expect(src).not.toMatch(/[`"']Next steps:/);
    // Through safe(), so a missing column costs these lines and nothing else.
    expect(src).toMatch(/safe\(client\.from\("planning_tasks"\)/);
  });

  it("keeps the server copy importable by both Deno and these tests", () => {
    expect(serverLinesSource()).not.toMatch(/^\s*import\s/m);
  });
});
