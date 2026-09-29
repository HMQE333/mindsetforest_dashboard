import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { todayKey, lastNDays } from "@/lib/today";

export interface DailyCompletion {
  date: string;
  missions_completed: number;
  xp_earned: number;
  categories_engaged: string[];
  completed_mission_titles: string[];
}

/**
 * Every day the user did something on Home (a mission or XP logged). This is
 * the set the streak is computed over. Null when the read failed, so the
 * caller can keep the last persisted streak instead of dropping to 0.
 */
export async function activeDayKeys(userId: string): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("daily_completions")
    .select("date")
    .eq("user_id", userId)
    .or("missions_completed.gt.0,xp_earned.gt.0")
    .order("date", { ascending: false })
    .limit(1000);
  if (error || !data) return null;
  return new Set(data.map(d => d.date));
}

export function useDailyCompletions() {
  const { user } = useAuth();
  const [history, setHistory] = useState<DailyCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      const days = lastNDays(7);
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

  /** `date` is the day the counts belong to (the dashboard state's dayKey); defaults to today. */
  const saveDailySnapshot = useCallback(async (
    missionsCompleted: number,
    xpEarned: number,
    categoriesEngaged: string[],
    completedTitles: string[],
    date: string = todayKey(),
  ) => {
    if (!user) return;
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

  return { history, loading, saveDailySnapshot, fetchAllHistory };
}
