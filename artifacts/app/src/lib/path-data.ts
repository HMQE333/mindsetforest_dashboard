/**
 * Paths - the single progression module (replaces Mastery Ladder + Habit Loop).
 *
 * A Path is a named goal with ordered steps. A step is either done once
 * (`once`) or repeated over N separate days (`reps`). There is no fixed set of
 * levels and no "current loop" pointer: the active step is just the first
 * unfinished one, so reordering steps is all it takes to change what's next.
 */

export type StepMode = "once" | "reps";

export interface PathStep {
  id: string;
  path_id: string;
  title: string;
  /** Optional free-text grouping label. Zero stages is a valid path. */
  stage: string | null;
  mode: StepMode;
  reps_target: number;
  reps_done: number;
  xp: number;
  done: boolean;
  done_at: string | null;
  sort_order: number;
}

export interface Path {
  id: string;
  name: string;
  category_id: string | null;
  archived: boolean;
  sort_order: number;
}

export interface StepLog {
  step_id: string;
  path_id: string;
  date: string;
  xp: number;
}

/** A step surfaced on Home for today. */
export interface TodayStep {
  path: Path;
  step: PathStep;
  /** Already logged today - shown as done, not as a pending task. */
  loggedToday: boolean;
  /** Consecutive days ending today/yesterday. 0 for `once` steps. */
  streak: number;
}

export const DEFAULT_STEP_XP = 20;

/** Local calendar date (never toISOString - that shifts the day near midnight). */
export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return todayKey(dt);
}

export function sortSteps(steps: PathStep[]): PathStep[] {
  return [...steps].sort((a, b) => a.sort_order - b.sort_order);
}

/** The first unfinished step. This is the whole scheduling model. */
export function activeStep(steps: PathStep[]): PathStep | null {
  return sortSteps(steps).find(s => !s.done) || null;
}

/** The step after the active one, shown dimmed as "what's coming". */
export function nextStep(steps: PathStep[]): PathStep | null {
  const pending = sortSteps(steps).filter(s => !s.done);
  return pending[1] || null;
}

/**
 * Progress in reps, not in steps: a 20-rep step shouldn't read as "0%" for
 * three weeks. A `once` step counts as a single rep.
 */
export function pathProgress(steps: PathStep[]): { done: number; total: number; percentage: number } {
  let done = 0;
  let total = 0;
  for (const s of steps) {
    const target = s.mode === "reps" ? Math.max(1, s.reps_target) : 1;
    total += target;
    done += s.done ? target : Math.min(s.reps_done, target);
  }
  return { done, total, percentage: total ? Math.round((done / total) * 100) : 0 };
}

/** Consecutive logged days for a step, counting back from today or yesterday. */
export function stepStreak(logs: StepLog[], stepId: string, today: string = todayKey()): number {
  const days = new Set(logs.filter(l => l.step_id === stepId).map(l => l.date));
  if (days.size === 0) return 0;
  let cursor = days.has(today) ? today : shiftDays(today, -1);
  if (!days.has(cursor)) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

/** Human label for a step's remaining work. */
export function stepRemainingLabel(step: PathStep): string {
  if (step.done) return "done";
  if (step.mode === "once") return "one step";
  return `${step.reps_done}/${step.reps_target} days`;
}
