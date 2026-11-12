/**
 * Reminders the user schedules for themselves, for any moment: in an hour or
 * in five years ("a message from the past"). Pure helpers; the table access
 * is in hooks/useReminders.ts.
 */

export interface Reminder {
  id: string;
  message: string;
  deliverAt: string;
  createdAt: string;
  /** Set for an occurrence of a repeating reminder. */
  seriesId?: string | null;
}

/** How a reminder repeats. Weekly days: 0 = Sunday .. 6 = Saturday. */
export type RepeatRule =
  | { freq: "daily"; time: string }
  | { freq: "weekly"; days: number[]; time: string }
  | { freq: "monthly"; monthDay: number; time: string };

export interface ReminderSeries { id: string; message: string; rule: RepeatRule; active: boolean }

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Mon..Sun order for pickers. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const dayShort = (d: number) => DAY_SHORT[d] ?? "";

/** "every day 09:00", "every Mon, Thu 18:00", "every month on the 1st 09:00". */
export function describeRepeat(rule: RepeatRule): string {
  const t = rule.time.slice(0, 5);
  if (rule.freq === "daily") return `every day ${t}`;
  if (rule.freq === "weekly") {
    const days = WEEK_ORDER.filter((d) => rule.days.includes(d));
    if (days.length === 7) return `every day ${t}`;
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return `weekdays ${t}`;
    return `every ${days.map(dayShort).join(", ")} ${t}`;
  }
  const n = rule.monthDay;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `every month on the ${n}${suffix} ${t}`;
}

/** A table row of reminder_series as a rule (null when it is malformed). */
export function rowToSeries(row: { id: string; message: string; freq: string; days: number[] | null; month_day: number | null; at_time: string; active: boolean }): ReminderSeries | null {
  const time = (row.at_time || "09:00").slice(0, 5);
  let rule: RepeatRule | null = null;
  if (row.freq === "daily") rule = { freq: "daily", time };
  else if (row.freq === "weekly" && row.days?.length) rule = { freq: "weekly", days: row.days, time };
  else if (row.freq === "monthly" && row.month_day) rule = { freq: "monthly", monthDay: row.month_day, time };
  return rule ? { id: row.id, message: row.message, rule, active: row.active } : null;
}

export interface QuickPick {
  id: string;
  label: string;
  at: (now: Date) => Date;
}

const at9 = (d: Date) => { const x = new Date(d); x.setHours(9, 0, 0, 0); return x; };
const plusDays = (now: Date, n: number) => { const x = new Date(now); x.setDate(x.getDate() + n); return x; };
const plusMonths = (now: Date, n: number) => { const x = new Date(now); x.setMonth(x.getMonth() + n); return x; };

export const QUICK_PICKS: QuickPick[] = [
  { id: "1h", label: "In an hour", at: (now) => new Date(now.getTime() + 3600_000) },
  { id: "evening", label: "This evening", at: (now) => { const x = new Date(now); x.setHours(20, 0, 0, 0); return x <= now ? plusDays(x, 1) : x; } },
  { id: "tomorrow", label: "Tomorrow 9:00", at: (now) => at9(plusDays(now, 1)) },
  { id: "week", label: "In a week", at: (now) => at9(plusDays(now, 7)) },
  { id: "month", label: "In a month", at: (now) => at9(plusMonths(now, 1)) },
  { id: "year", label: "In a year", at: (now) => at9(plusMonths(now, 12)) },
  { id: "5y", label: "In 5 years", at: (now) => at9(plusMonths(now, 60)) },
];

/** "2026-10-02T09:00" for an <input type="datetime-local">, in local time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "in 3 hours", "in 2 months", "in 5 years", or "now" once it is due. */
export function timeUntil(at: Date, now: Date = new Date()): string {
  const ms = at.getTime() - now.getTime();
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `in ${months} months`;
  const years = Math.round(days / 365.25);
  return `in ${years} years`;
}

/** Split the open reminders into the ones that have arrived and the ones still waiting. */
export function splitReminders(list: Reminder[], now: Date = new Date()): { due: Reminder[]; upcoming: Reminder[] } {
  const due: Reminder[] = [];
  const upcoming: Reminder[] = [];
  const nextOfSeries = new Map<string, Reminder>();
  for (const r of list) {
    if (new Date(r.deliverAt).getTime() <= now.getTime()) { due.push(r); continue; }
    // A repeating reminder is listed once, by its next time (its later ones are made ahead, not news).
    if (r.seriesId) {
      const seen = nextOfSeries.get(r.seriesId);
      if (!seen || r.deliverAt < seen.deliverAt) nextOfSeries.set(r.seriesId, r);
      continue;
    }
    upcoming.push(r);
  }
  upcoming.push(...nextOfSeries.values());
  due.sort((a, b) => b.deliverAt.localeCompare(a.deliverAt));
  upcoming.sort((a, b) => a.deliverAt.localeCompare(b.deliverAt));
  return { due, upcoming };
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
