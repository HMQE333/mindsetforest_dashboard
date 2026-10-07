import { describe, it, expect } from "vitest";
import { cleanDeviceName, deviceLabel, deviceNames, hoursLabel, mergeTargets } from "../lib/tracker-devices";

const PHONE = "android:2201116SG:5d8a58acac187888";
const OLD = "e74d9b91-6ca2-4d23-8f8c-e4b8c634c3b9";
const NEW = "9de96398-1e51-44f3-81b3-c878db6028a2";
const summary = (device_id: string, seconds = 3600) => ({ device_id, sessions: 1, seconds, first_at: "", last_at: "" });

describe("device names", () => {
  it("prefers the dashboard's name, then the device's own, else the id", () => {
    const names = deviceNames([
      { device_id: NEW, name: "Laptop", reported_name: "DESKTOP-7Q2" },
      { device_id: OLD, name: null, reported_name: "DESKTOP-7Q2" },
      { device_id: PHONE, name: "  ", reported_name: null },
    ]);
    expect(names).toEqual({ [NEW]: "Laptop", [OLD]: "DESKTOP-7Q2" });
    expect(deviceLabel(NEW, names)).toBe("💻 Laptop");
    expect(deviceLabel(PHONE, names)).toBe("📱 2201116SG");
    expect(deviceLabel(PHONE, { [PHONE]: "Telefon" })).toBe("📱 Telefon");
    expect(deviceLabel("3f2a1b9c-1111-2222-3333-444455556666")).toBe("💻 3f2a1b9c…");
  });

  it("only offers merging a computer into a computer and a phone into a phone", () => {
    const all = [summary(PHONE), summary(OLD), summary(NEW)];
    expect(mergeTargets(OLD, all).map((d) => d.device_id)).toEqual([NEW]);
    expect(mergeTargets(PHONE, all)).toEqual([]);
  });

  it("formats hours and cleans typed names", () => {
    expect([hoursLabel(600), hoursLabel(5400), hoursLabel(345600)]).toEqual(["10 min", "1,5 h", "96 h"]);
    expect(cleanDeviceName("  my   laptop ")).toBe("my laptop");
    expect(cleanDeviceName("x".repeat(80))).toHaveLength(60);
  });
});
