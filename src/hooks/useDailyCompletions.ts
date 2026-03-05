import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface DailyCompletion {
  date: string;
  missions_completed: number;
  xp_earned: number;
  categories_engaged: string[];
  completed_mission_titles: string[];
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return days;
}

export function useDailyCompletions() {
  const { user } = useAuth();
  const [history, setHistory] = useState<DailyCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      const days = last7Days();
      const { data, error } = await (supabase.from("daily_completions" as any) as any)
        .select("date, missions_completed, xp_earned, categories_engaged, completed_mission_titles")
        .eq("user_id", user.id)
        .gte("date", days[0])
        .lte("date", days[6])
        .order("date", { ascending: true });
      if (data && !error) {
        // Fill in missing days with zeros
        const dataMap = new Map((data as DailyCompletion[]).map(d => [d.date, d]));
        const filled = days.map(day => dataMap.get(day) || {
          date: day,
          missions_completed: 0,
          xp_earned: 0,
          categories_engaged: [],
          completed_mission_titles: [],
        });
        setHistory(filled);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const saveDailySnapshot = useCallback(async (
    missionsCompleted: number,
    xpEarned: number,
    categoriesEngaged: string[],
    completedTitles: string[],
  ) => {
    if (!user) return;
    const date = todayISO();
    await (supabase.from("daily_completions" as any) as any)
      .upsert([{
        user_id: user.id,
        date,
        missions_completed: missionsCompleted,
        xp_earned: xpEarned,
        categories_engaged: categoriesEngaged,
        completed_mission_titles: completedTitles,
      }], { onConflict: "user_id,date" });

    // Update local state
    setHistory(prev => {
      const updated = [...prev];
      const idx = updated.findIndex(d => d.date === date);
      const entry: DailyCompletion = {
        date,
        missions_completed: missionsCompleted,
        xp_earned: xpEarned,
        categories_engaged: categoriesEngaged,
        completed_mission_titles: completedTitles,
      };
      if (idx >= 0) updated[idx] = entry;
      else updated.push(entry);
      return updated;
    });
  }, [user]);

  const fetchAllHistory = useCallback(async (): Promise<DailyCompletion[]> => {
    if (!user) return [];
    const { data, error } = await (supabase.from("daily_completions" as any) as any)
      .select("date, missions_completed, xp_earned, categories_engaged, completed_mission_titles")
      .eq("user_id", user.id)
      .order("date", { ascending: true });
    if (data && !error) return data as DailyCompletion[];
    return [];
  }, [user]);

  return { history, loading, saveDailySnapshot, fetchAllHistory, last7Days };
}
