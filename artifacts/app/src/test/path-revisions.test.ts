import { describe, it, expect } from "vitest";
import { matchPlanToCurrent } from "../lib/path-plan";
import { describeRevision, type PathSnapshot } from "../lib/path-data";

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
