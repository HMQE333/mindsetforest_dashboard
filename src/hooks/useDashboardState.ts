import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";
import { CATEGORIES, Mission } from "@/lib/dashboard-data";

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
};

export function useDashboardState() {
  const { user } = useAuth();
  const [state, setState] = useState<DashboardState>({ ...defaultState, dayKey: todayISO() });
  const [loading, setLoading] = useState(true);

  // Load from DB
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from("dashboard_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && !error) {
        const today = todayISO();
        const needsReset = data.day_key !== today;

        setState({
          currentXP: data.current_xp,
          currentLevel: data.current_level,
          streakDays: data.streak_days,
          lastCompletionDate: data.last_completion_date,
          dayKey: needsReset ? today : data.day_key,
          missionsCompleted: needsReset ? 0 : data.missions_completed,
          categoriesEngaged: new Set(needsReset ? [] : (data.categories_engaged || [])),
          completedMissions: new Set(needsReset ? [] : (data.completed_missions || [])),
          customMissions: (data.custom_missions as unknown as Record<string, Mission[]>) || {},
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Save to DB
  const persist = useCallback(async (s: DashboardState) => {
    if (!user) return;
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
      // Keep custom missions that are persistent OR match a default mission (by title)
      const newCustomMissions: Record<string, Mission[]> = {};
      for (const [catId, missions] of Object.entries(prev.customMissions)) {
        const defaultCategory = CATEGORIES.find(c => c.id === catId);
        const defaultTitles = new Set((defaultCategory?.missions || []).map(m => m.title));

        const survivingMissions = missions.filter(m =>
          m.persistent || defaultTitles.has(m.title)
        );
        if (survivingMissions.length > 0) {
          newCustomMissions[catId] = survivingMissions;
        }
      }

      const next: DashboardState = {
        ...prev,
        missionsCompleted: 0,
        categoriesEngaged: new Set(),
        completedMissions: new Set(),
        customMissions: newCustomMissions,
        dayKey: todayISO(),
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const saveCustomMissions = useCallback((categoryId: string, missions: Mission[]) => {
    setState(prev => {
      const next: DashboardState = {
        ...prev,
        customMissions: { ...prev.customMissions, [categoryId]: missions },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const getMissions = useCallback((categoryId: string): Mission[] => {
    const custom = state.customMissions[categoryId];
    if (custom && custom.length > 0) return custom;
    return CATEGORIES.find(c => c.id === categoryId)?.missions || [];
  }, [state.customMissions]);

  const getCompletedCount = useCallback((categoryId: string): number => {
    return Array.from(state.completedMissions).filter(id => id.startsWith(categoryId + "-")).length;
  }, [state.completedMissions]);

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
      const next: DashboardState = {
        ...prev,
        customMissions: newCustom,
        completedMissions: newCompleted,
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

  return {
    state,
    loading,
    completeMission,
    resetDay,
    saveCustomMissions,
    splitMission,
    resetCategory,
    spendXP,
    getMissions,
    getCompletedCount,
  };
}
