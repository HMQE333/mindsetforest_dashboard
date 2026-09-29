/**
 * Reading speed, measured in the in-app reader. Pure: the clock, the rules for
 * which page times count, and the arithmetic. Sessions are stored in
 * `reading_sessions` (see its migration for the same rules in prose).
 */

/** One page read in one sitting: PDF page, seconds on it, words on it when known. */
export interface PageSample {
  p: number;
  s: number;
  w?: number;
}

/** Faster than this is flicking through, not reading. */
export const MIN_PAGE_SECONDS = 4;
/** Longer than this on one page is a break, not reading. */
export const MAX_PAGE_SECONDS = 600;
/** Chapter openers and figure pages say nothing about words per minute. */
export const MIN_WORDS_FOR_WPM = 60;

export function countWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(token)) n++;
  return n;
}

/** Words on each page of text extracted with pages separated by "\f". */
export function wordsPerPage(text: string): number[] {
  return text.split("\f").map(countWords);
}

/**
 * Times the page in view. A page counts only when the reader then moves to
 * the very next page, having spent between MIN and MAX seconds on it; time
 * with the tab hidden is not counted.
 */
export class PageClock {
  samples: PageSample[] = [];
  private page: number | null = null;
  private since = 0;
  private paused = 0;
  private hiddenAt: number | null = null;

  constructor(private wordsOn: (page: number) => number | undefined = () => undefined) {}

  turn(page: number, now: number): PageSample | null {
    if (page === this.page) return null;
    let sample: PageSample | null = null;
    if (this.page !== null && page === this.page + 1) {
      const s = (now - this.since - this.paused - (this.hiddenAt !== null ? now - this.hiddenAt : 0)) / 1000;
      if (s >= MIN_PAGE_SECONDS && s <= MAX_PAGE_SECONDS) {
        sample = { p: this.page, s: Math.round(s) };
        const w = this.wordsOn(this.page);
        if (typeof w === "number") sample.w = w;
        this.samples.push(sample);
      }
    }
    this.page = page;
    this.since = now;
    this.paused = 0;
    if (this.hiddenAt !== null) this.hiddenAt = now;
    return sample;
  }

  hide(now: number): void {
    if (this.hiddenAt === null) this.hiddenAt = now;
  }

  show(now: number): void {
    if (this.hiddenAt === null) return;
    this.paused += now - this.hiddenAt;
    this.hiddenAt = null;
  }
}

/** What a session (or several) adds up to. */
export interface ReadingTotals {
  pages: number;
  seconds: number;
  /** Words on the counted pages that have enough text, and the time spent on them. */
  words: number;
  wordSeconds: number;
}

export const EMPTY_TOTALS: ReadingTotals = { pages: 0, seconds: 0, words: 0, wordSeconds: 0 };

export function totalsOf(samples: PageSample[]): ReadingTotals {
  const t = { ...EMPTY_TOTALS };
  for (const x of samples) {
    t.pages++;
    t.seconds += x.s;
    if ((x.w ?? 0) >= MIN_WORDS_FOR_WPM) {
      t.words += x.w as number;
      t.wordSeconds += x.s;
    }
  }
  return t;
}

export function addTotals(a: ReadingTotals, b: ReadingTotals): ReadingTotals {
  return {
    pages: a.pages + b.pages,
    seconds: a.seconds + b.seconds,
    words: a.words + b.words,
    wordSeconds: a.wordSeconds + b.wordSeconds,
  };
}

export interface ReadingSpeed {
  /** Null until there are enough pages to say anything. */
  pagesPerHour: number | null;
  secondsPerPage: number | null;
  wordsPerMinute: number | null;
}

/** Below this the numbers would be noise. */
export const MIN_PAGES_FOR_SPEED = 3;

export function speedOf(t: ReadingTotals): ReadingSpeed {
  const enough = t.pages >= MIN_PAGES_FOR_SPEED && t.seconds > 0;
  return {
    pagesPerHour: enough ? (t.pages * 3600) / t.seconds : null,
    secondsPerPage: enough ? t.seconds / t.pages : null,
    wordsPerMinute: t.wordSeconds >= 60 ? (t.words * 60) / t.wordSeconds : null,
  };
}

/** Time per page across sittings: the mean when a page was read more than once. */
export function perPage(samples: PageSample[]): { page: number; seconds: number; words?: number; reads: number }[] {
  const by = new Map<number, { total: number; reads: number; words?: number }>();
  for (const x of samples) {
    const cur = by.get(x.p) || { total: 0, reads: 0, words: x.w };
    cur.total += x.s;
    cur.reads++;
    if (x.w !== undefined) cur.words = x.w;
    by.set(x.p, cur);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, v]) => ({ page, seconds: v.total / v.reads, words: v.words, reads: v.reads }));
}

/**
 * At most `max` columns: consecutive pages are pooled into equal runs so a
 * long book still fits the width, each run showing its mean time per page.
 */
export function binPages<T extends { page: number; seconds: number }>(
  pages: T[],
  max: number,
): { from: number; to: number; seconds: number; count: number }[] {
  if (pages.length === 0) return [];
  const size = Math.max(1, Math.ceil(pages.length / Math.max(1, max)));
  const out: { from: number; to: number; seconds: number; count: number }[] = [];
  for (let i = 0; i < pages.length; i += size) {
    const run = pages.slice(i, i + size);
    out.push({
      from: run[0].page,
      to: run[run.length - 1].page,
      seconds: run.reduce((n, r) => n + r.seconds, 0) / run.length,
      count: run.length,
    });
  }
  return out;
}

/** "48s", "2m 05s", "1h 12m". */
export function formatSpan(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Compact for tiles: "48s", "15 min", "1h 12m". */
export function formatSpanShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return formatSpan(s);
}
