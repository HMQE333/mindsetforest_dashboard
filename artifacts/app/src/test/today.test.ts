import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dayKey, monthKey, addDays, lastNDays, computeStreak } from "../lib/today";

describe("dayKey: the day ends at 04:00", () => {
  it("03:59 still belongs to the previous day", () => {
    expect(dayKey(new Date(2026, 8, 28, 3, 59))).toBe("2026-09-27");
  });
  it("04:00 starts the new day", () => {
    expect(dayKey(new Date(2026, 8, 28, 4, 0))).toBe("2026-09-28");
  });
  it("00:30 on the 1st still belongs to last month", () => {
    expect(dayKey(new Date(2026, 9, 1, 0, 30))).toBe("2026-09-30");
    expect(monthKey(new Date(2026, 9, 1, 0, 30))).toBe("2026-09");
  });
  it("00:30 on 1 January still belongs to last year", () => {
    expect(dayKey(new Date(2027, 0, 1, 0, 30))).toBe("2026-12-31");
  });
});

describe("dayKey across DST changes (Europe/Warsaw)", () => {
  // The boundary is 04:00 on the local clock, also on the 23- and 25-hour days.
  let saved: string | undefined;
  beforeAll(() => { saved = process.env.TZ; process.env.TZ = "Europe/Warsaw"; });
  afterAll(() => { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; });

  it("runs in the zone it claims to", () => {
    expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 15, 12).getTimezoneOffset()).toBe(-120);
  });
  it("spring forward (29 Mar 2026, 02:00 -> 03:00): 04:30 is already the new day", () => {
    expect(dayKey(new Date(2026, 2, 29, 3, 30))).toBe("2026-03-28");
    expect(dayKey(new Date(2026, 2, 29, 4, 0))).toBe("2026-03-29");
    expect(dayKey(new Date(2026, 2, 29, 4, 30))).toBe("2026-03-29");
  });
  it("fall back (25 Oct 2026, 03:00 -> 02:00): the repeated hour and 03:30 are still the old day", () => {
    // 01:30 UTC is 02:30 CET, the second pass through 02:00-03:00.
    expect(dayKey(new Date(Date.UTC(2026, 9, 25, 1, 30)))).toBe("2026-10-24");
    expect(dayKey(new Date(2026, 9, 25, 3, 30))).toBe("2026-10-24");
    expect(dayKey(new Date(2026, 9, 25, 4, 0))).toBe("2026-10-25");
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-09-28", -30)).toBe("2026-08-29");
  });
  it("lastNDays ends on the given day, oldest first", () => {
    expect(lastNDays(3, "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });
});

describe("computeStreak: two freezes per rolling week", () => {
  const T = "2026-09-28";
  // Active days given as offsets back from T.
  const days = (...offsets: number[]) => offsets.map(n => addDays(T, -n));

  it("a missed yesterday consumes a freeze instead of zeroing the streak", () => {
    // active: 2, 3, 4, 5 days ago; yesterday and today empty
    expect(computeStreak(days(2, 3, 4, 5), T)).toBe(4);
  });
  it("two missed days plus an empty today still shows the streak, three break it", () => {
    expect(computeStreak(days(3, 4, 5), T)).toBe(3);
    expect(computeStreak(days(4, 5, 6), T)).toBe(0);
  });

  it("is 0 for a user with no activity", () => {
    expect(computeStreak([], T)).toBe(0);
  });
  it("counts consecutive days with no freezes used", () => {
    expect(computeStreak(days(0, 1, 2, 3, 4, 5, 6), T)).toBe(7);
  });
  it("one missed day in the week is frozen over", () => {
    expect(computeStreak(days(0, 1, 2, 4, 5, 6, 7), T)).toBe(7); // miss at -3
  });
  it("two missed days in the week are frozen over", () => {
    expect(computeStreak(days(0, 1, 3, 5, 6, 7, 8), T)).toBe(7); // misses at -2, -4
  });
  it("a third miss inside a rolling week breaks the streak", () => {
    // misses at -2, -4, -6: the walk stops at -6, having counted 0, 1, 3, 5.
    expect(computeStreak(days(0, 1, 3, 5, 7, 8, 9), T)).toBe(4);
  });
  it("freezes renew as the week rolls", () => {
    // misses at -2 and -4, then -9 (a week after -2): never three inside any 7-day window.
    expect(computeStreak(days(0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 13), T)).toBe(11);
  });
  it("survives when today has no activity yet", () => {
    expect(computeStreak(days(1, 2, 3, 4, 5), T)).toBe(5);
  });
  it("uses freezesPerWeek when given", () => {
    expect(computeStreak(days(0, 1, 3, 4, 5), T, 0)).toBe(2);
  });
});
