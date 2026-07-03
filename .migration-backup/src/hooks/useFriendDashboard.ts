import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FriendDashboardData {
  profile: { username: string; display_name: string; avatar_emoji: string };
  hero: { current_xp: number; current_level: number; streak_days: number; missions_completed: number };
  weekly: { date: string; missions_completed: number; xp_earned: number }[];
}

export function useFriendDashboard(friendId: string | null, enabled: boolean) {
  const [data, setData] = useState<FriendDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!friendId || !enabled) return;
    setLoading(true);
    setError(null);
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_friend_dashboard" as any, { friend_id: friendId });
    if (rpcErr) { setError("network"); setLoading(false); return; }
    const res = rpcData as any;
    if (res?.error) { setError(res.error); setLoading(false); return; }
    setData(res as FriendDashboardData);
    setLoading(false);
  }, [friendId, enabled]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}