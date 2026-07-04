import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/lib/supabase";
import { CATEGORIES, type Mission, type MissionVariant } from "@/lib/data";
import { useAuth } from "./useAuth";

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

function todayISOFrom(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayISOFrom(dt);
}

export function rollVariant(variants: MissionVariant[]): number {
  if (!variants || variants.length === 0) return 0;
  const total = variants.reduce((s, v) => s + (v.weight > 0 ? v.weight : 0), 0);
  if (total <= 0) return Math.floor(Math.random() * variants.length);
  let r = Math.random() * total;
  for (let i = 0; i < variants.length; i++) {
    r -= variants[i].weight > 0 ? variants[i].weight : 0;
    if (r <= 0) return i;
  }
  return 0;
}

export function isVisibleToday(mission: Mission, today: number = new Date().getDay()): boolean {
  if (!mission.daysOfWeek || mission.daysOfWeek.length === 0 || mission.daysOfWeek.length === 7) return true;
  return mission.daysOfWeek.includes(today);
}

function rollAllVariants(customMissions: Record<string, Mission[]>): Record<string, number> {
  const rolled: Record<string, number> = {};
  for (const cat of CATEGORIES) {
    const missions = customMissions[cat.id] || cat.missions;
    missions.forEach((m, idx) => {
      if (m.variants && m.variants.length > 0) rolled[`${cat.id}-${idx}`] = rollVariant(m.variants);
    });
  }
  for (const [catId, missions] of Object.entries(customMissions)) {
    if (CATEGORIES.find((c) => c.id === catId)) continue;
    missions.forEach((m, idx) => {
      if (m.variants && m.variants.length > 0) rolled[`${catId}-${idx}`] = rollVariant(m.variants);
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
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    if (!user) {
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
        setLoading(false);
        return;
      }
      if (data) {
        const today = todayISO();
        const needsReset = data.day_key !== today;
        const customMissions = (data.custom_missions as unknown as Record<string, Mission[]>) || {};
        const existingRolled = (data as any).rolled_variants || {};
        const rolledVariants = needsReset ? rollAllVariants(customMissions) : existingRolled;
        setState({
          currentXP: data.current_xp,
          currentLevel: data.current_level,
          streakDays: data.streak_days,
          lastCompletionDate: data.last_completion_date,
          dayKey: needsReset ? today : data.day_key,
          missionsCompleted: needsReset ? 0 : data.missions_completed,
          categoriesEngaged: new Set(needsReset ? [] : data.categories_engaged || []),
          completedMissions: new Set(needsReset ? [] : data.completed_missions || []),
          customMissions,
          rolledVariants,
        });
      } else {
        setState({ ...defaultState, dayKey: todayISO() });
      }
      loadedRef.current = true;
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const persist = useCallback(
    async (s: DashboardState) => {
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
        custom_missions: s.customMissions as any,
        rolled_variants: s.rolledVariants as any,
      };
      const { error } = await supabase.from("dashboard_state").upsert([payload], { onConflict: "user_id" });
      if (error) console.error("dashboard persist error:", error.message);
    },
    [user],
  );

  const completeMission = useCallback(
    (categoryId: string, missionIndex: number, xp: number) => {
      setState((prev) => {
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
    },
    [persist],
  );

  const uncompleteMission = useCallback(
    (categoryId: string, missionIndex: number, xp: number) => {
      setState((prev) => {
        const missionId = `${categoryId}-${missionIndex}`;
        if (!prev.completedMissions.has(missionId)) return prev;
        const newXP = Math.max(0, prev.currentXP - xp);
        const newLevel = Math.max(1, Math.floor(newXP / 100) + 1);
        const newCompleted = new Set(prev.completedMissions);
        newCompleted.delete(missionId);
        const next: DashboardState = {
          ...prev,
          currentXP: newXP,
          currentLevel: newLevel,
          missionsCompleted: Math.max(0, prev.missionsCompleted - 1),
          completedMissions: newCompleted,
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const spendXP = useCallback(
    (amount: number) => {
      setState((prev) => {
        if (prev.currentXP < amount) return prev;
        const newXP = prev.currentXP - amount;
        const newLevel = Math.floor(newXP / 100) + 1;
        const next: DashboardState = { ...prev, currentXP: newXP, currentLevel: newLevel };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const getMissions = useCallback(
    (categoryId: string): Mission[] => {
      const custom = state.customMissions[categoryId];
      const base = custom && custom.length > 0 ? custom : CATEGORIES.find((c) => c.id === categoryId)?.missions || [];
      return base
        .map((m, i) => ({ ...m, __originalIndex: i }) as Mission & { __originalIndex: number })
        .filter((m) => isVisibleToday(m));
    },
    [state.customMissions],
  );

  const getCompletedCount = useCallback(
    (categoryId: string): number => {
      const visible = getMissions(categoryId) as (Mission & { __originalIndex: number })[];
      return visible.filter((m) => state.completedMissions.has(`${categoryId}-${m.__originalIndex}`)).length;
    },
    [state.completedMissions, getMissions],
  );

  return {
    state,
    loading,
    completeMission,
    uncompleteMission,
    spendXP,
    getMissions,
    getCompletedCount,
  };
}

type DashboardApi = ReturnType<typeof useDashboardStateValue>;

const DashboardContext = createContext<DashboardApi | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const value = useDashboardStateValue();
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardApi {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within a DashboardProvider");
  return ctx;
}
