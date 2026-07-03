import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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

  const addEntry = useCallback(async (metricId: string, value: number) => {
    if (!user) return;
    const now = new Date();
    const date = now.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("tracker_entries")
      .insert({ user_id: user.id, metric_id: metricId, value, date })
      .select()
      .single();

    if (!error && data) {
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
    }
  }, [user]);

  return { entries, loading, addEntry, refetch: fetchEntries };
}

// Helper functions that work on TrackerEntry[]
export function getTodayTotal(entries: TrackerEntry[], metricId: string): number {
  const today = new Date().toISOString().split("T")[0];
  return entries.filter((e) => e.metricId === metricId && e.date === today).reduce((s, e) => s + e.value, 0);
}

export function getLast7DaysTotal(entries: TrackerEntry[], metricId: string): number {
  const now = Date.now();
  const ago = now - 7 * 86400000;
  return entries.filter((e) => e.metricId === metricId && new Date(e.createdAt).getTime() >= ago).reduce((s, e) => s + e.value, 0);
}

export function getAllTimeTotal(entries: TrackerEntry[], metricId: string): number {
  return entries.filter((e) => e.metricId === metricId).reduce((s, e) => s + e.value, 0);
}

export function getStreakDays(entries: TrackerEntry[]): number {
  if (entries.length === 0) return 0;
  const uniqueDates = [...new Set(entries.map((e) => e.date))].sort().reverse();
  const today = new Date().toISOString().split("T")[0];
  let streak = 0;
  let expected = today;
  for (const date of uniqueDates) {
    if (date === expected) {
      streak++;
      const d = new Date(expected);
      d.setDate(d.getDate() - 1);
      expected = d.toISOString().split("T")[0];
    } else if (date < expected) break;
  }
  return streak;
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
  const today = new Date();
  let activeDays = 0;
  let recentTotal = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
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
