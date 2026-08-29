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
  /** Set by the stall check when the user answers "wrong time". */
  snoozed_until: string | null;
  created_at: string;
}

export interface Path {
  id: string;
  name: string;
  category_id: string | null;
  archived: boolean;
  sort_order: number;
  /**
   * The binding constraint the user claims is in the way, written before the
   * work starts. This is the line that gets scored - not the completion count.
   */
  diagnosis: string | null;
  diagnosis_verdict: DiagnosisVerdict | null;
  diagnosis_actual: string | null;
  scored_at: string | null;
}

export type DiagnosisVerdict = "right" | "wrong" | "unknown";

/**
 * The plan as it stood before a change. Deliberately carries no `reps_done` or
 * `done`: reverting changes the map, never the record of what was actually done.
 */
export interface SnapshotStep {
  id: string;
  title: string;
  stage: string | null;
  mode: StepMode;
  reps_target: number;
  xp: number;
  sort_order: number;
}

export interface PathSnapshot {
  name: string;
  diagnosis: string | null;
  steps: SnapshotStep[];
}

export type RevisionSource = "user" | "assistant" | "ai_plan" | "revert";

export interface PathRevision {
  id: string;
  path_id: string;
  snapshot: PathSnapshot;
  /** Why the plan changed. A diff log without this is a chat transcript. */
  reason: string | null;
  source: RevisionSource;
  created_at: string;
}

export function snapshotOf(path: Path, steps: PathStep[]): PathSnapshot {
  return {
    name: path.name,
    diagnosis: path.diagnosis,
    steps: sortSteps(steps).map(s => ({
      id: s.id,
      title: s.title,
      stage: s.stage,
      mode: s.mode,
      reps_target: s.reps_target,
      xp: s.xp,
      sort_order: s.sort_order,
    })),
  };
}

/** One-line summary of what a revision changed, for the history list. */
export function describeRevision(snapshot: PathSnapshot, current: PathSnapshot): string {
  const before = snapshot.steps.length;
  const after = current.steps.length;
  const renamed = snapshot.steps.filter(s => {
    const now = current.steps.find(c => c.id === s.id);
    return now && now.title !== s.title;
  }).length;
  const bits: string[] = [];
  if (after > before) bits.push(`+${after - before} step${after - before > 1 ? "s" : ""}`);
  if (after < before) bits.push(`-${before - after} step${before - after > 1 ? "s" : ""}`);
  if (renamed) bits.push(`${renamed} reworded`);
  if (snapshot.diagnosis !== current.diagnosis) bits.push("diagnosis changed");
  return bits.length ? bits.join(", ") : "reordered";
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

function daysBetween(fromKey: string, today: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/**
 * How long the step has sat still. This is the only trigger in the app allowed
 * to interrupt the user, so it has to be fair about where it counts from:
 *
 *   1. the last day it was actually logged, or
 *   2. the day the step before it finished - the day this one became next, or
 *   3. the day it was created.
 *
 * Counting from creation alone would nag about a step that only became
 * reachable yesterday, which is how a useful check turns into noise.
 */
export function stepIdleDays(logs: StepLog[], ordered: PathStep[], stepId: string, today: string = todayKey()): number {
  const dates = logs.filter(l => l.step_id === stepId).map(l => l.date).sort();
  const last = dates[dates.length - 1];
  if (last) return daysBetween(last, today);

  const list = sortSteps(ordered);
  const index = list.findIndex(s => s.id === stepId);
  const step = list[index];
  if (!step) return 0;

  const previous = index > 0 ? list[index - 1] : null;
  const baseline = previous?.done_at || step.created_at;
  if (!baseline) return 0;
  return daysBetween(todayKey(new Date(baseline)), today);
}

/** Human label for a step's remaining work. */
export function stepRemainingLabel(step: PathStep): string {
  if (step.done) return "done";
  if (step.mode === "once") return "one step";
  return `${step.reps_done}/${step.reps_target} days`;
}
