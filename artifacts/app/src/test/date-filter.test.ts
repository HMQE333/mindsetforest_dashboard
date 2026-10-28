import { describe, expect, it } from "vitest";
import { filterByDate } from "@/lib/date-filter";

const now = new Date(2026, 9, 28, 15, 0);
const at = (y: number, m: number, d: number, h = 12) => ({ d: new Date(y, m, d, h).toISOString() });
const items = [at(2026, 9, 28, 1), at(2026, 9, 22), at(2026, 9, 21), at(2026, 8, 30), at(2025, 11, 31)];
const pick = (f: Parameters<typeof filterByDate>[1]) => filterByDate(items, f, (i) => i.d, now).length;

describe("filterByDate", () => {
  it("presets", () => {
    expect(pick({ preset: "all" })).toBe(5);
    expect(pick({ preset: "today" })).toBe(1);
    expect(pick({ preset: "week" })).toBe(2);
    expect(pick({ preset: "month" })).toBe(4);
    expect(pick({ preset: "year" })).toBe(4);
  });
  it("custom ranges are inclusive and order-proof", () => {
    expect(pick({ preset: "custom", from: "2026-10-21", to: "2026-10-22" })).toBe(2);
    expect(pick({ preset: "custom", from: "2026-10-22", to: "2026-10-21" })).toBe(2);
    expect(pick({ preset: "custom", to: "2025-12-31" })).toBe(1);
    expect(pick({ preset: "custom" })).toBe(5);
  });
});
