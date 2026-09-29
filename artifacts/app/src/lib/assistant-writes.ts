import { supabase } from "@/integrations/supabase/client";
import { TRACKER_METRICS, type TrackerMetric } from "@/lib/tracker-data";
import { computeEntryXp, mergeConfig, type TrackerXpConfig } from "@/lib/tracker-xp";
import { activeStep, DEFAULT_STEP_XP, type PathStep } from "@/lib/path-data";
import { findPathByName } from "@/lib/path-writes";
import { notifyPathsChanged } from "@/hooks/usePaths";
import { PLANNING_TASKS_CHANGED_EVENT } from "@/hooks/usePlanningState";
import {
  CALENDAR_EVENTS_CHANGED_EVENT,
  FINANCE_CHANGED_EVENT,
  TRACKER_ENTRIES_CHANGED_EVENT,
  USER_SETTINGS_CHANGED_EVENT,
  emitAppEvent,
} from "@/lib/app-events";
import { MISSION_PRESETS_CHANGED_EVENT, normalizePresetName, parseMissionMap, snapshotMissions, type MissionMap } from "@/lib/mission-presets";
import { todayKey } from "@/lib/today";

/**
 * Writes the assistant performs outside the Home state provider. Each one goes
 * to the same tables with the same rules as the matching button in the app,
 * then fires the event that page-scoped hooks listen to, so an open page
 * updates without a reload. XP is returned, never added here: the caller owns
 * the dashboard state and adds it through the same path as a click would.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type WriteResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Exact (normalised) name first, then a unique containment either way. */
