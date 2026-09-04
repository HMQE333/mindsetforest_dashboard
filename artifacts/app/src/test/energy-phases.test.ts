import { describe, it, expect } from "vitest";
import { ENERGY_PHASES, PHASE_MAP, nextPhase, suggestedPhase } from "@/lib/energy-phases";

describe("energy phases", () => {
  it("cycles gather → strike → reflect → gather", () => {
    expect(ENERGY_PHASES.map((p) => p.id)).toEqual(["gather", "strike", "reflect"]);
    expect(nextPhase("gather")).toBe("strike");
    expect(nextPhase("strike")).toBe("reflect");
    expect(nextPhase("reflect")).toBe("gather");
  });

  it("suggests a phase that fits the hour", () => {
    const at = (h: number) => suggestedPhase(new Date(2026, 0, 5, h, 0, 0));
    expect(at(7)).toBe("gather");
    expect(at(13)).toBe("strike");
    expect(at(22)).toBe("reflect");
  });

  it("has a tagline and hint for every phase", () => {
    for (const p of ENERGY_PHASES) {
      expect(PHASE_MAP[p.id]).toBe(p);
      expect(p.tagline.length).toBeGreaterThan(10);
      expect(p.hint.length).toBeGreaterThan(10);
    }
  });
});
