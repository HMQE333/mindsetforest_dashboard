import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

interface BreathingSession {
  id: string;
  pattern: string;
  duration_seconds: number;
  completed_at: string;
}

interface BreathingStats {
  totalSessions: number;
  totalMinutes: number;
  currentStreak: number;
}

export function useBreathingState() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<BreathingSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (supabase
      .from("breathing_sessions" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false }) as any)
      .then(({ data }: any) => {
        if (data) setSessions(data as BreathingSession[]);
        setLoading(false);
      });
  }, [user]);

  const logSession = useCallback(async (pattern: string, durationSeconds: number) => {
    if (!user) return;
    const { data, error } = await (supabase
      .from("breathing_sessions" as any)
      .insert({ user_id: user.id, pattern, duration_seconds: durationSeconds } as any)
      .select()
      .single() as any);
    if (error) { toast.error("Failed to save session"); return; }
    if (data) setSessions(prev => [data as BreathingSession, ...prev]);
  }, [user]);

  const stats: BreathingStats = (() => {
    const totalSessions = sessions.length;
    const totalMinutes = Math.round(sessions.reduce((s, e) => s + e.duration_seconds, 0) / 60);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daySet = new Set(sessions.map(s => {
      const d = new Date(s.completed_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }));
    let streak = 0;
    const day = new Date(today);
    while (daySet.has(day.getTime())) {
      streak++;
      day.setDate(day.getDate() - 1);
    }
    return { totalSessions, totalMinutes, currentStreak: streak };
  })();

  return { sessions, stats, logSession, loading };
}
