import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserSettings } from "./useUserSettings";
import { useDashboardState } from "./useDashboardState";
import {
  TrackerXpConfig,
  computeEntryXp,
  mergeConfig,
  DEFAULT_TRACKER_XP_CONFIG,
} from "@/lib/tracker-xp";

interface GrantRow {
  id: string;
  source: "entry" | "milestone";
  ref_id: string;
  xp: number;
  date: string;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useTrackerXp() {
  const { user } = useAuth();
  const { preferences, savePreferences, getMetrics } = useUserSettings();
  const { addXP } = useDashboardState();
  const metrics = getMetrics();

  const rawConfig = (preferences as { trackerXp?: Partial<TrackerXpConfig> }).trackerXp;
  const config = useMemo(() => mergeConfig(rawConfig, metrics), [rawConfig, metrics]);

  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const grantedMilestonesRef = useRef<Set<string>>(new Set());

  // Load grants
  useEffect(() => {
    if (!user) { setGrants([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tracker_xp_grants")
        .select("id, source, ref_id, xp, date")
        .eq("user_id", user.id)
        .order("granted_at", { ascending: false });
      if (cancelled) return;
      const rows = (data || []) as GrantRow[];
      setGrants(rows);
      grantedMilestonesRef.current = new Set(
        rows.filter(r => r.source === "milestone").map(r => r.ref_id)
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const todayEntryXp = useMemo(() => {
    const today = todayISO();
    return grants
      .filter(g => g.source === "entry" && g.date === today)
      .reduce((s, g) => s + g.xp, 0);
  }, [grants]);

  const totalXp = useMemo(
    () => grants.reduce((s, g) => s + g.xp, 0),
    [grants]
  );

  const saveConfig = useCallback(async (next: TrackerXpConfig) => {
    await savePreferences({ ...preferences, trackerXp: next } as never);
  }, [preferences, savePreferences]);

  const resetConfig = useCallback(async () => {
    await saveConfig(mergeConfig(null, metrics));
  }, [saveConfig, metrics]);

  const awardEntryXp = useCallback(async (metricId: string, value: number): Promise<number> => {
    if (!user || !config.enabled) return 0;
    const metric = metrics.find(m => m.id === metricId);
    let xp = computeEntryXp(metric, value, config);
    if (xp <= 0) return 0;

    // Daily cap
    if (config.dailyCap > 0) {
      const remaining = Math.max(0, config.dailyCap - todayEntryXp);
      xp = Math.min(xp, remaining);
      if (xp <= 0) return 0;
    }

    const { data, error } = await supabase
      .from("tracker_xp_grants")
      .insert({ user_id: user.id, source: "entry", ref_id: metricId, xp, date: todayISO() })
      .select("id, source, ref_id, xp, date")
      .single();
    if (error || !data) return 0;

    setGrants(prev => [data as GrantRow, ...prev]);
    addXP(xp);
    return xp;
  }, [user, config, metrics, todayEntryXp, addXP]);

  const awardMilestoneXp = useCallback(async (achievementId: string): Promise<number> => {
    if (!user || !config.enabled) return 0;
    if (grantedMilestonesRef.current.has(achievementId)) return 0;
    grantedMilestonesRef.current.add(achievementId); // optimistic lock to avoid double-fire

    const xp = Math.max(0, Math.round(config.milestones[achievementId] ?? 0));
    if (xp <= 0) return 0;

    const { data, error } = await supabase
      .from("tracker_xp_grants")
      .insert({ user_id: user.id, source: "milestone", ref_id: achievementId, xp, date: todayISO() })
      .select("id, source, ref_id, xp, date")
      .single();
    if (error || !data) {
      // The unique index will protect against true double-grants; treat silently.
      return 0;
    }

    setGrants(prev => [data as GrantRow, ...prev]);
    addXP(xp);
    return xp;
  }, [user, config, addXP]);

  const isMilestoneGranted = useCallback(
    (id: string) => grantedMilestonesRef.current.has(id),
    []
  );

  const markMilestoneSkipped = useCallback((id: string) => {
    grantedMilestonesRef.current.add(id);
  }, []);

  const refundAllGrants = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    const refund = grants.reduce((s, g) => s + g.xp, 0);
    if (refund <= 0) {
      // still wipe any zero-rows for cleanliness
      await supabase.from("tracker_xp_grants").delete().eq("user_id", user.id);
      setGrants([]);
      grantedMilestonesRef.current = new Set();
      return 0;
    }
    const { error } = await supabase
      .from("tracker_xp_grants")
      .delete()
      .eq("user_id", user.id);
    if (error) return 0;
    setGrants([]);
    grantedMilestonesRef.current = new Set();
    addXP(-refund);
    return refund;
  }, [user, grants, addXP]);

  return {
    loading,
    config,
    defaultConfig: DEFAULT_TRACKER_XP_CONFIG,
    grants,
    totalXp,
    todayEntryXp,
    saveConfig,
    resetConfig,
    awardEntryXp,
    awardMilestoneXp,
    isMilestoneGranted,
    markMilestoneSkipped,
    refundAllGrants,
  };
}