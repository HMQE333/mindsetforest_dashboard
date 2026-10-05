import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { byBook, dayLabel, describeEntry, logError, nextFromPage, pagesIn, type ReadingLogEntry } from "../lib/reading-log";

const entry = (over: Partial<ReadingLogEntry>): ReadingLogEntry => ({
  id: "e",
  bookId: "b1",
  readOn: "2026-10-05",
  fromPage: 100,
  toPage: 123,
  source: "manual",
  createdAt: "2026-10-05T10:00:00Z",
  ...over,
});

describe("reading log", () => {
  it("counts both pages and starts after the bookmark", () => {
    expect(pagesIn({ fromPage: 100, toPage: 123 })).toBe(24);
    expect(pagesIn({ fromPage: 5, toPage: 5 })).toBe(1);
    expect(nextFromPage(99)).toBe(100);
    expect(nextFromPage(0)).toBe(1);
  });

  it("says why a stretch cannot be saved", () => {
    expect(logError(100, 123, 0)).toBeNull();
    expect(logError(100, 123, 320)).toBeNull();
    expect(logError(0, 10, 0)).toBe("Pages start at 1");
    expect(logError(50, 40, 0)).toBe("The last page comes after the first");
    expect(logError(300, 330, 320)).toBe("The book has 320 pages");
    expect(logError(1.5, 4, 0)).toBe("Pages start at 1");
  });

  it("labels days the way people say them", () => {
    expect(dayLabel("2026-10-05", "2026-10-05")).toBe("Today");
    expect(dayLabel("2026-10-04", "2026-10-05")).toBe("Yesterday");
    expect(dayLabel("2026-09-30", "2026-10-01")).toBe("Yesterday");
    expect(dayLabel("2026-09-12", "2026-10-05")).toBe("12 Sept");
    expect(dayLabel("2025-12-31", "2026-10-05")).toBe("31 Dec 2025");
    expect(describeEntry(entry({}), "2026-10-05")).toBe("Today · 100 → 123");
  });

  it("groups per book, newest day first, then newest written", () => {
    const grouped = byBook([
      entry({ id: "old", readOn: "2026-10-01" }),
      entry({ id: "late", readOn: "2026-10-05", createdAt: "2026-10-05T21:00:00Z" }),
      entry({ id: "early", readOn: "2026-10-05", createdAt: "2026-10-05T08:00:00Z" }),
      entry({ id: "other", bookId: "b2" }),
    ]);
    expect(grouped.b1.map((e) => e.id)).toEqual(["late", "early", "old"]);
    expect(grouped.b2.map((e) => e.id)).toEqual(["other"]);
  });
});
