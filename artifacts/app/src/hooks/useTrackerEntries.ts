import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { todayKey, lastNDays, computeStreak } from "@/lib/today";
import { TRACKER_ENTRIES_CHANGED_EVENT, onAppEvent } from "@/lib/app-events";

export interface TrackerEntry {
  id: string;
  metricId: string;
  value: number;
  date: string;
  createdAt: string;
}

export function useTrackerEntries() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!user) { setEntries([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("tracker_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setEntries(
        data.map((d) => ({
          id: d.id,
          metricId: d.metric_id,
          value: d.value,
          date: d.date,
          createdAt: d.created_at,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  /** Returns whether the entry was saved, so callers only reward what exists. */
  const addEntry = useCallback(async (metricId: string, value: number): Promise<boolean> => {
    if (!user) return false;
    const date = todayKey();

    const { data, error } = await supabase
      .from("tracker_entries")
      .insert({ user_id: user.id, metric_id: metricId, value, date })
      .select()
      .single();

    if (error || !data) return false;
    setEntries((prev) => [
      {
        id: data.id,
        metricId: data.metric_id,
        value: data.value,
        date: data.date,
        createdAt: data.created_at,
      },
      ...prev,
    ]);
    return true;
  }, [user]);

  useEffect(() => onAppEvent(TRACKER_ENTRIES_CHANGED_EVENT, () => { void fetchEntries(); }), [fetchEntries]);

  return { entries, loading, addEntry, refetch: fetchEntries };
}

// Helper functions that work on TrackerEntry[]
export function getTodayTotal(entries: TrackerEntry[], metricId: string): number {
  const today = todayKey();
  return entries.filter((e) => e.metricId === metricId && e.date === today).reduce((s, e) => s + e.value, 0);
}

export function getLast7DaysTotal(entries: TrackerEntry[], metricId: string): number {
  const week = new Set(lastNDays(7));
  return entries.filter((e) => e.metricId === metricId && week.has(e.date)).reduce((s, e) => s + e.value, 0);
}

export function getAllTimeTotal(entries: TrackerEntry[], metricId: string): number {
  return entries.filter((e) => e.metricId === metricId).reduce((s, e) => s + e.value, 0);
}

export function getStreakDays(entries: TrackerEntry[]): number {
  return computeStreak(entries.map((e) => e.date));
}

export function getMonthTotal(entries: TrackerEntry[], metricId: string, year: number, month: number): number {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return entries.filter((e) => e.metricId === metricId && e.date.startsWith(prefix)).reduce((s, e) => s + e.value, 0);
}

export function getYearTotal(entries: TrackerEntry[], metricId: string, year: number): number {
  const prefix = `${year}-`;
  return entries.filter((e) => e.metricId === metricId && e.date.startsWith(prefix)).reduce((s, e) => s + e.value, 0);
}

export function getDailyAverage(entries: TrackerEntry[], metricId: string): number {
  const filtered = entries.filter((e) => e.metricId === metricId);
  if (filtered.length === 0) return 0;
  const uniqueDays = new Set(filtered.map((e) => e.date)).size;
  const total = filtered.reduce((s, e) => s + e.value, 0);
  return Math.round((total / uniqueDays) * 10) / 10;
}

export function getHabitScore(entries: TrackerEntry[], metricId: string): { score: number; trend: "above" | "below" | "average" } {
  const filtered = entries.filter((e) => e.metricId === metricId);
  if (filtered.length === 0) return { score: 0, trend: "average" };

  // Get daily totals
  const dailyMap: Record<string, number> = {};
  filtered.forEach((e) => { dailyMap[e.date] = (dailyMap[e.date] || 0) + e.value; });
  const dailyValues = Object.values(dailyMap);
  const avg = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;

  // Last 7 days consistency
  let activeDays = 0;
  let recentTotal = 0;
  for (const dateStr of lastNDays(7)) {
    if (dailyMap[dateStr]) {
      activeDays++;
      recentTotal += dailyMap[dateStr];
    }
  }

  const consistencyScore = (activeDays / 7) * 100;
  const recentAvg = activeDays > 0 ? recentTotal / activeDays : 0;
  const trend = recentAvg > avg * 1.05 ? "above" : recentAvg < avg * 0.95 ? "below" : "average";

  return { score: Math.round(consistencyScore), trend };
}

export function getDateTotal(entries: TrackerEntry[], date: string): number {
  return entries.filter((e) => e.date === date).reduce((s, e) => s + e.value, 0);
}
