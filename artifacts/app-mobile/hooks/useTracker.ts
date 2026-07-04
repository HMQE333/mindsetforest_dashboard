import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";

export interface TrackerEntry {
  id: string;
  metricId: string;
  value: number;
  date: string;
  createdAt: string;
}

export function useTracker() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TrackerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("tracker_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (!error && data) {
      setEntries(
        data.map((d: any) => ({
          id: d.id,
          metricId: d.metric_id,
          value: d.value,
          date: d.date,
          createdAt: d.created_at,
        })),
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addEntry = useCallback(
    async (metricId: string, value: number) => {
      if (!user) return;
      const date = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("tracker_entries")
        .insert({ user_id: user.id, metric_id: metricId, value, date })
        .select()
        .single();
      if (!error && data) {
        setEntries((prev) => [
          { id: data.id, metricId: data.metric_id, value: data.value, date: data.date, createdAt: data.created_at },
          ...prev,
        ]);
      }
    },
    [user],
  );

  return { entries, loading, addEntry, refetch: fetchEntries };
}

export function getTodayTotal(entries: TrackerEntry[], metricId: string): number {
  const today = new Date().toISOString().split("T")[0];
  return entries.filter((e) => e.metricId === metricId && e.date === today).reduce((s, e) => s + e.value, 0);
}

export function getLast7DaysTotal(entries: TrackerEntry[], metricId: string): number {
  const ago = Date.now() - 7 * 86400000;
  return entries
    .filter((e) => e.metricId === metricId && new Date(e.createdAt).getTime() >= ago)
    .reduce((s, e) => s + e.value, 0);
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
