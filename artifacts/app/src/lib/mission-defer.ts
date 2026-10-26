import type { Mission } from "@/lib/dashboard-data";
import { addDays } from "@/lib/today";

/**
 * "Tomorrow" on a Home mission: it leaves today's list and comes back on the
 * next app day. Both fields live on the mission in custom_missions, so no
 * table is needed. `deferrals` counts the pushes since it was last done; from
 * DEFER_LIMIT on, the card asks what to do instead of pushing again, because
 * a task moved three times is too big, unclear, or not wanted.
 */
export const DEFER_LIMIT = 3;

/** Hidden today: pushed to a later day. */
export const isSnoozed = (m: Mission, today: string): boolean => !!m.snoozedUntil && m.snoozedUntil > today;

/** The mission pushed to tomorrow, with one more deferral counted. */
export const deferred = (m: Mission, today: string): Mission => ({
  ...m,
  snoozedUntil: addDays(today, 1),
  deferrals: (m.deferrals ?? 0) + 1,
});

/** Back on today's list; the count stays (it was pushed, then pulled back). */
export function unsnoozed(m: Mission): Mission {
  const { snoozedUntil: _s, ...rest } = m;
  return rest;
}

/** Done: the push count starts again. */
export function doneClearsDeferrals(m: Mission): Mission {
  if (!m.deferrals && !m.snoozedUntil) return m;
  const { deferrals: _d, snoozedUntil: _s, ...rest } = m;
  return rest;
}

/** Kept on purpose after the question: counted from zero again, and pushed. */
export const keptAndDeferred = (m: Mission, today: string): Mission => ({ ...m, snoozedUntil: addDays(today, 1), deferrals: 0 });

/** The card asks instead of pushing. */
export const needsDecision = (m: Mission): boolean => (m.deferrals ?? 0) >= DEFER_LIMIT;
