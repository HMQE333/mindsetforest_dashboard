import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { revisePathPlan, PlanStep } from "@/lib/path-writes";
import {
  Path,
  PathStep,
  PathRevision,
  PathSnapshot,
  DiagnosisVerdict,
  RevisionSource,
  StepLog,
  StepMode,
  TodayStep,
  DEFAULT_STEP_XP,
  activeStep,
  snapshotOf,
  sortSteps,
  stepStreak,
  todayKey,
} from "@/lib/path-data";

/**
 * Fired whenever paths are written, so the Home strip and the Paths view stay
 * in sync without a context refactor (same pattern as PLANNING_TASKS_CHANGED_EVENT).
 */
export const PATHS_CHANGED_EVENT = "paths-changed";

export function notifyPathsChanged() {
  window.dispatchEvent(new CustomEvent(PATHS_CHANGED_EVENT));
}

type PgError = { code?: string; message?: string } | null;

/** Migration not applied yet - render a hint instead of crashing. */
function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache/i.test(error.message || "");
}

/**
 * Paths and steps are read with `*` on purpose.
 *
 * PostgREST rejects the WHOLE query when one named column is missing, so a
 * deploy that lands before its migration does not degrade - every row vanishes
 * and the UI renders a convincing "you have nothing here yet". Naming no
 * columns removes that failure mode entirely rather than trying to recognise
 * it after the fact: the database returns whatever it actually has, and the
 * fields the migration has not added yet are filled in as null below.
 *
 * These tables are small and we were selecting nearly every column anyway.
 */
const PATH_ENGINE_FIELDS = {
  diagnosis: null,
  diagnosis_verdict: null,
  diagnosis_actual: null,
  scored_at: null,
};
const STEP_ENGINE_FIELDS = { snoozed_until: null };

const LOG_WINDOW_DAYS = 60;

