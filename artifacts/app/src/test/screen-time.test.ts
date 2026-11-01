import { describe, expect, it } from "vitest";
import { perDeviceSeconds, screenTimeSeconds } from "@/lib/screen-time";
import type { UsageSession } from "@/lib/app-usage-classify";

const s = (device: string, from: string, to: string, idle = false): UsageSession => ({
  id: `${device}${from}`, device_id: device, app: "a", app_key: "a", window_title: "", idle, local_date: "2026-11-01",
  started_at: `2026-11-01T${from}:00Z`, ended_at: `2026-11-01T${to}:00Z`,
  seconds: (Date.parse(`2026-11-01T${to}:00Z`) - Date.parse(`2026-11-01T${from}:00Z`)) / 1000,
});

describe("screenTimeSeconds", () => {
  it("counts overlapping minutes on two devices once", () => {
    const list = [s("pc", "09:00", "10:00"), s("android:x", "09:30", "10:30")];
    expect(screenTimeSeconds(list)).toBe(90 * 60);
    expect(perDeviceSeconds(list)).toBe(120 * 60);
  });
  it("adds separate spans and skips idle time", () => {
    expect(screenTimeSeconds([s("pc", "09:00", "09:10"), s("pc", "11:00", "11:05"), s("android:x", "12:00", "13:00", true)])).toBe(15 * 60);
  });
  it("is zero without sessions", () => {
    expect(screenTimeSeconds([])).toBe(0);
  });
});

describe("idle that counts (watching)", () => {
  it("counts idle sessions the predicate accepts", () => {
    const list = [s("pc", "20:00", "21:00", true), s("android:x", "20:30", "21:30")];
    expect(screenTimeSeconds(list, () => true)).toBe(90 * 60);
    expect(screenTimeSeconds(list)).toBe(60 * 60);
  });
});
