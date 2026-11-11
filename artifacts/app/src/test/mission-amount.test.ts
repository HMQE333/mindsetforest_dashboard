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