export function usePaths() {
  const { user } = useAuth();
  const [paths, setPaths] = useState<Path[]>([]);
  const [steps, setSteps] = useState<PathStep[]>([]);
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [revisions, setRevisions] = useState<PathRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTables, setMissingTables] = useState(false);
  /** False until the planning-loop migration has run: diagnosis, history, stall check. */
  const [engineReady, setEngineReady] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const since = new Date();
    since.setDate(since.getDate() - LOG_WINDOW_DAYS);

    const [pathsRes, stepsRes, logsRes, revRes] = await Promise.all([
      (supabase.from("paths" as any) as any)
        .select("*").eq("user_id", user.id).order("sort_order", { ascending: true }),
      (supabase.from("path_steps" as any) as any)
        .select("*").eq("user_id", user.id).order("sort_order", { ascending: true }),
      (supabase.from("path_step_logs" as any) as any)
        .select("step_id,path_id,date,xp")
        .eq("user_id", user.id)
        .gte("date", todayKey(since)),
      (supabase.from("path_revisions" as any) as any)
        .select("id,path_id,snapshot,reason,source,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (isMissingTable(pathsRes.error)) {
      setMissingTables(true);
      setLoading(false);
      return;
    }

    setMissingTables(false);

    // Never swallow a read failure again: an empty list that is really an error
    // is the bug that made every path look deleted.
    if (pathsRes.error || stepsRes.error) {
      console.error("Paths read failed:", pathsRes.error || stepsRes.error);
    }

    const pathRows = (pathsRes.data as Record<string, unknown>[] | null) || [];
    const stepRows = (stepsRes.data as Record<string, unknown>[] | null) || [];

    // Whether the planning-loop migration has run is read off the rows we just
    // got back, not off an error code. With no paths there is nothing to hide,
    // so the features stay enabled.
    setEngineReady(pathRows.length === 0 || "diagnosis" in pathRows[0]);

    setPaths(pathRows.map(row => ({ ...PATH_ENGINE_FIELDS, ...row })) as unknown as Path[]);
    setSteps(stepRows.map(row => ({ ...STEP_ENGINE_FIELDS, ...row })) as unknown as PathStep[]);
    if (logsRes.data) setLogs(logsRes.data as StepLog[]);
    // History arrived with the same migration; no history is a fine degradation.
    setRevisions((revRes?.data as PathRevision[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const handler = () => { fetchAll(); };
    window.addEventListener(PATHS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PATHS_CHANGED_EVENT, handler);
  }, [fetchAll]);

  const stepsByPath = useCallback(
    (pathId: string) => sortSteps(steps.filter(s => s.path_id === pathId)),
    [steps],
  );

  const revisionsOf = useCallback(
    (pathId: string) => revisions.filter(r => r.path_id === pathId),
    [revisions],
  );

  /** What Home shows: the active step of every live path, at most one per path. */
  const todaySteps = useMemo<TodayStep[]>(() => {
    const today = todayKey();
    const loggedToday = new Set(logs.filter(l => l.date === today).map(l => l.step_id));
    const out: TodayStep[] = [];
    for (const path of paths) {
      if (path.archived) continue;
      const step = activeStep(steps.filter(s => s.path_id === path.id));
      if (!step) continue;
      out.push({
        path,
        step,
        loggedToday: loggedToday.has(step.id),
        streak: step.mode === "reps" ? stepStreak(logs, step.id, today) : 0,
      });
    }
    return out;
  }, [paths, steps, logs]);

  // ---- paths ----

  const createPath = useCallback(async (name: string, categoryId?: string | null) => {
    if (!user) return null;
    const { data, error } = await (supabase.from("paths" as any) as any)
      .insert({
        user_id: user.id,
        name,
        category_id: categoryId ?? null,
        sort_order: paths.length,
      })
      .select()
      .single();
    if (error || !data) return null;
    setPaths(prev => [...prev, { ...PATH_ENGINE_FIELDS, ...(data as object) } as unknown as Path]);
    notifyPathsChanged();
    return data as Path;
  }, [user, paths.length]);

  const updatePath = useCallback(async (id: string, patch: Partial<Pick<Path, "name" | "category_id" | "archived" | "diagnosis">>) => {
    setPaths(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
    await (supabase.from("paths" as any) as any).update(patch).eq("id", id);
    notifyPathsChanged();
  }, []);

  const deletePath = useCallback(async (id: string) => {
    setPaths(prev => prev.filter(p => p.id !== id));
    setSteps(prev => prev.filter(s => s.path_id !== id));
    await (supabase.from("paths" as any) as any).delete().eq("id", id);
    notifyPathsChanged();
  }, []);

  // ---- steps ----

  const addStep = useCallback(async (
    pathId: string,
    title: string,
    opts: { mode?: StepMode; repsTarget?: number; stage?: string | null; xp?: number } = {},
  ) => {
    if (!user) return null;
    const mode: StepMode = opts.mode || "once";
    const siblings = steps.filter(s => s.path_id === pathId);
    const row = {
      user_id: user.id,
      path_id: pathId,
      title,
      stage: opts.stage ?? null,
      mode,
      reps_target: mode === "reps" ? Math.max(1, opts.repsTarget || 7) : 1,
      xp: opts.xp ?? DEFAULT_STEP_XP,
      sort_order: siblings.length,
    };
    const { data, error } = await (supabase.from("path_steps" as any) as any).insert(row).select().single();
    if (error || !data) return null;
    setSteps(prev => [...prev, data as PathStep]);
    notifyPathsChanged();
    return data as PathStep;
  }, [user, steps]);

  const updateStep = useCallback(async (id: string, patch: Partial<PathStep>) => {
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
    await (supabase.from("path_steps" as any) as any).update(patch).eq("id", id);
    notifyPathsChanged();
  }, []);

  const deleteStep = useCallback(async (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
    await (supabase.from("path_steps" as any) as any).delete().eq("id", id);
    notifyPathsChanged();
  }, []);

  /** Swap sort_order with the neighbour. Reordering is how you re-plan a path. */
  const moveStep = useCallback(async (id: string, direction: -1 | 1) => {
    const step = steps.find(s => s.id === id);
    if (!step) return;
    const ordered = stepsByPath(step.path_id);
    const idx = ordered.findIndex(s => s.id === id);
    const target = ordered[idx + direction];
    if (!target) return;
    const a = { id: step.id, sort_order: target.sort_order };
    const b = { id: target.id, sort_order: step.sort_order };
    setSteps(prev => prev.map(s => (s.id === a.id ? { ...s, sort_order: a.sort_order } : s.id === b.id ? { ...s, sort_order: b.sort_order } : s)));
    await Promise.all([
      (supabase.from("path_steps" as any) as any).update({ sort_order: a.sort_order }).eq("id", a.id),
      (supabase.from("path_steps" as any) as any).update({ sort_order: b.sort_order }).eq("id", b.id),
    ]);
    notifyPathsChanged();
  }, [steps, stepsByPath]);

  // ---- the plan as a versioned object ----

  /**
   * Writes the plan as it stands right now into the history, then returns the
   * snapshot. Call this BEFORE mutating, so the row describes what you are
   * about to leave behind.
   */
  const recordRevision = useCallback(async (
    pathId: string,
    reason: string,
    source: RevisionSource = "user",
  ): Promise<PathSnapshot | null> => {
    if (!user) return null;
    const path = paths.find(p => p.id === pathId);
    if (!path) return null;
    const snapshot = snapshotOf(path, steps.filter(s => s.path_id === pathId));
    const { data } = await (supabase.from("path_revisions" as any) as any)
      .insert({ user_id: user.id, path_id: pathId, snapshot, reason: reason || null, source })
      .select()
      .single();
    if (data) setRevisions(prev => [data as PathRevision, ...prev]);
    return snapshot;
  }, [user, paths, steps]);

  /**
   * Restores a past plan.
   *
   * The rule that shapes this: a revert changes the map, never the record. A
   * step with logged days against it is never deleted, however the plan used to
   * look - that work happened, and the XP and streaks hang off it. Steps the
   * snapshot had and the present lost come back with their original ids, so
   * their old logs reattach.
   */
  const revertTo = useCallback(async (revisionId: string): Promise<{
    restored: number; recreated: number; removed: number; kept: number;
  } | null> => {
    if (!user) return null;
    const revision = revisions.find(r => r.id === revisionId);
    if (!revision) return null;
    const snapshot = revision.snapshot;
    const pathId = revision.path_id;
    const current = steps.filter(s => s.path_id === pathId);
    const loggedStepIds = new Set(logs.map(l => l.step_id));

    await recordRevision(pathId, "before revert", "revert");

    const snapIds = new Set(snapshot.steps.map(s => s.id));
    let restored = 0, recreated = 0, removed = 0, kept = 0;
    const writes: Promise<unknown>[] = [];
    let nextSteps = [...steps];

    for (const snap of snapshot.steps) {
      const live = current.find(s => s.id === snap.id);
      const plan = {
        title: snap.title,
        stage: snap.stage,
        mode: snap.mode,
        reps_target: snap.reps_target,
        xp: snap.xp,
        sort_order: snap.sort_order,
      };
      if (live) {
        restored++;
        nextSteps = nextSteps.map(s => (s.id === snap.id ? { ...s, ...plan } : s));
        writes.push((supabase.from("path_steps" as any) as any).update(plan).eq("id", snap.id));
      } else {
        recreated++;
        const row = { ...plan, id: snap.id, user_id: user.id, path_id: pathId, reps_done: 0, done: false };
        nextSteps.push({ ...row, done_at: null, snoozed_until: null } as unknown as PathStep);
        writes.push((supabase.from("path_steps" as any) as any).insert(row));
      }
    }

    for (const live of current) {
      if (snapIds.has(live.id)) continue;
      if (loggedStepIds.has(live.id) || live.reps_done > 0 || live.done) {
        kept++;
        continue;
      }
      removed++;
      nextSteps = nextSteps.filter(s => s.id !== live.id);
      writes.push((supabase.from("path_steps" as any) as any).delete().eq("id", live.id));
    }

    setPaths(prev => prev.map(p => (p.id === pathId ? { ...p, name: snapshot.name, diagnosis: snapshot.diagnosis } : p)));
    writes.push((supabase.from("paths" as any) as any)
      .update({ name: snapshot.name, diagnosis: snapshot.diagnosis })
      .eq("id", pathId));

    setSteps(nextSteps);
    await Promise.all(writes);
    notifyPathsChanged();
    return { restored, recreated, removed, kept };
  }, [user, revisions, steps, logs, recordRevision]);

  /**
   * COMMIT. The binding constraint, written before the work. Everything the
   * path does downstream is an answer to this line, and it is the line the
   * score question grades - not the completion count.
   */
  const setDiagnosis = useCallback(async (pathId: string, diagnosis: string) => {
    const path = paths.find(p => p.id === pathId);
    if (path?.diagnosis && path.diagnosis !== diagnosis) {
      await recordRevision(pathId, "diagnosis rewritten", "user");
    }
    setPaths(prev => prev.map(p => (p.id === pathId ? { ...p, diagnosis } : p)));
    await (supabase.from("paths" as any) as any).update({ diagnosis }).eq("id", pathId);
    notifyPathsChanged();
  }, [paths, recordRevision]);

  /**
   * SCORE. Asked once, when a path ends. Outcomes are noisy and confounded;
   * whether the constraint you named was the real one is fast, checkable, and
   * the only number here that says anything about your judgement.
   */
  const scoreDiagnosis = useCallback(async (
    pathId: string,
    verdict: DiagnosisVerdict,
    actual?: string,
  ) => {
    const patch = {
      diagnosis_verdict: verdict,
      diagnosis_actual: actual?.trim() || null,
      scored_at: new Date().toISOString(),
    };
    setPaths(prev => prev.map(p => (p.id === pathId ? { ...p, ...patch } : p)));
    await (supabase.from("paths" as any) as any).update(patch).eq("id", pathId);
    notifyPathsChanged();
  }, []);

  /** "Wrong time" - stop asking about this step until the date passes. */
  const snoozeStep = useCallback(async (stepId: string, days: number) => {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const patch = { snoozed_until: todayKey(until) };
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, ...patch } : s)));
    await (supabase.from("path_steps" as any) as any).update(patch).eq("id", stepId);
    notifyPathsChanged();
  }, []);

  /**
   * Bulk plan edit in one shot - what the assistant uses when it rewrites a
   * path mid-conversation. Delegates to the shared rule in `path-writes` so
   * the two callers cannot drift apart, then refetches.
   */
  const revisePath = useCallback(async (
    pathId: string,
    nextPlan: PlanStep[],
    reason: string,
    source: RevisionSource = "assistant",
  ) => {
    if (!user) return;
    await revisePathPlan({ userId: user.id, pathId, reason, source, nextPlan });
    await fetchAll();
    notifyPathsChanged();
  }, [user, fetchAll]);

  // ---- doing the work ----

  /**
   * Log one rep for today. The UNIQUE(step_id, date) index is what keeps a rep
   * honest: you cannot bank twenty reps of a habit in one evening.
   * Returns the XP earned, or 0 if today was already logged.
   */
  const logStep = useCallback(async (stepId: string): Promise<number> => {
    if (!user) return 0;
    const step = steps.find(s => s.id === stepId);
    if (!step || step.done) return 0;
    const date = todayKey();
    if (logs.some(l => l.step_id === stepId && l.date === date)) return 0;

    const { error } = await (supabase.from("path_step_logs" as any) as any).insert({
      user_id: user.id,
      step_id: stepId,
      path_id: step.path_id,
      date,
      xp: step.xp,
    });
    // Unique violation = another tab already logged today. Not worth surfacing.
    if (error) return 0;

    const repsDone = step.reps_done + 1;
    const target = step.mode === "reps" ? Math.max(1, step.reps_target) : 1;
    const done = repsDone >= target;
    const patch = { reps_done: repsDone, done, done_at: done ? new Date().toISOString() : null };

    setLogs(prev => [...prev, { step_id: stepId, path_id: step.path_id, date, xp: step.xp }]);
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, ...patch } : s)));
    await (supabase.from("path_steps" as any) as any).update(patch).eq("id", stepId);
    notifyPathsChanged();
    return step.xp;
  }, [user, steps, logs]);

  /** Undo today's rep (mis-click). Returns the XP that was undone so the caller can subtract it. */
  const undoToday = useCallback(async (stepId: string): Promise<number> => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return 0;
    const date = todayKey();
    const undoneXP = step.xp;
    await (supabase.from("path_step_logs" as never) as any).delete().eq("step_id", stepId).eq("date", date);
    const repsDone = Math.max(0, step.reps_done - 1);
    const patch = { reps_done: repsDone, done: false, done_at: null };
    setLogs(prev => prev.filter(l => !(l.step_id === stepId && l.date === date)));
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, ...patch } : s)));
    await (supabase.from("path_steps" as never) as any).update(patch).eq("id", stepId);
    notifyPathsChanged();
    return undoneXP;
  }, [steps]);

  /** Titles + XP of steps logged today, so Home's daily snapshot stays accurate. */
  const todayLog = useMemo(() => {
    const date = todayKey();
    return logs
      .filter(l => l.date === date)
      .map(l => {
        const step = steps.find(s => s.id === l.step_id);
        const path = paths.find(p => p.id === l.path_id);
        return {
          title: step ? `${path?.name || "Path"}: ${step.title}` : "Path step",
          xp: l.xp,
          categoryId: path?.category_id || null,
        };
      });
  }, [logs, steps, paths]);

  return {
    paths,
    steps,
    logs,
    revisions,
    loading,
    missingTables,
    engineReady,
    todaySteps,
    todayLog,
    stepsByPath,
    revisionsOf,
    refresh: fetchAll,
    createPath,
    updatePath,
    deletePath,
    addStep,
    updateStep,
    deleteStep,
    moveStep,
    logStep,
    undoToday,
    recordRevision,
    revertTo,
    revisePath,
    setDiagnosis,
    scoreDiagnosis,
    snoozeStep,
  };
}
