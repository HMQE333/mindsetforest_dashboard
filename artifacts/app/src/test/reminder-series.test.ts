import { describe, expect, it } from "vitest";
import { describeRepeat, splitReminders } from "@/lib/reminders";
import { parseRepeat } from "@/lib/assistant-actions";

describe("describeRepeat", () => {
  it("reads like a person says it", () => {
    expect(describeRepeat({ freq: "weekly", days: [5], time: "18:00" })).toBe("every Fri 18:00");
    expect(describeRepeat({ freq: "weekly", days: [4, 1], time: "09:30" })).toBe("every Mon, Thu 09:30");
    expect(describeRepeat({ freq: "weekly", days: [1, 2, 3, 4, 5], time: "07:00" })).toBe("weekdays 07:00");
    expect(describeRepeat({ freq: "daily", time: "08:00" })).toBe("every day 08:00");
    expect(describeRepeat({ freq: "monthly", monthDay: 1, time: "09:00" })).toBe("every month on the 1st 09:00");
  });
});

describe("splitReminders with series", () => {
  it("lists a series once, by its next time", () => {
    const now = new Date("2026-11-12T12:00:00Z");
    const { due, upcoming } = splitReminders([
      { id: "a", message: "Auchan", deliverAt: "2026-11-14T17:00:00Z", createdAt: "", seriesId: "s" },
      { id: "b", message: "Auchan", deliverAt: "2026-11-21T17:00:00Z", createdAt: "", seriesId: "s" },
      { id: "c", message: "Once", deliverAt: "2026-11-13T09:00:00Z", createdAt: "" },
      { id: "d", message: "Auchan", deliverAt: "2026-11-07T17:00:00Z", createdAt: "", seriesId: "s" },
    ], now);
    expect(due.map((r) => r.id)).toEqual(["d"]);
    expect(upcoming.map((r) => r.id)).toEqual(["c", "a"]);
  });
});

describe("assistant repeat", () => {
  it("parses a weekly repeat and drops a bad one", () => {
    expect(parseRepeat({ freq: "weekly", days: [5, 5, 9], time: "18:00" })).toEqual({ freq: "weekly", days: [5], time: "18:00" });
    expect(parseRepeat({ freq: "weekly", days: [] })).toBeUndefined();
    expect(parseRepeat({ freq: "monthly", monthDay: 1, time: "9:00" })).toEqual({ freq: "monthly", monthDay: 1, time: "09:00" });
  });
});
