/**
 * "When" filter shared by the Archive Library and the Forest: a preset, or a
 * custom range of local calendar days (inclusive). Days follow the device's
 * local midnight, not the app's 04:00 day: "today" here means the calendar day.
 */
export type DatePreset = "all" | "today" | "week" | "month" | "year" | "custom";

export interface DateFilter {
  preset: DatePreset;
  /** YYYY-MM-DD, custom only. */
  from?: string;
  to?: string;
}

export const ALL_DATES: DateFilter = { preset: "all" };

export const DATE_PRESETS: { id: Exclude<DatePreset, "custom">; label: string }[] = [
  { id: "all", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "year", label: "This year" },
];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const parseDay = (s: string | undefined) => {
  const m = s && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
};
const DAY = 86_400_000;

/** [start, end) in ms, or null for no limit. */
export function dateRange(f: DateFilter, now: Date = new Date()): [number, number] | null {
  const today = dayStart(now);
  switch (f.preset) {
    case "today": return [today, today + DAY];
    case "week": return [today - 6 * DAY, today + DAY];
    case "month": return [today - 29 * DAY, today + DAY];
    case "year": return [new Date(now.getFullYear(), 0, 1).getTime(), Infinity];
    case "custom": {
      const from = parseDay(f.from);
      const to = parseDay(f.to);
      if (from === null && to === null) return null;
      // A to day before the from day is read the other way round.
      if (from !== null && to !== null && to < from) return [to, from + DAY];
      return [from ?? -Infinity, to === null ? Infinity : to + DAY];
    }
    default: return null;
  }
}

/** The items whose date (ISO string) falls in the filter. */
export function filterByDate<T>(items: readonly T[], f: DateFilter, dateOf: (item: T) => string | null | undefined, now?: Date): T[] {
  const r = dateRange(f, now);
  if (!r) return items as T[];
  return items.filter((it) => {
    const t = Date.parse(dateOf(it) ?? "");
    return Number.isFinite(t) && t >= r[0] && t < r[1];
  });
}

export const isDateFiltered = (f: DateFilter) => dateRange(f) !== null;
