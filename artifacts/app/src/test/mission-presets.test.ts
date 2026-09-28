import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../lib/dashboard-data";
import {
  cleanMission,
  snapshotMissions,
  missionsForApply,
  parseMissionMap,
  countMissions,
  normalizePresetName,
} from "../lib/mission-presets";

const m = (title: string, extra: Record<string, unknown> = {}) => ({ title, description: "", duration: "", xp: 10, ...extra });

describe("mission presets", () => {
  it("snapshot fills untouched pillars with the defaults and keeps project folders", () => {
    const snap = snapshotMissions({ mind: [m("Read")], "project-abc": [m("Ship v1")] });
    expect(snap.mind.map((x) => x.title)).toEqual(["Read"]);
    for (const c of CATEGORIES) {
      if (c.id === "mind") continue;
      expect(snap[c.id].length).toBe(c.missions.length);
    }
    expect(snap["project-abc"][0].title).toBe("Ship v1");
  });

  it("snapshot strips the runtime index and normalises xp", () => {
    const snap = snapshotMissions({ body: [m("Pushups", { __originalIndex: 3, xp: "15" })] });
    expect("__originalIndex" in snap.body[0]).toBe(false);
    expect(snap.body[0].xp).toBe(15);
  });

  it("missionsForApply makes every mission persistent and drops empty lists", () => {
    const applied = missionsForApply({ mind: [m("Read", { persistent: false })], body: [] });
    expect(applied.mind[0].persistent).toBe(true);
    expect("body" in applied).toBe(false);
  });

  it("parseMissionMap ignores garbage and keeps valid lists", () => {
    const parsed = parseMissionMap({ mind: [m("A"), { nope: 1 }, null], body: "not a list", spirit: [] });
    expect(parsed.mind.length).toBe(1);
    expect("body" in parsed).toBe(false);
    expect("spirit" in parsed).toBe(false);
    expect(parseMissionMap(null)).toEqual({});
    expect(parseMissionMap([1, 2])).toEqual({});
  });

  it("cleanMission keeps optional fields only when meaningful", () => {
    const c = cleanMission(m("X", { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], variants: [], url: "" }));
    expect(c.daysOfWeek).toBeUndefined();
    expect(c.variants).toBeUndefined();
    expect(c.url).toBeUndefined();
    const d = cleanMission(m("Y", { daysOfWeek: [1, 3], url: "https://x" }));
    expect(d.daysOfWeek).toEqual([1, 3]);
    expect(d.url).toBe("https://x");
  });

  it("counts and normalises names", () => {
    expect(countMissions({ a: [m("1"), m("2")], b: [m("3")] })).toBe(3);
    expect(normalizePresetName("  Monk   mode  ")).toBe("Monk mode");
    expect(normalizePresetName("x".repeat(80)).length).toBe(40);
  });
});
