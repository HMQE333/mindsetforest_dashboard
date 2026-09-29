import { describe, it, expect } from "vitest";
import { emptySnapshot, monthRange, monthlyDue, periodLabel, previousMonth, reviewDay, reviewStreak, reviewTiles } from "../lib/review-data";

describe("review periods", () => {
  it("works out yesterday, the previous month and its range", () => {
    expect(reviewDay("2026-10-01")).toBe("2026-09-30");
    expect(previousMonth("2026-10-01")).toBe("2026-09");
    expect(previousMonth("2027-01-05")).toBe("2026-12");
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28", days: 28 });
    expect(monthRange("2028-02").days).toBe(29);
    expect(monthlyDue("2026-10-03")).toBe(true);
    expect(monthlyDue("2026-10-11")).toBe(false);
  });

  it("counts the review streak back from yesterday, tolerating today not done yet", () => {
    expect(reviewStreak(["2026-09-28", "2026-09-27", "2026-09-25"], "2026-09-28")).toBe(2);
    expect(reviewStreak(["2026-09-27", "2026-09-26"], "2026-09-28")).toBe(2);
    expect(reviewStreak([], "2026-09-28")).toBe(0);
  });

  it("labels periods in Polish", () => {
    expect(periodLabel("daily", "2026-09-28")).toMatch(/28 września/);
    expect(periodLabel("monthly", "2026-09")).toMatch(/wrzesień 2026/);
  });
});

describe("review tiles", () => {
  it("shows only tiles with data, at most six, XP first", () => {
    const s = emptySnapshot("daily", "2026-09-28");
    expect(reviewTiles(s).map((t) => t.key)).toEqual(["xp"]);
    expect(reviewTiles(s)[0].tone).toBe("warn");

    s.xp = 120; s.missions = 7;
    s.computer = {
      total: 6 * 3600,
      byKind: { work: 3 * 3600, learning: 3600, communication: 600, watching: 1800, waste: 1200, neutral: 0 },
      unassigned: 0,
      focusRatio: 0.66,
      topApps: [{ name: "Browser | YouTube", seconds: 1800, kind: "watching" }],
    };
    s.sleep = { avgMinutes: 430, avgScore: 81, avgHrv: 52, avgRestingHr: 50, steps: 8000, nights: 1 };
    s.paths = [{ path: "Push-ups", step: "5 sets", count: 1 }];
    s.spend = { total: 124, count: 3, top: [{ label: "Zakupy", amount: 80 }] };
    s.metrics = [{ label: "Reading", unit: "pages", value: 30 }];
    const tiles = reviewTiles(s);
    expect(tiles.map((t) => t.key)).toEqual(["xp", "focus", "lost", "sleep", "paths", "spend"]);
    expect(tiles[0].value).toBe("+120");
    expect(tiles[1].detail).toBe("66% fokusu");
    expect(tiles[1].value).toBe("4h 00m");
    expect(tiles[2].detail).toContain("YouTube");
    expect(tiles[3].value).toBe("7h 10m");
    expect(tiles[5].value).toMatch(/124/);
  });
});
