import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlanningTask } from "../hooks/usePlanningState";
import PlanningMarker from "../components/planning/PlanningMarker";

const h = vi.hoisted(() => ({ tasks: [] as unknown[], loading: false }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/usePlanningState", () => ({
  usePlanningState: () => ({
    tasks: h.tasks,
    loading: h.loading,
    peek: () => h.tasks,
    addNode: vi.fn(), insertTree: vi.fn(), updateNode: vi.fn(), setNodeState: vi.fn(), settleWithChild: vi.fn(),
    moveNode: vi.fn(), deleteNodes: vi.fn(), refetch: vi.fn(),
  }),
}));

import PlanningStack from "../components/planning/PlanningStack";

const T0 = "2026-10-15T10:00:00.000Z";
let seq = 0;
function task(id: string, parent_id: string | null, title: string, extra: Partial<PlanningTask> = {}): PlanningTask {
  seq += 1;
  return {
    id, board_id: "b1", parent_id, title,
    ask: false, done: false, dropped: false, guess: null, outcome: null, verdict: null, closed_at: null,
    sort_order: seq, created_at: T0,
    user_id: "u1", url: null, notes: "", position_x: null, position_y: null, mentions: [],
    ...extra,
  };
}

/** The visible text of the markup, tags stripped and entities decoded. */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("PlanningStack", () => {
  beforeEach(() => {
    h.tasks = [];
    h.loading = false;
  });

  it("invites the first line on an empty board, with the root placeholder", () => {
    const html = renderToStaticMarkup(<PlanningStack boardId="b1" />);
    expect(text(html)).toContain("Start with what you are aiming at.");
    expect(html).toContain('placeholder="What are you aiming at?"');
    // A plain list: no role="tree" whose items could not be navigated as ARIA requires.
    expect(html).not.toContain('role="tree"');
  });

  it("keeps the add box on an empty board even with [Open loops] on", () => {
    const html = renderToStaticMarkup(<PlanningStack boardId="b1" openLoopsOnly />);
    expect(text(html)).toContain("Start with what you are aiming at.");
    expect(html).toContain('placeholder="What are you aiming at?"');
  });

  it("draws the outline: markers, tails, counts, the next tag, waiting rows and the closed toggle", () => {
    h.tasks = [
      task("root", null, "Reach 1,000 active users"),
      task("q", "root", "Which channel do we push next month?", { ask: true, guess: "creators" }),
      task("o1", "q", "Creator partnerships"),
      task("o1s", "o1", "Run micro-creator campaign"),
      task("o2", "q", "Referral system"),
      task("s", "root", "Write the spec"),
      task("d", "root", "Old idea", { done: true, closed_at: T0 }),
      task("rule", null, "ZAKAZ LOSOWANIA", { ask: true, done: true, outcome: "ZAKAZ LOSOWANIA", closed_at: T0 }),
    ];
    const html = renderToStaticMarkup(<PlanningStack boardId="b1" />);
    const t = text(html);

    // Rows in outline order, with the guess as a muted tail.
    expect(t.indexOf("Reach 1,000 active users")).toBeLessThan(t.indexOf("Which channel do we push next month? ~ creators"));
    expect(t.indexOf("Creator partnerships")).toBeLessThan(t.indexOf("Run micro-creator campaign"));
    // Closed/total direct children on parents; the closed rows fold under a toggle per parent.
    expect(t).toContain("1/3");
    expect(t).toContain("0/2");
    expect(t).not.toContain("Old idea");
    expect(t).toContain("Show 1 closed");
    expect(t).not.toContain("ZAKAZ LOSOWANIA");
    // One "next" per root: the first frontier step in outline order. "Referral system" is a leaf option
    // right under the open question (its own parent), so it counts; the campaign waits on that question.
    expect(html.match(/>next</g)).toHaveLength(1);
    expect(html.indexOf(">next<")).toBeGreaterThan(html.indexOf("Referral system"));
    expect(html.indexOf(">next<")).toBeLessThan(html.indexOf("Write the spec"));
    expect(html).toContain("Waiting: an open question above decides whether this is needed");
    // Markers say what each row waits for.
    expect(html).toContain('title="Tick it"');
    expect(html).toContain('title="Answer it"');
    // Indent by depth, never by level.
    expect(html).toContain("padding-left:74px");
    // The keyboard hint and a menu per row.
    expect(t).toContain("Ctrl+/ step ↔ question");
    expect((html.match(/aria-label="Row menu"/g) ?? []).length).toBe(6);
  });

  it("keeps a settled question's dropped options in view as 'not chosen', with the answer and the grade", () => {
    h.tasks = [
      task("q", null, "Which channel?", { ask: true, guess: "creators", done: true, outcome: "Creators", verdict: "right", closed_at: T0 }),
      task("a", "q", "Creators"),
      task("b", "q", "Ads", { done: true, dropped: true, closed_at: T0 }),
    ];
    const t = text(renderToStaticMarkup(<PlanningStack boardId="b1" />));
    expect(t).toContain("Which channel? ~ creators = Creators");
    expect(t).toContain("held");
    expect(t).toContain("Ads");
    expect(t).toContain("not chosen");
    expect(t).not.toContain("Show");
  });

  it("with [Open loops], shows only what can be worked on now and hides the add box", () => {
    h.tasks = [
      task("root", null, "Reach 1,000 active users"),
      task("s", "root", "Write the spec"),
      task("d", "root", "Old idea", { done: true, closed_at: T0 }),
      task("other", null, "Finished root", { done: true, closed_at: T0 }),
    ];
    const html = renderToStaticMarkup(<PlanningStack boardId="b1" openLoopsOnly />);
    const t = text(html);
    expect(t).toContain("Write the spec");
    expect(t).not.toContain("Old idea");
    expect(t).not.toContain("Finished root");
    expect(t).not.toContain("closed");
    expect(html).not.toContain('placeholder="What are you aiming at?"');
  });
});

describe("PlanningMarker", () => {
  it("draws ○ ✓ ? = and fades a dropped row", () => {
    const open = renderToStaticMarkup(<PlanningMarker look={{ ask: false, state: "open" }} />);
    const q = renderToStaticMarkup(<PlanningMarker look={{ ask: true, state: "open" }} onClick={() => {}} title="Answer it" />);
    const settled = renderToStaticMarkup(<PlanningMarker look={{ ask: true, state: "settled" }} />);
    const dropped = renderToStaticMarkup(<PlanningMarker look={{ ask: false, state: "dropped" }} />);
    const note = renderToStaticMarkup(<PlanningMarker look={{ note: true }} />);
    expect(open).toContain("border-primary/60");
    expect(q).toContain("<button");
    expect(text(q)).toBe("?");
    expect(text(settled)).toBe("=");
    expect(dropped).toContain("opacity-40");
    expect(dropped).toContain("border-dashed");
    expect(text(note)).toBe("›");
  });
});
