import { describe, expect, it } from "vitest";
import { minutesToMetricValue, parseAmount, parseMinutes, plannedMinutesOf, timeUnitOf } from "@/lib/mission-amount";
import { suggestedMinutes } from "@/lib/mission-timer";

describe("parseMinutes", () => {
  it("reads common duration texts", () => {
    expect(parseMinutes("15 min")).toBe(15);
    expect(parseMinutes("Nauka 1h")).toBe(60);
    expect(parseMinutes("1h 30m")).toBe(90);
    expect(parseMinutes("1,5 h")).toBe(90);
    expect(parseMinutes("2 godz")).toBe(120);
    expect(parseMinutes("90 minut")).toBe(90);
    expect(parseMinutes("Read 40 pages")).toBeNull();
    expect(parseMinutes("")).toBeNull();
  });
  it("planned minutes: set by hand first, then duration, then title", () => {
    expect(plannedMinutesOf({ plannedMinutes: 25, duration: "1h" })).toBe(25);
    expect(plannedMinutesOf({ duration: "20 min", title: "x 1h" })).toBe(20);
    expect(plannedMinutesOf({ duration: "", title: "Nauka 1h" })).toBe(60);
  });
});

describe("parseAmount", () => {
  it("takes the first number that is not a time", () => {
    expect(parseAmount("Read 40 pages")).toBe(40);
    expect(parseAmount("50 pompek")).toBe(50);
    expect(parseAmount("Nauka 1h")).toBeNull();
    expect(parseAmount("20 min walk, 3000 steps")).toBe(3000);
    expect(parseAmount("Meditate")).toBeNull();
  });
});

describe("time metrics", () => {
  it("knows minutes and hours units", () => {
    expect(timeUnitOf("min")).toBe("minutes");
    expect(timeUnitOf("hours")).toBe("hours");
    expect(timeUnitOf("godz")).toBe("hours");
    expect(timeUnitOf("pages")).toBeNull();
    expect(minutesToMetricValue(90, "h")).toBe(1.5);
    expect(minutesToMetricValue(52, "min")).toBe(52);
  });
});

describe("suggestedMinutes", () => {
  it("is the clock when nothing points elsewhere", () => expect(suggestedMinutes(42.4, 1, 30)).toEqual({ value: 42, reason: "measured" }));
  it("takes off real background time", () => expect(suggestedMinutes(52, 14, 60)).toEqual({ value: 38, reason: "hidden" }));
  it("does not trust a timer left running far past the plan", () => expect(suggestedMinutes(600, 0, 30)).toEqual({ value: 30, reason: "plan" }));
});

import { discardTimer, elapsedMs, finishTimer, pauseTimer, startTimer, useMissionTimers } from "@/lib/mission-timer";
void useMissionTimers;

describe("mission timers remember pieces", () => {
  it("adds pieces across pauses and finishes with the total", () => {
    startTimer("mind", 0, "Read", "2026-11-11", 0);
    pauseTimer("mind", 0, 10 * 60_000);
    startTimer("mind", 0, "Read", "2026-11-11", 30 * 60_000);
    const r = finishTimer("mind", 0, 45 * 60_000);
    expect(r?.elapsedMin).toBe(25);
    expect(finishTimer("mind", 0)).toBeNull();
  });
  it("starting another pauses the running one and keeps its time", () => {
    startTimer("a", 0, "A", "d", 0);
    startTimer("b", 1, "B", "d", 5 * 60_000);
    const a = finishTimer("a", 0, 60 * 60_000);
    expect(a?.elapsedMin).toBe(5);
    const b = finishTimer("b", 1, 15 * 60_000);
    expect(b?.elapsedMin).toBe(10);
  });
  it("a different mission at the same place starts fresh", () => {
    startTimer("c", 2, "Old", "d", 0);
    pauseTimer("c", 2, 60_000);
    startTimer("c", 2, "New", "d", 120_000);
    expect(finishTimer("c", 2, 180_000)?.elapsedMin).toBe(1);
    discardTimer("c", 2);
    expect(elapsedMs({ categoryId: "x", index: 0, title: "", accumulatedMs: 1000, runningSince: 0, hiddenMs: 0, hiddenSince: null, firstDay: "" }, 500)).toBe(1500);
  });
});
