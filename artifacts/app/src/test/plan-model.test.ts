import { describe, it, expect } from "vitest";
import {
  Plan, applyOps, normalizePlan, normalizeOps, planStepCount, planTotalMinutes, parseRepeatCount, planToOutline, findBlock,
} from "@/lib/plan-model";

function samplePlan(): Plan {
  return normalizePlan({
    title: "Ship the thing",
    goal: "Get v1 out",
    assumptions: ["solo", ""],
    decisions: [{ question: "Stack?", choice: "Postgres" }, { question: "" }],
    risks: ["scope creep"],
    phases: [
      {
        id: "p1",
        title: "Setup",
        blocks: [
          { id: "s1", kind: "step", title: "Buy domain", estimateMinutes: 20, energy: "low" },
          { id: "s2", kind: "step", title: "Init repo", estimateMinutes: 40, energy: "medium" },
        ],
      },
      {
        id: "p2",
        title: "Build",
        blocks: [
          {
            id: "l1", kind: "loop", title: "Weekly build cycle", repeat: "8 times", exit: "feature list empty",
            steps: [
              { id: "s3", kind: "step", title: "Pick a feature", estimateMinutes: 10 },
              { id: "s4", kind: "step", title: "Ship it", estimateMinutes: 90 },
            ],
          },
        ],
      },
    ],
  });
}

describe("normalizePlan", () => {
  it("keeps ids, drops empty entries and coerces missing fields", () => {
    const plan = samplePlan();
    expect(plan.phases).toHaveLength(2);
    expect(plan.assumptions).toEqual(["solo"]);
    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0].id).toBeTruthy();
    expect(plan.phases[1].blocks[0].kind).toBe("loop");
  });

  it("survives garbage input", () => {
    const plan = normalizePlan({ phases: [{ blocks: [{}] }, null], decisions: "nope" }, "Fallback");
    expect(plan.title).toBe("Fallback");
    expect(plan.phases).toEqual([]);
    expect(plan.decisions).toEqual([]);
  });
});

describe("counting", () => {
  it("counts loop bodies once, and once per repetition when expanded", () => {
    const plan = samplePlan();
    expect(parseRepeatCount("8 times")).toBe(8);
    expect(planStepCount(plan)).toEqual({ unique: 4, expanded: 2 + 2 * 8 });
    expect(planTotalMinutes(plan)).toBe(20 + 40 + (10 + 90) * 8);
  });
});

describe("applyOps", () => {
  it("moves a step inside its phase", () => {
    const plan = samplePlan();
    const { plan: next, errors } = applyOps(plan, [{ type: "move_block", id: "s1", toPhaseId: "p1", toIndex: 1 }]);
    expect(errors).toEqual([]);
    expect(next.phases[0].blocks.map((b) => b.id)).toEqual(["s2", "s1"]);
  });

  it("moves a step into a loop and back out", () => {
    const plan = samplePlan();
    const into = applyOps(plan, [{ type: "move_block", id: "s2", toLoopId: "l1", toIndex: 0 }]).plan;
    expect(into.phases[0].blocks.map((b) => b.id)).toEqual(["s1"]);
    const loop = findBlock(into, "l1");
    expect(loop && "steps" in loop && loop.steps.map((s) => s.id)).toEqual(["s2", "s3", "s4"]);

    const back = applyOps(into, [{ type: "move_block", id: "s2", toPhaseId: "p1", toIndex: 0 }]).plan;
    expect(back.phases[0].blocks.map((b) => b.id)).toEqual(["s2", "s1"]);
  });

  it("refuses to nest a loop inside a loop", () => {
    const plan = samplePlan();
    const res = applyOps(plan, [{ type: "move_block", id: "l1", toLoopId: "l1", toIndex: 0 }]);
    expect(res.applied).toEqual([]);
    expect(res.errors[0]).toMatch(/loop/i);
  });

  it("applies the good ops and reports the bad ones", () => {
    const plan = samplePlan();
    const res = applyOps(plan, [
      { type: "update_block", id: "s1", title: "Buy the domain" },
      { type: "delete_block", id: "does-not-exist" },
      { type: "insert_block", phaseId: "p1", index: 0, block: { kind: "step", title: "Write the brief" } as never },
    ]);
    expect(res.applied).toHaveLength(2);
    expect(res.errors).toHaveLength(1);
    expect(res.plan.phases[0].blocks[0].title).toBe("Write the brief");
    expect(findBlock(res.plan, "s1")?.title).toBe("Buy the domain");
  });

  it("never mutates the input plan", () => {
    const plan = samplePlan();
    const before = JSON.stringify(plan);
    applyOps(plan, [{ type: "delete_phase", id: "p1" }, { type: "update_block", id: "s3", title: "x" }]);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("reorders phases", () => {
    const plan = samplePlan();
    const next = applyOps(plan, [{ type: "move_phase", id: "p2", toIndex: 0 }]).plan;
    expect(next.phases.map((p) => p.title)).toEqual(["Build", "Setup"]);
  });
});

describe("normalizeOps", () => {
  it("drops anything that is not a known operation", () => {
    expect(normalizeOps([{ type: "update_block", id: "a" }, { type: "rm -rf" }, null, "x"])).toHaveLength(1);
    expect(normalizeOps("not an array")).toEqual([]);
  });
});

describe("planToOutline", () => {
  it("exposes every id so the model can address individual steps", () => {
    const outline = planToOutline(samplePlan());
    for (const id of ["p1", "p2", "s1", "s2", "l1", "s3", "s4"]) {
      expect(outline).toContain(`[${id}]`);
    }
    expect(outline).toContain("LOOP");
  });
});
