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

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const check = async () => {
      const { data } = await supabase
        .from("user_onboarding" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!data) {
        setNeedsOnboarding(true);
      } else {
        setNeedsOnboarding(!(data as any).completed);
        setCustomCategories(((data as any).custom_categories as CustomCategory[]) || []);
      }
      setLoading(false);
    };
    check();
  }, [user]);

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

  return { needsOnboarding, loading, customCategories, completeOnboarding };
}
