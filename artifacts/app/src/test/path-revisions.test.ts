import { describe, it, expect } from "vitest";
import { matchPlanToCurrent, moveStepOrder, nextSortOrder, planStepFields } from "../lib/path-plan";
import { describeRevision, DEFAULT_STEP_XP, type PathSnapshot } from "../lib/path-data";

describe("matchPlanToCurrent", () => {
  const current = [
    { id: "a", title: "Read the docs" },
    { id: "b", title: "Write tests" },
    { id: "c", title: "Ship it" },
  ];

  it("matches by id first, then by title ignoring case and accents, each live step once", () => {
    const plan = [
      { title: "write TESTS" },
      { id: "c", title: "Ship v2" },
      { title: "Read the docs" },
      { title: "Read the docs" },
      { title: "Brand new" },
    ];
    expect(matchPlanToCurrent(plan, current)).toEqual(["b", "c", "a", null, null]);
  });

  it("ignores ids that no longer exist", () => {
    expect(matchPlanToCurrent([{ id: "zzz", title: "Ship it" }], current)).toEqual(["c"]);
  });
});

describe("planStepFields", () => {
  const habit = { mode: "reps" as const, reps_target: 30, xp: 45 };

  it("keeps a matched step's mode, target and XP when the plan leaves them out", () => {
    expect(planStepFields({ title: "Run" }, habit, 2)).toEqual({
      title: "Run", stage: null, mode: "reps", reps_target: 30, xp: 45, sort_order: 2,
    });
  });

  it("lets the plan override what it does state", () => {
    expect(planStepFields({ title: "Run", mode: "once", xp: 10 }, habit, 0))
      .toMatchObject({ mode: "once", reps_target: 1, xp: 10 });
    expect(planStepFields({ title: "Run", mode: "reps", repsTarget: 12 }, habit, 0))
      .toMatchObject({ mode: "reps", reps_target: 12, xp: 45 });
  });

  it("falls back to the defaults for a new step", () => {
    expect(planStepFields({ title: "New" }, null, 0)).toMatchObject({ mode: "once", reps_target: 1, xp: DEFAULT_STEP_XP });
    expect(planStepFields({ title: "New", mode: "reps" }, undefined, 0)).toMatchObject({ mode: "reps", reps_target: 7 });
    // A one-off turned into a habit has no target of its own to keep.
    expect(planStepFields({ title: "Run", mode: "reps" }, { mode: "once", reps_target: 1, xp: 20 }, 0))
      .toMatchObject({ reps_target: 7 });
  });
});

describe("sort order", () => {
  it("appends after the highest sort_order, not at the count", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 2 }])).toBe(3);
  });

  it("moves a step even when its neighbour shares its sort_order", () => {
    const ordered = [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }, { id: "c", sort_order: 1 }];
    // Swapping b and c would write 1 over 1; renumbered, b goes to 2 and c stays ahead of it.
    expect(moveStepOrder(ordered, "c", -1)).toEqual([{ id: "b", sort_order: 2 }]);
    expect(moveStepOrder(ordered, "a", 1)).toEqual([{ id: "b", sort_order: 0 }, { id: "a", sort_order: 1 }, { id: "c", sort_order: 2 }]);
  });

  it("returns null when the step is at the edge or missing", () => {
    const ordered = [{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }];
    expect(moveStepOrder(ordered, "a", -1)).toBeNull();
    expect(moveStepOrder(ordered, "b", 1)).toBeNull();
    expect(moveStepOrder(ordered, "zzz", 1)).toBeNull();
  });
});

describe("describeRevision", () => {
  const step = (id: string, title: string, sort_order: number, extra: Partial<PathSnapshot["steps"][number]> = {}) =>
    ({ id, title, stage: null, mode: "once" as const, reps_target: 1, xp: 10, sort_order, ...extra });
  const base: PathSnapshot = { name: "P", diagnosis: null, steps: [step("a", "One", 0), step("b", "Two", 1)] };

  it("names renames, edits, path rename and unchanged plans", () => {
    expect(describeRevision(base, { ...base, steps: [step("a", "Uno", 0), step("b", "Two", 1)] })).toBe("1 reworded");
    expect(describeRevision(base, { ...base, steps: [step("a", "One", 0, { reps_target: 5, mode: "reps" }), step("b", "Two", 1)] })).toBe("1 edited");
    expect(describeRevision(base, { ...base, name: "Q" })).toBe("path renamed");
    expect(describeRevision(base, base)).toBe("same as now");
    expect(describeRevision(base, { ...base, steps: [step("b", "Two", 0), step("a", "One", 1)] })).toBe("reordered");
    expect(describeRevision(base, { ...base, steps: [...base.steps, step("c", "Three", 2)] })).toBe("+1 step");
  });
});
