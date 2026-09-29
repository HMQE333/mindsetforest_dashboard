/**
 * One definition of "today" for the whole app.
 *
 * The owner's day ends at 04:00 local time, not at midnight: a mission finished
 * at 01:30 belongs to the evening that started it, and a tracker session that
 * crosses midnight stays on one day. Every day key in the app (dashboard_state,
 * daily_completions, tracker_entries, path_step_logs, app usage) must come from
 * these helpers, never from `toISOString()` (UTC) or a bare local midnight.
 *
 * Keys are plain `YYYY-MM-DD` strings so they sort and compare lexically.
 */

export const DAY_START_HOUR = 4;

const pad = (n: number) => String(n).padStart(2, "0");

/** Format a Date's local calendar parts as YYYY-MM-DD (no timezone shifting). */
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Local noon of the day an instant belongs to, so 03:59 still counts as the
 * previous day. Read off the local clock rather than by subtracting four hours
 * of absolute time: on a DST change the day has 23 or 25 hours and the
 * subtraction would move the boundary to 03:00 or 05:00.
 */
export function logicalDate(at: Date = new Date()): Date {
  const day = at.getHours() < DAY_START_HOUR ? at.getDate() - 1 : at.getDate();
  return new Date(at.getFullYear(), at.getMonth(), day, 12, 0, 0);
}

/** Day key for an instant, honouring the 04:00 boundary. */
export function dayKey(at: Date = new Date()): string {
  return formatLocalDate(logicalDate(at));
}

/** Day key for right now. */
export function todayKey(): string {
  return dayKey(new Date());
}

/** Shift a YYYY-MM-DD key by n days (negative allowed). Pure calendar arithmetic. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n, 12, 0, 0);
  return formatLocalDate(dt);
}

export function yesterdayKey(): string {
  return addDays(todayKey(), -1);
}

/** Parse a YYYY-MM-DD key into a local Date at noon (safe from DST edge cases). */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Whole days between two keys (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86_400_000);
}

/** Month key YYYY-MM for an instant, honouring the day boundary. */
export function monthKey(at: Date = new Date()): string {
  return dayKey(at).slice(0, 7);
}

/**
 * The last `n` day keys ending today (oldest first). Used for zero-filled
 * week/fortnight buckets in stats.
 */
export function lastNDays(n: number, endKey: string = todayKey()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

/**
 * Streak with weekly freezes. Counts consecutive active days ending today (or
 * yesterday, so the streak does not drop to zero before the user has had a
 * chance to act today), tolerating up to `freezesPerWeek` missed days inside
 * any rolling 7-day window. Returns 0 for a user with no active days.
 */
export function computeStreak(
  activeDays: Iterable<string>,
  today: string = todayKey(),
  freezesPerWeek = 2,
): number {
  const active = new Set(activeDays);
  if (active.size === 0) return 0;
  // Start from today if it already has activity, else from yesterday. A missed
  // yesterday is not a broken streak: it consumes a freeze like any other miss,
  // so the hero keeps showing the streak in the morning before the first log.
  let cursor = active.has(today) ? today : addDays(today, -1);
  let streak = 0;
  const missedInWindow: string[] = [];
  for (let guard = 0; guard < 3660; guard++) {
    if (active.has(cursor)) {
      streak++;
    } else {
      // drop misses that fell out of the rolling 7-day window
      while (missedInWindow.length && daysBetween(cursor, missedInWindow[0]) >= 7) missedInWindow.shift();
      if (missedInWindow.length >= freezesPerWeek) break;
      missedInWindow.push(cursor);
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}
