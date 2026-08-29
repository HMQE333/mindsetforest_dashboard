import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import {
  Path,
  PathStep,
  StepLog,
  StepMode,
  TodayStep,
  DEFAULT_STEP_XP,
  activeStep,
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

/** Migration not applied yet - render a hint instead of crashing. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache/i.test(error.message || "");
}

const LOG_WINDOW_DAYS = 60;

export function usePaths() {
  const { user } = useAuth();
  const [paths, setPaths] = useState<Path[]>([]);
  const [steps, setSteps] = useState<PathStep[]>([]);
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTables, setMissingTables] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const since = new Date();
    since.setDate(since.getDate() - LOG_WINDOW_DAYS);

    const [pathsRes, stepsRes, logsRes] = await Promise.all([
      (supabase.from("paths" as any) as any)
        .select("id,name,category_id,archived,sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true }),
      (supabase.from("path_steps" as any) as any)
        .select("id,path_id,title,stage,mode,reps_target,reps_done,xp,done,done_at,sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true }),
      (supabase.from("path_step_logs" as any) as any)
        .select("step_id,path_id,date,xp")
        .eq("user_id", user.id)
        .gte("date", todayKey(since)),
    ]);

    if (isMissingTable(pathsRes.error)) {
      setMissingTables(true);
      setLoading(false);
      return;
    }
    setMissingTables(false);
    if (pathsRes.data) setPaths(pathsRes.data as Path[]);
    if (stepsRes.data) setSteps(stepsRes.data as PathStep[]);
    if (logsRes.data) setLogs(logsRes.data as StepLog[]);
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
    setPaths(prev => [...prev, data as Path]);
    notifyPathsChanged();
    return data as Path;
  }, [user, paths.length]);

  const updatePath = useCallback(async (id: string, patch: Partial<Pick<Path, "name" | "category_id" | "archived">>) => {
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

  /** Undo today's rep (mis-click). XP already granted stays granted. */
  const undoToday = useCallback(async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    const date = todayKey();
    await (supabase.from("path_step_logs" as any) as any).delete().eq("step_id", stepId).eq("date", date);
    const repsDone = Math.max(0, step.reps_done - 1);
    const patch = { reps_done: repsDone, done: false, done_at: null };
    setLogs(prev => prev.filter(l => !(l.step_id === stepId && l.date === date)));
    setSteps(prev => prev.map(s => (s.id === stepId ? { ...s, ...patch } : s)));
    await (supabase.from("path_steps" as any) as any).update(patch).eq("id", stepId);
    notifyPathsChanged();
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
    loading,
    missingTables,
    todaySteps,
    todayLog,
    stepsByPath,
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
  };
}
