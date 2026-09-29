import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";
import { CATEGORIES, Mission, MissionVariant } from "@/lib/dashboard-data";
import { todayKey, keyToDate, computeStreak } from "@/lib/today";
import { categoryMissions, missionSources, remapCategoryKeys, stripOriginalIndex } from "@/lib/mission-keys";
import { activeDayKeys } from "./useDailyCompletions";

export interface DashboardState {
  currentXP: number;
  currentLevel: number;
  streakDays: number;
  lastCompletionDate: string | null;
  dayKey: string | null;
  missionsCompleted: number;
  categoriesEngaged: Set<string>;
  completedMissions: Set<string>;
  customMissions: Record<string, Mission[]>;
  rolledVariants: Record<string, number>;
}

export function rollVariant(variants: MissionVariant[]): number {
  if (!variants || variants.length === 0) return 0;
  const total = variants.reduce((s, v) => s + (v.weight > 0 ? v.weight : 0), 0);
  if (total <= 0) return Math.floor(Math.random() * variants.length);
  let r = Math.random() * total;
  for (let i = 0; i < variants.length; i++) {
    r -= (variants[i].weight > 0 ? variants[i].weight : 0);
    if (r <= 0) return i;
  }
  return 0;
}

// Weekday of the app's day (04:00 boundary), so Monday's missions stay up until 04:00 Tuesday.
export function isVisibleToday(mission: Mission, today: number = keyToDate(todayKey()).getDay()): boolean {
  if (!mission.daysOfWeek || mission.daysOfWeek.length === 0 || mission.daysOfWeek.length === 7) return true;
  return mission.daysOfWeek.includes(today);
}

function rollAllVariants(
  customMissions: Record<string, Mission[]>,
): Record<string, number> {
  const rolled: Record<string, number> = {};
  // Roll for default categories
  for (const cat of CATEGORIES) {
    const missions = customMissions[cat.id] || cat.missions;
    missions.forEach((m, idx) => {
      if (m.variants && m.variants.length > 0) {
        rolled[`${cat.id}-${idx}`] = rollVariant(m.variants);
      }
    });
  }
  // Roll for custom-only categories
  for (const [catId, missions] of Object.entries(customMissions)) {
    if (CATEGORIES.find(c => c.id === catId)) continue;
    missions.forEach((m, idx) => {
      if (m.variants && m.variants.length > 0) {
        rolled[`${catId}-${idx}`] = rollVariant(m.variants);
      }
    });
  }
  return rolled;
}

/**
 * The per-day counters, cleared once the 04:00 boundary has passed since the
 * state was last touched. Applied on load and before every completion, so a
 * tab left open overnight cannot merge two days.
 */
function rolloverIfNeeded(prev: DashboardState, today: string): DashboardState {
  if (prev.dayKey === today) return prev;
  return {
    ...prev,
    dayKey: today,
    missionsCompleted: 0,
    categoriesEngaged: new Set(),
    completedMissions: new Set(),
    rolledVariants: rollAllVariants(prev.customMissions),
  };
}

const defaultState: DashboardState = {
  currentXP: 0,
  currentLevel: 1,
  streakDays: 0,
  lastCompletionDate: null,
  dayKey: null,
  missionsCompleted: 0,
  categoriesEngaged: new Set(),
  completedMissions: new Set(),
  customMissions: {},
  rolledVariants: {},
};

