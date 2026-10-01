import { describe, it, expect } from "vitest";
import { QUICK_PICKS, splitReminders, timeUntil, toLocalInput } from "../lib/reminders";

const now = new Date(2026, 9, 2, 14, 30); // 2 Oct 2026, 14:30 local
const pick = (id: string) => QUICK_PICKS.find((p) => p.id === id)!.at(now);

describe("reminder times", () => {
  it("quick picks land where they say, years ahead included", () => {
    expect(toLocalInput(pick("1h"))).toBe("2026-10-02T15:30");
    expect(toLocalInput(pick("evening"))).toBe("2026-10-02T20:00");
    expect(toLocalInput(pick("tomorrow"))).toBe("2026-10-03T09:00");
    expect(toLocalInput(pick("week"))).toBe("2026-10-09T09:00");
    expect(toLocalInput(pick("month"))).toBe("2026-11-02T09:00");
    expect(toLocalInput(pick("5y"))).toBe("2031-10-02T09:00");
    const late = new Date(2026, 9, 2, 21, 0);
    expect(toLocalInput(QUICK_PICKS.find((p) => p.id === "evening")!.at(late))).toBe("2026-10-03T20:00");
  });

  it("says how far away it is", () => {
    expect(timeUntil(new Date(now.getTime() + 20 * 60_000), now)).toBe("in 20 min");
    expect(timeUntil(pick("tomorrow"), now)).toBe("in 19 hours");
    expect(timeUntil(pick("month"), now)).toBe("in 31 days");
    expect(timeUntil(pick("year"), now)).toBe("in 12 months");
    expect(timeUntil(pick("5y"), now)).toBe("in 5 years");
    expect(timeUntil(new Date(now.getTime() - 1000), now)).toBe("now");
  });

  it("splits arrived from waiting, newest arrival first", () => {
    const r = (id: string, at: Date) => ({ id, message: id, deliverAt: at.toISOString(), createdAt: now.toISOString() });
    const { due, upcoming } = splitReminders([
      r("later", pick("5y")), r("old", new Date(2026, 0, 1)), r("recent", new Date(2026, 9, 1)), r("soon", pick("1h")),
    ], now);
    expect(due.map((x) => x.id)).toEqual(["recent", "old"]);
    expect(upcoming.map((x) => x.id)).toEqual(["soon", "later"]);
  });
});
