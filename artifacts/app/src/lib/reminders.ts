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
  for (const r of list) (new Date(r.deliverAt).getTime() <= now.getTime() ? due : upcoming).push(r);
  due.sort((a, b) => b.deliverAt.localeCompare(a.deliverAt));
  upcoming.sort((a, b) => a.deliverAt.localeCompare(b.deliverAt));
  return { due, upcoming };
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
