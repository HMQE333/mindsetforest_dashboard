import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { CATEGORIES, Category } from "@/lib/dashboard-data";
import { TRACKER_METRICS, TrackerMetric } from "@/lib/tracker-data";
import { REWARDS, Reward } from "@/lib/oracle-data";
import { toast } from "sonner";

export interface CustomCategory {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  color?: string;
  lightColor?: string;
}

export interface UserMetric {
  id: string;
  label: string;
  unit: string;
  icon: string;
  categoryId: string;
  colorVar: string;
  sortOrder: number;
}

export type ThemeMode = "dark" | "light" | "oled" | "midnight";
export type AccentColor = "purple" | "blue" | "green" | "orange" | "pink" | "red" | "cyan" | "gold";

export interface UserPreferences {
  enabledModules: string[];
  theme?: ThemeMode;
  accentColor?: AccentColor;
}

const DEFAULT_MODULES = ["dashboard", "tracker", "ladder", "habitloop", "oracle", "archive", "projects"];

export function useUserSettings() {
  const { user } = useAuth();
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [userMetrics, setUserMetrics] = useState<UserMetric[]>([]);
  const [customRewards, setCustomRewards] = useState<Reward[] | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({ enabledModules: DEFAULT_MODULES });
  const [loading, setLoading] = useState(true);

  // Load all settings
  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      // Load categories + preferences from onboarding
      const { data: onb } = await supabase
        .from("user_onboarding")
        .select("custom_categories, preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      if (onb?.custom_categories) {
        setCustomCategories(onb.custom_categories as unknown as CustomCategory[]);
      }
      if (onb?.preferences) {
        const prefs = onb.preferences as unknown as UserPreferences;
        if (prefs.enabledModules && prefs.enabledModules.length > 0) {
          setPreferences(prefs);
        }
      }

      // Load custom metrics
      const { data: metrics } = await supabase
        .from("user_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (metrics) {
        setUserMetrics(metrics.map(m => ({
          id: m.id,
          label: m.label,
          unit: m.unit,
          icon: m.icon,
          categoryId: m.category_id,
          colorVar: m.color_var,
          sortOrder: m.sort_order,
        })));
      }

      // Load custom rewards from oracle_state
      const { data: oracle } = await supabase
        .from("oracle_state")
        .select("custom_rewards")
        .eq("user_id", user.id)
        .maybeSingle();

      if (oracle?.custom_rewards) {
        const cr = oracle.custom_rewards as unknown as Reward[];
        if (Array.isArray(cr) && cr.length > 0) {
          setCustomRewards(cr);
        }
      }

      setLoading(false);
    };
    load();
  }, [user]);

  // Get merged categories (defaults + customizations)
  const getCategories = useCallback((): Category[] => {
    return CATEGORIES.map(cat => {
      const custom = customCategories.find(c => c.id === cat.id);
      if (!custom) return cat;
      return {
        ...cat,
        name: custom.name || cat.name,
        tagline: custom.tagline || cat.tagline,
        icon: custom.icon || cat.icon,
        color: custom.color || cat.color,
        lightColor: custom.lightColor || cat.lightColor,
      };
    });
  }, [customCategories]);

  // Get metrics (custom if any, otherwise defaults)
  const getMetrics = useCallback((): TrackerMetric[] => {
    if (userMetrics.length === 0) return TRACKER_METRICS;
    const cats = getCategories();
    return userMetrics.map(m => {
      const cat = cats.find(c => c.id === m.categoryId);
      return {
        id: m.id,
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        categoryId: m.categoryId,
        categoryName: cat?.name || m.categoryId,
        categoryIcon: cat?.icon || "📊",
        colorVar: m.colorVar,
      };
    });
  }, [userMetrics, getCategories]);

  // Get rewards (custom if any, otherwise defaults)
  const getRewards = useCallback((): Reward[] => {
    return customRewards || REWARDS;
  }, [customRewards]);

  // Save categories
  const saveCategories = useCallback(async (cats: CustomCategory[]) => {
    if (!user) return;
    setCustomCategories(cats);
    const { error } = await (supabase.from("user_onboarding") as any).upsert([{
      user_id: user.id,
      completed: true,
      custom_categories: cats,
      preferences: preferences,
    }], { onConflict: "user_id" });
    if (error) toast.error("Failed to save categories");
    else toast.success("Categories saved");
  }, [user, preferences]);

  // Save metrics (full replace)
  const saveMetrics = useCallback(async (metrics: Omit<UserMetric, "id">[]) => {
    if (!user) return;

    // Delete existing
    await supabase.from("user_metrics").delete().eq("user_id", user.id);

    // Insert new
    if (metrics.length > 0) {
      const rows = metrics.map((m, i) => ({
        user_id: user.id,
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        category_id: m.categoryId,
        color_var: m.colorVar,
        sort_order: i,
      }));
      const { data, error } = await supabase.from("user_metrics").insert(rows).select();
      if (error) { toast.error("Failed to save metrics"); return; }
      if (data) {
        setUserMetrics(data.map(d => ({
          id: d.id,
          label: d.label,
          unit: d.unit,
          icon: d.icon,
          categoryId: d.category_id,
          colorVar: d.color_var,
          sortOrder: d.sort_order,
        })));
      }
    } else {
      setUserMetrics([]);
    }
    toast.success("Metrics saved");
  }, [user]);

  // Save rewards
  const saveRewards = useCallback(async (rewards: Reward[] | null) => {
    if (!user) return;
    setCustomRewards(rewards);
    const { error } = await supabase.from("oracle_state").upsert([{
      user_id: user.id,
      custom_rewards: (rewards || []) as unknown as Record<string, never>,
    }], { onConflict: "user_id" });
    if (error) toast.error("Failed to save rewards");
    else toast.success("Rewards saved");
  }, [user]);

  // Reset metrics to defaults
  const resetMetricsToDefaults = useCallback(async () => {
    if (!user) return;
    await supabase.from("user_metrics").delete().eq("user_id", user.id);
    setUserMetrics([]);
    toast.success("Metrics reset to defaults");
  }, [user]);

  // Reset rewards to defaults
  const resetRewardsToDefaults = useCallback(async () => {
    await saveRewards(null);
    toast.success("Rewards reset to defaults");
  }, [saveRewards]);

  // Save preferences (modules, etc.)
  const savePreferences = useCallback(async (prefs: UserPreferences) => {
    if (!user) return;
    setPreferences(prefs);
    const { error } = await (supabase.from("user_onboarding") as any).upsert([{
      user_id: user.id,
      completed: true,
      custom_categories: customCategories,
      preferences: prefs,
    }], { onConflict: "user_id" });
    if (error) toast.error("Failed to save preferences");
    else toast.success("Preferences saved");
  }, [user, customCategories]);

  const saveEnabledModules = useCallback(async (modules: string[]) => {
    const newPrefs = { enabledModules: modules };
    await savePreferences(newPrefs);
  }, [savePreferences]);

  return {
    loading,
    customCategories,
    userMetrics,
    customRewards,
    preferences,
    getCategories,
    getMetrics,
    getRewards,
    saveCategories,
    saveMetrics,
    saveRewards,
    saveEnabledModules,
    resetMetricsToDefaults,
    resetRewardsToDefaults,
  };
}