function useDashboardStateValue() {
  const { user } = useAuth();
  // Keyed on the id: useAuth hands out a new user object on every token refresh
  // and tab focus, which must not reload (and briefly blank) the dashboard.
  const userId = user?.id ?? null;
  const [state, setState] = useState<DashboardState>({ ...defaultState, dayKey: todayKey() });
  const [loading, setLoading] = useState(true);
  // Bumped to read the row again once the app's day has moved on (see below).
  const [reloadNonce, setReloadNonce] = useState(0);
  // Days with a mission or XP logged (from daily_completions), plus today once a
  // completion happens. The streak is computed over this set, never incremented.
  const activeDaysRef = useRef<Set<string>>(new Set());
  // True only once the current user's row has been loaded from the DB. Because
  // this provider now mounts at the app root (before login), we must not persist
  // until the real state is loaded . otherwise a mutation during the load window
  // would upsert the default (currentXP:0, empty missions) row and clobber real data.
  const loadedRef = useRef(false);

  // Save to DB
  const persist = useCallback(async (s: DashboardState) => {
    // Never write before the current user's real state has loaded.
    if (!userId || !loadedRef.current) return;
    const payload = {
      user_id: userId,
      current_xp: s.currentXP,
      current_level: s.currentLevel,
      streak_days: s.streakDays,
      last_completion_date: s.lastCompletionDate,
      day_key: s.dayKey || todayKey(),
      missions_completed: s.missionsCompleted,
      categories_engaged: Array.from(s.categoriesEngaged),
      completed_missions: Array.from(s.completedMissions),
      custom_missions: s.customMissions as unknown as Record<string, never>,
      rolled_variants: s.rolledVariants as unknown as Record<string, never>,
    };

    const { error } = await supabase.from("dashboard_state").upsert([payload], { onConflict: "user_id" });
    if (error) toast({ title: "Save failed", description: "Could not save dashboard state.", variant: "destructive" });
  }, [userId]);

  // Load from DB
  useEffect(() => {
    loadedRef.current = false;
    if (!userId) {
      // Logged out (or not yet logged in): reset to defaults so a previous
      // user's state can never leak or be persisted under a new session.
      setState({ ...defaultState, dayKey: todayKey() });
      activeDaysRef.current = new Set();
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const load = async () => {
      const [{ data, error }, activeDays] = await Promise.all([
        supabase
          .from("dashboard_state")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        activeDayKeys(userId),
      ]);
      if (cancelled) return;
      if (activeDays) activeDaysRef.current = activeDays;

      if (error) {
        // Transient load failure. Do NOT mark loaded . keeping loadedRef false
        // leaves persist() blocked so a subsequent mutation can't overwrite the
        // real (unread) row with default/stale state.
        setLoading(false);
        toast({
          title: "Load failed",
          description: "Could not load your dashboard state. Please refresh.",
          variant: "destructive",
        });
        return;
      }

      let rolledOver: DashboardState | null = null;
      if (data) {
        const today = todayKey();
        const storedMissions = (data.custom_missions as unknown as Record<string, Mission[]>) || {};
        // Older saves could store the runtime `__originalIndex`; a stale one would
        // mislead saveCustomMissions' re-keying, so it is dropped on the way in.
        const customMissions: Record<string, Mission[]> = {};
        for (const [catId, list] of Object.entries(storedMissions)) {
          customMissions[catId] = Array.isArray(list) ? stripOriginalIndex(list) : list;
        }
        const existingRolled = ((data as { rolled_variants?: Record<string, number> }).rolled_variants) || {};

        const loaded: DashboardState = {
          currentXP: data.current_xp,
          currentLevel: data.current_level,
          // Recomputed from history so a run of missed days drops the streak
          // before the next completion. Kept as stored if the history read failed.
          streakDays: activeDays ? computeStreak(activeDays, today) : data.streak_days,
          lastCompletionDate: data.last_completion_date,
          dayKey: data.day_key,
          missionsCompleted: data.missions_completed,
          categoriesEngaged: new Set(data.categories_engaged || []),
          completedMissions: new Set(data.completed_missions || []),
          customMissions,
          rolledVariants: existingRolled,
        };
        const current = rolloverIfNeeded(loaded, today);
        setState(current);
        if (current !== loaded) rolledOver = current;
      } else {
        // No existing row (new user) . start clean rather than inheriting any
        // prior in-memory state.
        setState({ ...defaultState, dayKey: todayKey() });
      }
      loadedRef.current = true;
      setLoading(false);
      // Save the rollover, or every reload until the first completion of the
      // day would roll today's variants again.
      if (rolledOver) void persist(rolledOver);
    };
    load();
    return () => { cancelled = true; };
  }, [userId, persist, reloadNonce]);

  // The load above runs once per user, not on every tab focus, so a tab left
  // open past 04:00 would keep yesterday's ticks and variants. When the tab
  // comes back into view (or, for one that stays open, within a minute) and the
  // app's day has moved on, read the row again: the load rolls it over and
  // saves that, with the streak recomputed. A fresh read rather than rolling the
  // in-memory copy, which is stale if another device wrote since; saving that
  // copy unprompted would overwrite the newer row.
  const dayKeyRef = useRef(state.dayKey);
  useEffect(() => { dayKeyRef.current = state.dayKey; }, [state.dayKey]);
  useEffect(() => {
    if (!userId) return;
    const check = () => {
      if (loadedRef.current && dayKeyRef.current !== todayKey()) setReloadNonce(n => n + 1);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [userId]);

  const completeMission = useCallback((categoryId: string, missionIndex: number, xp: number) => {
    setState(prev => {
      const today = todayKey();
      const base = rolloverIfNeeded(prev, today);
      const missionId = `${categoryId}-${missionIndex}`;
      if (base.completedMissions.has(missionId)) return prev;

      activeDaysRef.current.add(today);
      const streakDays = computeStreak(activeDaysRef.current, today);

      const newXP = base.currentXP + xp;
      const newLevel = Math.floor(newXP / 100) + 1;
      const newCompleted = new Set(base.completedMissions);
      newCompleted.add(missionId);
      const newCategories = new Set(base.categoriesEngaged);
      newCategories.add(categoryId);

      const next: DashboardState = {
        ...base,
        currentXP: newXP,
        currentLevel: newLevel,
        streakDays,
        lastCompletionDate: today,
        missionsCompleted: base.missionsCompleted + 1,
        categoriesEngaged: newCategories,
        completedMissions: newCompleted,
      };

      persist(next);
      return next;
    });
  }, [persist]);

  /** Undo a tick (the assistant's "odznacz"): the XP it gave is taken back. */
  const uncompleteMission = useCallback((categoryId: string, missionIndex: number, xp: number) => {
    setState(prev => {
      const base = rolloverIfNeeded(prev, todayKey());
      const missionId = `${categoryId}-${missionIndex}`;
      if (!base.completedMissions.has(missionId)) return prev;
      const newCompleted = new Set(base.completedMissions);
      newCompleted.delete(missionId);
      const newXP = Math.max(0, base.currentXP - Math.max(0, xp));
      const next: DashboardState = {
        ...base,
        currentXP: newXP,
        currentLevel: Math.floor(newXP / 100) + 1,
        missionsCompleted: Math.max(0, base.missionsCompleted - 1),
        completedMissions: newCompleted,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /**
   * Remove one mission from a list. Completion marks and rolled variants are
   * keyed by position, so the ones after the removed mission shift down with it
   * instead of landing on the wrong mission. XP already earned stays.
   */
  const removeMission = useCallback((categoryId: string, missionIndex: number) => {
    setState(prev => {
      const custom = prev.customMissions[categoryId];
      const list = custom && custom.length > 0 ? custom : (CATEGORIES.find(c => c.id === categoryId)?.missions || []);
      if (missionIndex < 0 || missionIndex >= list.length) return prev;
      const prefix = `${categoryId}-`;
      const shift = (key: string): string | null => {
        if (!key.startsWith(prefix)) return key;
        const n = Number(key.slice(prefix.length));
        if (!Number.isInteger(n)) return key;
        if (n === missionIndex) return null;
        return `${prefix}${n > missionIndex ? n - 1 : n}`;
      };
      const completed = new Set<string>();
      for (const id of prev.completedMissions) {
        const k = shift(id);
        if (k) completed.add(k);
      }
      const rolled: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev.rolledVariants)) {
        const nk = shift(k);
        if (nk) rolled[nk] = v;
      }
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: list.filter((_, i) => i !== missionIndex) },
        completedMissions: completed,
        rolledVariants: rolled,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetDay = useCallback(() => {
    setState(prev => {
      const newCustomMissions: Record<string, Mission[]> = {};
      for (const [catId, missions] of Object.entries(prev.customMissions)) {
        const persistentMissions = missions.filter(m => m.persistent);
        if (persistentMissions.length > 0) {
          newCustomMissions[catId] = persistentMissions;
        }
      }

      const next: DashboardState = {
        ...prev,
        missionsCompleted: 0,
        categoriesEngaged: new Set(),
        completedMissions: new Set(),
        customMissions: newCustomMissions,
        dayKey: todayKey(),
        rolledVariants: rollAllVariants(newCustomMissions),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /**
   * Replace one category's list (the edit modal, AI suggestions, the assistant).
   * Ticks and rolled variants are keyed by position, so they move with their
   * missions - matched by the `__originalIndex` an editor carried through, else
   * by title - instead of staying on the old position, where a tick could be
   * earned a second time or land on a neighbour.
   */
  const saveCustomMissions = useCallback((categoryId: string, missions: Mission[]) => {
    setState(prev => {
      const list = stripOriginalIndex(missions);
      // An empty list shows the defaults, so that is what the keys will index.
      const shown = categoryMissions({ [categoryId]: list }, categoryId);
      const sources = missionSources(categoryMissions(prev.customMissions, categoryId), list.length > 0 ? missions : shown);
      const { completed, rolled } = remapCategoryKeys(categoryId, sources, shown, prev.completedMissions, prev.rolledVariants, rollVariant);
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: list },
        completedMissions: completed,
        rolledVariants: rolled,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /**
   * Replace every mission list on Home with a preset. XP and today's mission
   * counter stay; the per-mission checkmarks are cleared because missions are
   * identified by their position in the list and the lists just changed.
   */
  const applyMissionPreset = useCallback((missions: Record<string, Mission[]>) => {
    setState(prev => {
      const next: DashboardState = {
        ...prev,
        customMissions: missions,
        completedMissions: new Set(),
        rolledVariants: rollAllVariants(missions),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const addMission = useCallback((categoryId: string, mission: Mission) => {
    setState(prev => {
      const current = prev.customMissions[categoryId]
        || CATEGORIES.find(c => c.id === categoryId)?.missions
        || [];
      // Skip duplicates by title (case-insensitive)
      const titleLc = (mission.title || "").trim().toLowerCase();
      if (titleLc && current.some(m => (m.title || "").trim().toLowerCase() === titleLc)) {
        return prev;
      }
      const newMissions = [...current, mission];
      const newRolled = { ...prev.rolledVariants };
      if (mission.variants && mission.variants.length > 0) {
        newRolled[`${categoryId}-${newMissions.length - 1}`] = rollVariant(mission.variants);
      }
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: newMissions },
        rolledVariants: newRolled,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const rerollMission = useCallback((categoryId: string, missionIndex: number) => {
    setState(prev => {
      const missions = prev.customMissions[categoryId]
        || CATEGORIES.find(c => c.id === categoryId)?.missions
        || [];
      const m = missions[missionIndex];
      if (!m?.variants || m.variants.length === 0) return prev;
      const key = `${categoryId}-${missionIndex}`;
      const current = prev.rolledVariants[key] ?? 0;
      let next = rollVariant(m.variants);
      // try to avoid same roll if possible
      if (m.variants.length > 1 && next === current) {
        next = rollVariant(m.variants);
      }
      const newRolled = { ...prev.rolledVariants, [key]: next };
      const nextState = { ...prev, rolledVariants: newRolled };
      persist(nextState);
      return nextState;
    });
  }, [persist]);

  const getMissions = useCallback((categoryId: string): Mission[] => {
    // Tag with original index so callers can preserve completion IDs across filtered views
    return categoryMissions(state.customMissions, categoryId)
      .map((m, i) => ({ ...m, __originalIndex: i } as Mission & { __originalIndex: number }))
      .filter(m => isVisibleToday(m));
  }, [state.customMissions]);

  const getCompletedCount = useCallback((categoryId: string): number => {
    const visible = getMissions(categoryId) as (Mission & { __originalIndex: number })[];
    return visible.filter(m => state.completedMissions.has(`${categoryId}-${m.__originalIndex}`)).length;
  }, [state.completedMissions, getMissions]);

  const splitMission = useCallback((categoryId: string, missionIndex: number, subTasks: Mission[]) => {
    setState(prev => {
      const currentMissions = categoryMissions(prev.customMissions, categoryId);
      if (missionIndex < 0 || missionIndex >= currentMissions.length) return prev;
      const newMissions = [...currentMissions];
      newMissions.splice(missionIndex, 1, ...subTasks);
      // The missions after the split one move by (subTasks - 1); their ticks and
      // rolled variants move with them. The subtasks start unticked.
      const sources = newMissions.map((_, j) =>
        j < missionIndex ? j : j < missionIndex + subTasks.length ? null : j - subTasks.length + 1,
      );
      const { completed, rolled } = remapCategoryKeys(categoryId, sources, newMissions, prev.completedMissions, prev.rolledVariants, rollVariant);
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: newMissions },
        completedMissions: completed,
        rolledVariants: rolled,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const resetCategory = useCallback((categoryId: string) => {
    setState(prev => {
      const newCustom = { ...prev.customMissions };
      delete newCustom[categoryId];
      // Also clear completed missions for this category since indices changed
      const newCompleted = new Set(
        Array.from(prev.completedMissions).filter(id => !id.startsWith(categoryId + "-"))
      );
      const newRolled = { ...prev.rolledVariants };
      Object.keys(newRolled).forEach(k => {
        if (k.startsWith(categoryId + "-")) delete newRolled[k];
      });
      // re-roll defaults for this category
      const defaults = CATEGORIES.find(c => c.id === categoryId)?.missions || [];
      defaults.forEach((m, idx) => {
        if (m.variants && m.variants.length > 0) {
          newRolled[`${categoryId}-${idx}`] = rollVariant(m.variants);
        }
      });
      const next: DashboardState = {
        ...prev,
        customMissions: newCustom,
        completedMissions: newCompleted,
        rolledVariants: newRolled,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const spendXP = useCallback((amount: number) => {
    setState(prev => {
      if (prev.currentXP < amount) return prev;
      const newXP = prev.currentXP - amount;
      const newLevel = Math.floor(newXP / 100) + 1;
      const next: DashboardState = {
        ...prev,
        currentXP: newXP,
        currentLevel: newLevel,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  /**
   * A completion that isn't a mission (currently: a Path step). Same XP, streak
   * and category-engagement effects as completing a mission, but no mission id -
   * de-duplication happens at the source (path_step_logs is unique per day).
   */
  const completeExternal = useCallback((categoryId: string | null, xp: number) => {
    setState(prev => {
      const today = todayKey();
      const base = rolloverIfNeeded(prev, today);

      activeDaysRef.current.add(today);
      const streakDays = computeStreak(activeDaysRef.current, today);

      const newXP = base.currentXP + xp;
      const newCategories = new Set(base.categoriesEngaged);
      if (categoryId) newCategories.add(categoryId);

      const next: DashboardState = {
        ...base,
        currentXP: newXP,
        currentLevel: Math.floor(newXP / 100) + 1,
        streakDays,
        lastCompletionDate: today,
        missionsCompleted: base.missionsCompleted + 1,
        categoriesEngaged: newCategories,
      };

      persist(next);
      return next;
    });
  }, [persist]);

  /**
   * Reverses a completeExternal (a Path step undone). The XP and the day's
   * mission count come back; the streak is left alone - it is recomputed from
   * history on the next load. `categoryId` is accepted for symmetry with
   * completeExternal; engagement is not reversed because other completions
   * may have touched the same category.
   */
  const undoExternal = useCallback((_categoryId: string | null, xp: number) => {
    setState(prev => {
      const newXP = Math.max(0, prev.currentXP - xp);
      const next: DashboardState = {
        ...prev,
        currentXP: newXP,
        currentLevel: Math.max(1, Math.floor(newXP / 100) + 1),
        missionsCompleted: Math.max(0, prev.missionsCompleted - 1),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const addXP = useCallback((amount: number) => {
    if (!amount) return;
    setState(prev => {
      const newXP = Math.max(0, prev.currentXP + amount);
      const newLevel = Math.max(1, Math.floor(newXP / 100) + 1);
      const next: DashboardState = {
        ...prev,
        currentXP: newXP,
        currentLevel: newLevel,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  return {
    state,
    loading,
    completeMission,
    uncompleteMission,
    removeMission,
    resetDay,
    saveCustomMissions,
    applyMissionPreset,
    addMission,
    splitMission,
    resetCategory,
    spendXP,
    addXP,
    completeExternal,
    undoExternal,
    rerollMission,
    getMissions,
    getCompletedCount,
  };
}

type DashboardStateApi = ReturnType<typeof useDashboardStateValue>;

const DashboardStateContext = createContext<DashboardStateApi | null>(null);

// Single shared instance for the whole app. Without this, each component that
// called useDashboardState() (DashboardView, OracleView, useTrackerXp) got its
// own state loaded from the DB and its own persist() that upserts the ENTIRE
// dashboard_state row . so awarding tracker/achievement XP through a stale (or
// still-default) copy would overwrite the real XP and wipe mission progress.
export function DashboardStateProvider({ children }: { children: ReactNode }) {
  const value = useDashboardStateValue();
  return createElement(DashboardStateContext.Provider, { value }, children);
}

export function useDashboardState(): DashboardStateApi {
  const ctx = useContext(DashboardStateContext);
  if (!ctx) {
    throw new Error("useDashboardState must be used within a DashboardStateProvider");
  }
  return ctx;
}
