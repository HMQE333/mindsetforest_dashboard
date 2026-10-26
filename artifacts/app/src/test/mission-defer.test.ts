import { describe, expect, it } from "vitest";
import { deferred, doneClearsDeferrals, isSnoozed, keptAndDeferred, needsDecision, unsnoozed } from "@/lib/mission-defer";
import type { Mission } from "@/lib/dashboard-data";

const m: Mission = { title: "Read", description: "", duration: "", xp: 10 };

describe("mission-defer", () => {
  it("pushes to the next day and counts", () => {
    const d = deferred(m, "2026-10-26");
    expect(d.snoozedUntil).toBe("2026-10-27");
    expect(d.deferrals).toBe(1);
    expect(isSnoozed(d, "2026-10-26")).toBe(true);
    expect(isSnoozed(d, "2026-10-27")).toBe(false);
  });
  it("asks after three pushes, and keeping restarts the count", () => {
    let x = m;
    for (let i = 0; i < 3; i++) x = deferred(x, "2026-10-26");
    expect(needsDecision(x)).toBe(true);
    const k = keptAndDeferred(x, "2026-10-26");
    expect(needsDecision(k)).toBe(false);
    expect(isSnoozed(k, "2026-10-26")).toBe(true);
  });
  it("undo brings it back but keeps the count; done clears both", () => {
    const d = deferred(m, "2026-10-26");
    const u = unsnoozed(d);
    expect(isSnoozed(u, "2026-10-26")).toBe(false);
    expect(u.deferrals).toBe(1);
    expect(doneClearsDeferrals(d)).toEqual(m);
    expect(doneClearsDeferrals(m)).toBe(m);
  });
});
