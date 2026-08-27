import { useMemo } from "react";
import { CATEGORIES, Category } from "@/lib/dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useQuery } from "@tanstack/react-query";

/**
 * Returns categories merged with user's custom overrides.
 * Falls back to defaults if user hasn't customized.
 * Use this instead of importing CATEGORIES directly.
 */
export function useCategories(): Category[] {
  const { user } = useAuth();

  const { data: customCategories } = useQuery<Record<string, Partial<Category>> | null>({
    queryKey: ["custom_categories", user?.id],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_onboarding")
        .select("custom_categories")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!data?.custom_categories) return null;
      // custom_categories is an array of {id, name?, icon?, color?, lightColor?, tagline?, iconUrl?}
      const arr = (Array.isArray(data.custom_categories) ? data.custom_categories : []) as Array<{ id: string; name?: string; icon?: string; color?: string; lightColor?: string; tagline?: string; iconUrl?: string }>;
      const map: Record<string, Partial<Category>> = {};
      for (const c of arr) {
        map[c.id] = c as Partial<Category>;
      }
      return map;
    },
  });

  return useMemo(() => {
    if (!customCategories) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      ...(customCategories[cat.id] || {}),
    }));
  }, [customCategories]);
}