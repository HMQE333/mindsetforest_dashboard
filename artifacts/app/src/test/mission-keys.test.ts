import { describe, it, expect } from "vitest";
import { CATEGORIES, type Mission } from "../lib/dashboard-data";
import {
  categoryMissions,
  completedMissionDetails,
  missionSources,
  remapCategoryKeys,
  stripOriginalIndex,
  taggedMissions,
  withVariant,
} from "../lib/mission-keys";

const m = (title: string, extra: Partial<Mission> = {}): Mission => ({ title, description: "", duration: "", xp: 10, ...extra });
const variants = (...titles: string[]) => titles.map((t, i) => ({ title: t, description: "", duration: "", xp: 10 * (i + 2), weight: 1 }));
const noRoll = () => { throw new Error("should not roll"); };

describe("categoryMissions / taggedMissions", () => {
  it("falls back to the defaults for an empty or missing custom list", () => {
    const body = CATEGORIES[0];
    expect(categoryMissions({}, body.id)).toBe(body.missions);
    expect(categoryMissions({ [body.id]: [] }, body.id)).toBe(body.missions);
    expect(categoryMissions({}, "project-x")).toEqual([]);
  });
  it("tags every mission of the full list, whatever the weekday", () => {
    const list = [m("Mon only", { daysOfWeek: [1] }), m("Daily"), m("Sun only", { daysOfWeek: [0] })];
    expect(taggedMissions({ c: list }, "c").map((x) => x.__originalIndex)).toEqual([0, 1, 2]);
  });
});

describe("withVariant", () => {
  it("shows the rolled variant's title and XP, clamped to the list", () => {
    const base = m("Cardio", { variants: variants("Run", "Swim") });
    expect(withVariant(base, 1)).toMatchObject({ title: "Swim", xp: 30 });
    expect(withVariant(base, undefined)).toMatchObject({ title: "Run", xp: 20 });
    expect(withVariant(base, 9)).toMatchObject({ title: "Swim" });
    expect(withVariant(m("Plain"), 1)).toMatchObject({ title: "Plain", xp: 10 });
  });
});

describe("completedMissionDetails", () => {
  it("indexes the full list (not today's filtered one) and uses the rolled variant", () => {
    const custom = {
      c: [m("Mon only", { daysOfWeek: [1], xp: 5 }), m("Cardio", { variants: variants("Run", "Swim") }), m("Read", { xp: 15 })],
      "project-a-b": [m("Ship", { xp: 40 })],
    };
    const details = completedMissionDetails(["c-2", "c-1", "project-a-b-0", "c-9", "junk"], custom, { "c-1": 1 });
    expect(details).toEqual([
      { title: "Read", xp: 15 },
      { title: "Swim", xp: 30 },
      { title: "Ship", xp: 40 },
    ]);
  });
});

describe("missionSources", () => {
  const old = [m("A"), m("B"), m("C")];
  it("prefers the carried index, even when the title was edited", () => {
    const next = [{ ...m("A2"), __originalIndex: 0 }, { ...m("C"), __originalIndex: 2 }, m("New")];
    expect(missionSources(old, next)).toEqual([0, 2, null]);
  });
  it("falls back to the title, case-insensitively, each old mission claimed once", () => {
    expect(missionSources(old, [m("c"), m("A"), m("A"), m("Z")])).toEqual([2, 0, null, null]);
  });
  it("ignores an out-of-range or duplicate carried index", () => {
    const next = [{ ...m("B"), __originalIndex: 7 }, { ...m("X"), __originalIndex: 0 }, { ...m("Y"), __originalIndex: 0 }];
    expect(missionSources(old, next)).toEqual([1, 0, null]);
  });
});

describe("remapCategoryKeys", () => {
  it("moves ticks and rolls with their missions and leaves other categories alone", () => {
    const newList = [m("C", { variants: variants("x", "y", "z") }), m("A"), m("New")];
    const r = remapCategoryKeys(
      "c",
      [2, 0, null],
      newList,
      ["c-0", "c-1", "c-2", "other-1", "c-extra-0"],
      { "c-2": 2, "other-1": 1 },
      noRoll,
    );
    // B (old 1) was dropped: its tick goes. C 2 -> 0, A 0 -> 1.
    expect([...r.completed].sort()).toEqual(["c-0", "c-1", "c-extra-0", "other-1"]);
    expect(r.rolled).toEqual({ "c-0": 2, "other-1": 1 });
  });
  it("rolls fresh for new variant missions and when the kept roll no longer fits", () => {
    const newList = [m("A", { variants: variants("x") }), m("N", { variants: variants("p", "q") })];
    const r = remapCategoryKeys("c", [0, null], newList, [], { "c-0": 3 }, () => 0);
    expect(r.rolled).toEqual({ "c-0": 0, "c-1": 0 });
  });
  it("shifts the missions after a split, like removeMission does", () => {
    // Ticked A and C around an unticked B, which is split in two: A stays at 0, C moves from 2 to 3.
    const newList = [m("A"), m("B1"), m("B2"), m("C")];
    const r = remapCategoryKeys("c", [0, null, null, 2], newList, ["c-0", "c-2"], {}, noRoll);
    expect([...r.completed].sort()).toEqual(["c-0", "c-3"]);
  });
});

describe("stripOriginalIndex", () => {
  it("drops the runtime index and keeps untagged missions as they are", () => {
    const plain = m("A");
    const out = stripOriginalIndex([{ ...m("B"), __originalIndex: 4 }, plain]);
    expect("__originalIndex" in out[0]).toBe(false);
    expect(out[1]).toBe(plain);
  });
});
