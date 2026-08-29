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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayISOFrom(dt);
}

function todayISOFrom(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

export function isVisibleToday(mission: Mission, today: number = new Date().getDay()): boolean {
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

const defaultState: DashboardState = {
  currentXP: 0,
  currentLevel: 1,
  streakDays: 1,
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
  const [state, setState] = useState<DashboardState>({ ...defaultState, dayKey: todayISO() });
  const [loading, setLoading] = useState(true);
  // True only once the current user's row has been loaded from the DB. Because
  // this provider now mounts at the app root (before login), we must not persist
  // until the real state is loaded . otherwise a mutation during the load window
  // would upsert the default (currentXP:0, empty missions) row and clobber real data.
  const loadedRef = useRef(false);

  // Load from DB
  useEffect(() => {
    loadedRef.current = false;
    if (!user) {
      // Logged out (or not yet logged in): reset to defaults so a previous
      // user's state can never leak or be persisted under a new session.
      setState({ ...defaultState, dayKey: todayISO() });
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("dashboard_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

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

      if (data) {
        const today = todayISO();
        const needsReset = data.day_key !== today;
        const customMissions = (data.custom_missions as unknown as Record<string, Mission[]>) || {};
        const existingRolled = ((data as { rolled_variants?: Record<string, number> }).rolled_variants) || {};
        const rolledVariants = needsReset ? rollAllVariants(customMissions) : existingRolled;

        setState({
          currentXP: data.current_xp,
          currentLevel: data.current_level,
          streakDays: data.streak_days,
          lastCompletionDate: data.last_completion_date,
          dayKey: needsReset ? today : data.day_key,
          missionsCompleted: needsReset ? 0 : data.missions_completed,
          categoriesEngaged: new Set(needsReset ? [] : (data.categories_engaged || [])),
          completedMissions: new Set(needsReset ? [] : (data.completed_missions || [])),
          customMissions,
          rolledVariants,
        });
      } else {
        // No existing row (new user) . start clean rather than inheriting any
        // prior in-memory state.
        setState({ ...defaultState, dayKey: todayISO() });
      }
      loadedRef.current = true;
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  // Save to DB
  const persist = useCallback(async (s: DashboardState) => {
    // Never write before the current user's real state has loaded.
    if (!user || !loadedRef.current) return;
    const payload = {
      user_id: user.id,
      current_xp: s.currentXP,
      current_level: s.currentLevel,
      streak_days: s.streakDays,
      last_completion_date: s.lastCompletionDate,
      day_key: s.dayKey || todayISO(),
      missions_completed: s.missionsCompleted,
      categories_engaged: Array.from(s.categoriesEngaged),
      completed_missions: Array.from(s.completedMissions),
      custom_missions: s.customMissions as unknown as Record<string, never>,
      rolled_variants: s.rolledVariants as unknown as Record<string, never>,
    };

    const { error } = await supabase.from("dashboard_state").upsert([payload], { onConflict: "user_id" });
    if (error) toast({ title: "Save failed", description: "Could not save dashboard state.", variant: "destructive" });
  }, [user]);

  const completeMission = useCallback((categoryId: string, missionIndex: number, xp: number) => {
    setState(prev => {
      const missionId = `${categoryId}-${missionIndex}`;
      if (prev.completedMissions.has(missionId)) return prev;

      const today = todayISO();
      let streakDays = prev.streakDays;
      if (prev.lastCompletionDate) {
        if (prev.lastCompletionDate !== today) {
          streakDays = prev.lastCompletionDate === yesterdayISO(today) ? streakDays + 1 : 1;
        }
      } else {
        streakDays = 1;
      }

      const newXP = prev.currentXP + xp;
      const newLevel = Math.floor(newXP / 100) + 1;
      const newCompleted = new Set(prev.completedMissions);
      newCompleted.add(missionId);
      const newCategories = new Set(prev.categoriesEngaged);
      newCategories.add(categoryId);

      const next: DashboardState = {
        ...prev,
        currentXP: newXP,
        currentLevel: newLevel,
        streakDays,
        lastCompletionDate: today,
        dayKey: today,
        missionsCompleted: prev.missionsCompleted + 1,
        categoriesEngaged: newCategories,
        completedMissions: newCompleted,
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
        dayKey: todayISO(),
        rolledVariants: rollAllVariants(newCustomMissions),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const saveCustomMissions = useCallback((categoryId: string, missions: Mission[]) => {
    setState(prev => {
      // Re-roll any variants for this category
      const newRolled = { ...prev.rolledVariants };
      // Clear old rolls for this category
      Object.keys(newRolled).forEach(k => {
        if (k.startsWith(categoryId + "-")) delete newRolled[k];
      });
      missions.forEach((m, idx) => {
        if (m.variants && m.variants.length > 0) {
          newRolled[`${categoryId}-${idx}`] = rollVariant(m.variants);
        }
      });
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: missions },
        rolledVariants: newRolled,
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
    const custom = state.customMissions[categoryId];
    const base = (custom && custom.length > 0)
      ? custom
      : (CATEGORIES.find(c => c.id === categoryId)?.missions || []);
    // Tag with original index so callers can preserve completion IDs across filtered views
    return base
      .map((m, i) => ({ ...m, __originalIndex: i } as Mission & { __originalIndex: number }))
      .filter(m => isVisibleToday(m));
  }, [state.customMissions]);

  const getCompletedCount = useCallback((categoryId: string): number => {
    const visible = getMissions(categoryId) as (Mission & { __originalIndex: number })[];
    return visible.filter(m => state.completedMissions.has(`${categoryId}-${m.__originalIndex}`)).length;
  }, [state.completedMissions, getMissions]);

  const splitMission = useCallback((categoryId: string, missionIndex: number, subTasks: Mission[]) => {
    setState(prev => {
      const currentMissions = prev.customMissions[categoryId]
        || CATEGORIES.find(c => c.id === categoryId)?.missions
        || [];
      const newMissions = [...currentMissions];
      newMissions.splice(missionIndex, 1, ...subTasks);
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: newMissions },
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
      const today = todayISO();
      let streakDays = prev.streakDays;
      if (prev.lastCompletionDate) {
        if (prev.lastCompletionDate !== today) {
          streakDays = prev.lastCompletionDate === yesterdayISO(today) ? streakDays + 1 : 1;
        }
      } else {
        streakDays = 1;
      }

      const newXP = prev.currentXP + xp;
      const newCategories = new Set(prev.categoriesEngaged);
      if (categoryId) newCategories.add(categoryId);

      const next: DashboardState = {
        ...prev,
        currentXP: newXP,
        currentLevel: Math.floor(newXP / 100) + 1,
        streakDays,
        lastCompletionDate: today,
        dayKey: today,
        missionsCompleted: prev.missionsCompleted + 1,
        categoriesEngaged: newCategories,
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
    resetDay,
    saveCustomMissions,
    addMission,
    splitMission,
    resetCategory,
    spendXP,
    addXP,
    completeExternal,
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
