import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../lib/dashboard-data";
import { findMission, formatMissionList, listTodayMissions } from "../lib/mission-match";

const m = (title: string, extra: Record<string, unknown> = {}) => ({ title, description: "", duration: "", xp: 10, ...extra });

describe("mission matching", () => {
  it("lists today's missions with defaults for untouched pillars and project folders", () => {
    const entries = listTodayMissions(
      { mind: [m("Read 20 pages"), m("Weekend only", { daysOfWeek: [0, 6] })], "project-abc": [m("Ship v1", { xp: 30 })] },
      ["mind-0"],
      { "project-abc": "Launch" },
      2, // Tuesday
    );
    const mind = entries.filter((e) => e.categoryId === "mind");
    expect(mind.map((e) => e.title)).toEqual(["Read 20 pages"]);
    expect(mind[0].done).toBe(true);
    const body = entries.filter((e) => e.categoryId === "body");
    expect(body.length).toBe(CATEGORIES.find((c) => c.id === "body")!.missions.length);
    const project = entries.find((e) => e.categoryId === "project-abc")!;
    expect(project.categoryName).toBe("Launch");
    expect(project.xp).toBe(30);
    expect(project.index).toBe(0);
  });

  it("finds by exact title, then containment, then shared words, preferring undone", () => {
    const entries = listTodayMissions(
      { mind: [m("Read 20 pages"), m("Meditate 10 min")], body: [m("50 pushups"), m("Evening walk")] },
      ["body-0"],
    );
    expect(findMission(entries, "read 20 pages")?.title).toBe("Read 20 pages");
    expect(findMission(entries, "pompki pushups")?.title).toBe("50 pushups");
    expect(findMission(entries, "walk")?.title).toBe("Evening walk");
    expect(findMission(entries, "the evening walk was nice")?.title).toBe("Evening walk");
    expect(findMission(entries, "meditate", "mind")?.title).toBe("Meditate 10 min");
    expect(findMission(entries, "swim laps")).toBeNull();
    expect(findMission(entries, "")).toBeNull();
  });

  it("ignores accents and punctuation when matching", () => {
    const entries = listTodayMissions({ spirit: [m("Wdzięczność: 3 rzeczy")] }, []);
    expect(findMission(entries, "wdziecznosc 3 rzeczy")?.title).toBe("Wdzięczność: 3 rzeczy");
  });

  it("formats one line per pillar with done markers", () => {
    const entries = listTodayMissions({ mind: [m("Read"), m("Write")] }, ["mind-1"]);
    const text = formatMissionList(entries.filter((e) => e.categoryId === "mind"));
    expect(text).toBe("- Mind (mind): [ ] Read (+10 XP); [x] Write (+10 XP)");
  });
});

describe("mission matching edge cases", () => {
  it("returns null when two missions tie on a single shared word", () => {
    const entries = listTodayMissions({ mind: [m("Morning pages"), m("Morning walk")] }, []);
    expect(findMission(entries, "morning thing")).toBeNull();
    expect(findMission(entries, "morning pages")?.title).toBe("Morning pages");
  });
});
