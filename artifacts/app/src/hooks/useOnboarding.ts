import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Mission } from "@/lib/dashboard-data";

export interface CustomCategory {
  id: string;
  name: string;
  tagline: string;
  icon: string;
}

export function useOnboarding() {
  const { user } = useAuth();
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  // The read failed (offline, server down). Not the same as "no row yet": a
  // failed read must never show the first-run setup, whose choices would
  // overwrite the real categories and missions.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    let cancelled = false;
    const check = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_onboarding" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        setFailed(true);
        setNeedsOnboarding(false);
        setLoading(false);
        return;
      }
      setFailed(false);
      if (!data) {
        setNeedsOnboarding(true);
      } else {
        setNeedsOnboarding(!(data as any).completed);
        setCustomCategories(((data as any).custom_categories as CustomCategory[]) || []);
      }
      setLoading(false);
    };
    void check();
    return () => { cancelled = true; };
  }, [user, attempt]);

  const completeOnboarding = useCallback(async (categories?: CustomCategory[], customMissions?: Record<string, Mission[]>) => {
    if (!user) return;

    // Save onboarding status + categories
    await (supabase.from("user_onboarding" as any) as any).upsert([{
      user_id: user.id,
      completed: true,
      custom_categories: categories || [],
    }], { onConflict: "user_id" });

    // If custom missions were set, save them to dashboard_state
    if (customMissions && Object.keys(customMissions).length > 0) {
      await supabase.from("dashboard_state").upsert([{
        user_id: user.id,
        custom_missions: customMissions as unknown as Record<string, never>,
      }], { onConflict: "user_id" });
    }

    setNeedsOnboarding(false);
    if (categories) setCustomCategories(categories);
  }, [user]);

  return { needsOnboarding, loading, failed, retry, customCategories, completeOnboarding };
}