export function matchByName<T>(items: T[], wanted: string, nameOf: (t: T) => string): T | null {
  const w = norm(wanted);
  if (!w) return null;
  const exact = items.find((i) => norm(nameOf(i)) === w);
  if (exact) return exact;
  const partial = items.filter((i) => {
    const n = norm(nameOf(i));
    return n.length > 0 && (n.includes(w) || w.includes(n));
  });
  return partial.length === 1 ? partial[0] : null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** The user's metrics (custom ones when set, the built-in list otherwise). */
export async function loadMetrics(userId: string): Promise<TrackerMetric[]> {
  const { data } = await supabase
    .from("user_metrics")
    .select("id,label,unit,icon,category_id,color_var,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (!data || data.length === 0) return TRACKER_METRICS;
  return data.map((m) => ({
    id: m.id,
    label: m.label,
    unit: m.unit,
    icon: m.icon,
    categoryId: m.category_id,
    categoryName: m.category_id,
    categoryIcon: "📊",
    colorVar: m.color_var,
  })) as TrackerMetric[];
}

/**
 * Log a value for a metric today and award Stats XP with the user's own rules
 * (same per-entry formula as the Stats page, no daily cap).
 */
export async function logMetricEntry(
  userId: string,
  metricRef: string,
  value: number,
): Promise<WriteResult<{ metric: TrackerMetric; xp: number }>> {
  const metrics = await loadMetrics(userId);
  const metric = metrics.find((m) => m.id === metricRef) ?? matchByName(metrics, metricRef, (m) => m.label);
  if (!metric) return { ok: false, error: `Nie znaleziono metryki „${metricRef}”` };

  const date = todayKey();
  const { error } = await supabase.from("tracker_entries").insert({ user_id: userId, metric_id: metric.id, value, date });
  if (error) return { ok: false, error: "Nie udało się zapisać wpisu" };

  const { data: onb } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
  const raw = ((onb?.preferences as Record<string, unknown> | null)?.trackerXp ?? null) as Partial<TrackerXpConfig> | null;
  const config = mergeConfig(raw, metrics);
  const xp = computeEntryXp(metric, value, config);
  if (xp > 0) {
    await supabase.from("tracker_xp_grants").insert({ user_id: userId, source: "entry", ref_id: metric.id, xp, date });
  }
  emitAppEvent(TRACKER_ENTRIES_CHANGED_EVENT);
  return { ok: true, metric, xp };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Log today's rep of the active step of a path, like the Home strip button. */
export async function logPathStepToday(
  userId: string,
  pathName: string,
): Promise<WriteResult<{ pathName: string; stepTitle: string; xp: number; categoryId: string | null; finished: boolean }>> {
  const target = await findPathByName(userId, pathName);
  if (!target) return { ok: false, error: `Nie znaleziono ścieżki „${pathName}”` };

  const [{ data: path }, { data: stepRows }] = await Promise.all([
    supabase.from("paths").select("*").eq("id", target.id).maybeSingle(),
    supabase.from("path_steps").select("*").eq("path_id", target.id),
  ]);
  const step = activeStep((stepRows as unknown as PathStep[]) || []);
  if (!step) return { ok: false, error: `Ścieżka „${target.name}” nie ma aktywnego kroku` };

  const date = todayKey();
  const { error } = await supabase
    .from("path_step_logs")
    .insert({ user_id: userId, step_id: step.id, path_id: target.id, date, xp: step.xp });
  // Unique (step_id, date): already logged today.
  if (error) return { ok: false, error: `„${step.title}” jest już zalogowane na dziś` };

  const repsDone = step.reps_done + 1;
  const targetReps = step.mode === "reps" ? Math.max(1, step.reps_target) : 1;
  const finished = repsDone >= targetReps;
  await supabase
    .from("path_steps")
    .update({ reps_done: repsDone, done: finished, done_at: finished ? new Date().toISOString() : null })
    .eq("id", step.id);
  notifyPathsChanged();
  return {
    ok: true,
    pathName: target.name,
    stepTitle: step.title,
    xp: step.xp,
    categoryId: (path as { category_id?: string | null } | null)?.category_id ?? null,
    finished,
  };
}

export interface NewPathStep {
  title: string;
  stage?: string | null;
  days?: number;
  xp?: number;
}

export async function createPath(
  userId: string,
  input: { name: string; diagnosis?: string; categoryId?: string | null; steps: NewPathStep[] },
): Promise<WriteResult<{ id: string }>> {
  const { count } = await supabase.from("paths").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const { data, error } = await supabase
    .from("paths")
    .insert({
      user_id: userId,
      name: input.name,
      category_id: input.categoryId ?? null,
      sort_order: count ?? 0,
      ...(input.diagnosis ? { diagnosis: input.diagnosis } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Nie udało się utworzyć ścieżki" };
  if (input.steps.length > 0) {
    const rows = input.steps.map((s, i) => {
      const reps = Math.max(1, Math.round(s.days || 1));
      return {
        user_id: userId,
        path_id: data.id,
        title: s.title,
        stage: s.stage ?? null,
        mode: reps > 1 ? "reps" : "once",
        reps_target: reps,
        xp: s.xp ?? DEFAULT_STEP_XP,
        sort_order: i,
      };
    });
    await supabase.from("path_steps").insert(rows);
  }
  notifyPathsChanged();
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export async function completePlanningTask(userId: string, title: string): Promise<WriteResult<{ title: string }>> {
  const { data } = await supabase
    .from("planning_tasks")
    .select("id,title,done")
    .eq("user_id", userId)
    .eq("done", false)
    .limit(500);
  const task = matchByName(data || [], title, (t) => t.title);
  if (!task) return { ok: false, error: `Nie znaleziono otwartego zadania „${title}”` };
  const { error } = await supabase.from("planning_tasks").update({ done: true }).eq("id", task.id).eq("user_id", userId);
  if (error) return { ok: false, error: "Nie udało się oznaczyć zadania" };
  emitAppEvent(PLANNING_TASKS_CHANGED_EVENT);
  return { ok: true, title: task.title };
}

// ---------------------------------------------------------------------------
// Calendar & finance
// ---------------------------------------------------------------------------

export async function addCalendarEvent(
  userId: string,
  input: { title: string; date: string; time?: string; notes?: string },
): Promise<WriteResult> {
  const title = input.time ? `${input.time} ${input.title}` : input.title;
  const { error } = await supabase
    .from("calendar_events")
    .insert({ user_id: userId, title, date: input.date, notes: input.notes || "" });
  if (error) return { ok: false, error: "Nie udało się dodać wydarzenia" };
  emitAppEvent(CALENDAR_EVENTS_CHANGED_EVENT);
  return { ok: true };
}

export async function addFinanceTransaction(
  userId: string,
  input: { type: "expense" | "income"; amount: number; title: string; category?: string; date?: string },
): Promise<WriteResult<{ category: string }>> {
  const { data: cats } = await supabase.from("finance_categories").select("name,kind").eq("user_id", userId);
  const list = cats || [];
  const ofKind = list.filter((c) => !c.kind || c.kind === input.type || c.kind === "both");
  const picked =
    (input.category ? matchByName(ofKind.length ? ofKind : list, input.category, (c) => c.name)?.name : null) ??
    input.category?.trim() ??
    (input.type === "income" ? "Income" : "Other");
  const { error } = await supabase.from("finance_transactions").insert({
    user_id: userId,
    type: input.type,
    amount: input.amount,
    title: input.title,
    category: picked,
    date: input.date || todayKey(),
  });
  if (error) return { ok: false, error: "Nie udało się dodać transakcji" };
  emitAppEvent(FINANCE_CHANGED_EVENT);
  return { ok: true, category: picked };
}

// ---------------------------------------------------------------------------
// Mission presets
// ---------------------------------------------------------------------------

/**
 * Save a new mission set (written by the assistant) as a preset. An existing
 * preset of that name is overwritten. `applied` stamps last_applied_at so the
 * picker shows it as active when the caller also loads it onto Home.
 */
export async function createPresetFromMissions(
  userId: string,
  input: { name: string; emoji?: string; description?: string },
  missions: MissionMap,
  applied: boolean,
): Promise<WriteResult<{ name: string; updated: boolean }>> {
  const name = normalizePresetName(input.name);
  if (!name) return { ok: false, error: "Podaj nazwę presetu" };
  const clean = parseMissionMap(missions) as unknown as never;
  const stamp = applied ? { last_applied_at: new Date().toISOString() } : {};
  const { data: existing } = await supabase.from("mission_presets").select("id").eq("user_id", userId).eq("name", name).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("mission_presets")
      .update({
        missions: clean,
        updated_at: new Date().toISOString(),
        ...(input.emoji ? { emoji: input.emoji } : {}),
        ...(input.description ? { description: input.description.slice(0, 200) } : {}),
        ...stamp,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  } else {
    const { count } = await supabase.from("mission_presets").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const { error } = await supabase.from("mission_presets").insert({
      user_id: userId,
      name,
      emoji: input.emoji || "⚡",
      description: (input.description || "").slice(0, 200),
      missions: clean,
      sort_order: count ?? 0,
      ...stamp,
    });
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  }
  emitAppEvent(MISSION_PRESETS_CHANGED_EVENT);
  return { ok: true, name, updated: !!existing };
}

/** Save the current Home missions as a preset; an existing preset of that name is overwritten. */
export async function saveCurrentAsPreset(
  userId: string,
  input: { name: string; emoji?: string; description?: string },
  customMissions: MissionMap,
): Promise<WriteResult<{ name: string; updated: boolean }>> {
  const name = normalizePresetName(input.name);
  if (!name) return { ok: false, error: "Podaj nazwę presetu" };
  const missions = snapshotMissions(customMissions) as unknown as never;
  const { data: existing } = await supabase.from("mission_presets").select("id").eq("user_id", userId).eq("name", name).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("mission_presets")
      .update({ missions, updated_at: new Date().toISOString(), ...(input.emoji ? { emoji: input.emoji } : {}) })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  } else {
    const { count } = await supabase.from("mission_presets").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const { error } = await supabase.from("mission_presets").insert({
      user_id: userId,
      name,
      emoji: input.emoji || "⚡",
      description: (input.description || "").slice(0, 200),
      missions,
      sort_order: count ?? 0,
    });
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  }
  emitAppEvent(MISSION_PRESETS_CHANGED_EVENT);
  return { ok: true, name, updated: !!existing };
}

// ---------------------------------------------------------------------------
// Preferences (theme, modules)
// ---------------------------------------------------------------------------

/** Merge keys into user_onboarding.preferences without clobbering the rest. */
export async function patchPreferences(userId: string, patch: Record<string, unknown>): Promise<WriteResult> {
  const { data, error: readErr } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
  if (readErr) return { ok: false, error: "Nie udało się odczytać ustawień" };
  const existing = (data?.preferences as Record<string, unknown>) || {};
  const merged = { ...existing, ...patch };
  const { error } = await supabase.from("user_onboarding").update({ preferences: merged as never }).eq("user_id", userId);
  if (error) return { ok: false, error: "Nie udało się zapisać ustawień" };
  emitAppEvent(USER_SETTINGS_CHANGED_EVENT);
  return { ok: true };
}

export async function setModuleEnabled(userId: string, module: string, enabled: boolean): Promise<WriteResult> {
  const { data } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
  const prefs = (data?.preferences as { enabledModules?: string[] } | null) || {};
  const current = Array.isArray(prefs.enabledModules) ? prefs.enabledModules : [];
  const next = enabled ? Array.from(new Set([...current, module])) : current.filter((m) => m !== module);
  return patchPreferences(userId, { enabledModules: next.includes("dashboard") ? next : ["dashboard", ...next] });
}
