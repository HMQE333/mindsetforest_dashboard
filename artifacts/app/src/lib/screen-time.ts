import type { UsageSession } from "@/lib/app-usage-classify";

/**
 * Time in front of any screen: counted sessions from every device merged on
 * the clock, so a minute with the computer and the phone both in use counts
 * once. "Counted" is what the rest of Stats counts: active time, plus idle
 * time in a class that counts it (watching a video moves no mouse); pass
 * `counted` for that, by session index. Per-app and per-category totals stay
 * per device; this is one separate number.
 */
export function screenTimeSeconds(sessions: readonly UsageSession[], counted: (s: UsageSession, i: number) => boolean = (s) => !s.idle): number {
  const spans = sessions
    .filter(counted)
    .map((s) => [Date.parse(s.started_at), Date.parse(s.ended_at)] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let start = -Infinity;
  let end = -Infinity;
  for (const [a, b] of spans) {
    if (a > end) {
      if (end > start) total += end - start;
      start = a;
      end = b;
    } else if (b > end) end = b;
  }
  if (end > start) total += end - start;
  return Math.round(total / 1000);
}

/** The same sessions added up device by device (overlaps counted on each), for comparison. */
export const perDeviceSeconds = (sessions: readonly UsageSession[], counted: (s: UsageSession, i: number) => boolean = (s) => !s.idle) =>
  sessions.filter(counted).reduce((n, s) => n + Math.max(0, s.seconds), 0);
