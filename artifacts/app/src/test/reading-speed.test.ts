import { describe, it, expect } from "vitest";
import {
  PageClock, addTotals, binPages, countWords, formatSpan, formatSpanShort, perPage, speedOf, totalsOf, wordsPerPage,
  EMPTY_TOTALS, MAX_PAGE_SECONDS,
} from "../lib/reading-speed";

const sec = (n: number) => n * 1000;

describe("words", () => {
  it("counts words, not punctuation or stray symbols", () => {
    expect(countWords("Zażółć gęślą jaźń. The quick — brown fox, 2 times!")).toBe(9);
    expect(countWords("  \n ")).toBe(0);
  });

  it("splits pages on form feeds", () => {
    expect(wordsPerPage("one two\fthree\f\ffour five six")).toEqual([2, 1, 0, 3]);
  });
});

describe("PageClock", () => {
  it("counts a page when the reader moves on to the next one", () => {
    const words = [0, 250, 300, 280];
    const c = new PageClock((p) => words[p]);
    c.turn(1, 0);
    c.turn(2, sec(90));
    c.turn(3, sec(200));
    expect(c.samples).toEqual([{ p: 1, s: 90, w: 250 }, { p: 2, s: 110, w: 300 }]);
  });

  it("ignores flicking, jumps, going back and long breaks", () => {
    const c = new PageClock();
    c.turn(10, 0);
    c.turn(11, sec(2)); // flicked past 10
    c.turn(30, sec(60)); // jumped from 11
    c.turn(29, sec(120)); // went back
    c.turn(30, sec(150)); // 29 read for 30 s: counts
    c.turn(31, sec(150) + sec(MAX_PAGE_SECONDS + 1)); // walked away on 30
    expect(c.samples).toEqual([{ p: 29, s: 30 }]);
  });

  it("does not count time with the tab hidden", () => {
    const c = new PageClock();
    c.turn(1, 0);
    c.hide(sec(30));
    c.show(sec(30) + sec(3600));
    c.turn(2, sec(60) + sec(3600));
    expect(c.samples).toEqual([{ p: 1, s: 60 }]);
  });

  it("stays on the same page without a sample", () => {
    const c = new PageClock();
    c.turn(5, 0);
    expect(c.turn(5, sec(40))).toBeNull();
    c.turn(6, sec(80));
    expect(c.samples).toEqual([{ p: 5, s: 80 }]);
  });
});

describe("speed", () => {
  it("gives pages per hour and words per minute from text pages only", () => {
    const t = totalsOf([{ p: 1, s: 60, w: 250 }, { p: 2, s: 60, w: 250 }, { p: 3, s: 30, w: 10 }, { p: 4, s: 90 }]);
    expect(t).toEqual({ pages: 4, seconds: 240, words: 500, wordSeconds: 120 });
    const s = speedOf(t);
    expect(s.pagesPerHour).toBe(60);
    expect(s.secondsPerPage).toBe(60);
    expect(s.wordsPerMinute).toBe(250);
  });

  it("says nothing until there is enough to go on", () => {
    expect(speedOf(totalsOf([{ p: 1, s: 60, w: 300 }]))).toEqual({ pagesPerHour: null, secondsPerPage: null, wordsPerMinute: 300 });
    expect(speedOf(EMPTY_TOTALS)).toEqual({ pagesPerHour: null, secondsPerPage: null, wordsPerMinute: null });
  });

  it("adds sessions up", () => {
    const a = totalsOf([{ p: 1, s: 60, w: 200 }]);
    const b = totalsOf([{ p: 2, s: 40, w: 100 }]);
    expect(addTotals(a, b)).toEqual({ pages: 2, seconds: 100, words: 300, wordSeconds: 100 });
  });
});

describe("per page", () => {
  it("averages a page read twice and orders by page", () => {
    expect(perPage([{ p: 3, s: 100 }, { p: 1, s: 50 }, { p: 3, s: 60 }])).toEqual([
      { page: 1, seconds: 50, words: undefined, reads: 1 },
      { page: 3, seconds: 80, words: undefined, reads: 2 },
    ]);
  });

  it("pools pages into at most N columns", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({ page: i + 1, seconds: (i + 1) * 10 }));
    const bins = binPages(pages, 4);
    expect(bins.map((b) => [b.from, b.to])).toEqual([[1, 3], [4, 6], [7, 9], [10, 10]]);
    expect(bins[0].seconds).toBe(20);
    expect(binPages(pages, 50)).toHaveLength(10);
  });
});

describe("formatSpan", () => {
  it("reads naturally at every scale", () => {
    expect(formatSpan(48)).toBe("48s");
    expect(formatSpan(125)).toBe("2m 05s");
    expect(formatSpan(4320)).toBe("1h 12m");
    expect(formatSpanShort(877)).toBe("15 min");
    expect(formatSpanShort(4320)).toBe("1h 12m");
  });
});
