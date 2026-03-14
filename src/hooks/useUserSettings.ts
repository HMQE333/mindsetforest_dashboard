import { useState, useEffect, useCallback } from "react";
import { applyThemePreview } from "@/components/settings/ThemeTab";
import { KeybindMap } from "@/hooks/useKeyboardShortcuts";
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

export type ThemeMode = "dark" | "light" | "oled" | "midnight" | "forest" | "crimson" | "cyber" | "sandstone" | "frost" | "timber";
export type AccentColor = "purple" | "blue" | "green" | "orange" | "pink" | "red" | "cyan" | "gold";
export type FrameStyle = "default" | "glow" | "aura" | "neon" | "frost" | "sharp" | "prism" | "electric" | "plasma" | "icicle" | "bark";
export type HeroLayout = "default" | "compact" | "minimal" | "command" | "solid";
export type FontPair = "default" | "mono" | "editorial" | "geometric" | "handcraft" | "clean";
export type BackgroundPattern = "none" | "grid" | "dots" | "noise" | "starry" | "mesh" | "fireflies" | "forest" | "snow" | "leaves";
export type CardStyle = "default" | "glassmorphic" | "solid" | "outline" | "elevated" | "frosted" | "wood" | "moss";
export type FocusPulseStyle = "glow" | "ping" | "none";

export interface UserPreferences {
  enabledModules: string[];
  theme?: ThemeMode;
  accentColor?: AccentColor;
  frameStyle?: FrameStyle;
  customKeybinds?: Partial<KeybindMap>;
  heroLayout?: HeroLayout;
  fontPair?: FontPair;
  backgroundPattern?: BackgroundPattern;
  cardStyle?: CardStyle;
  focusPulseStyle?: FocusPulseStyle;
}

const DEFAULT_MODULES = ["dashboard", "tracker", "ladder", "habitloop", "oracle", "archive", "projects", "library", "monthly-focus"];

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
        if (prefs.theme || prefs.accentColor || prefs.frameStyle || prefs.fontPair || prefs.cardStyle) {
          applyThemePreview(prefs.theme || "dark", prefs.accentColor || "purple", prefs.frameStyle || "default", prefs.fontPair || "default", prefs.cardStyle || "default");
        }
      }

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

  const getRewards = useCallback((): Reward[] => {
    return customRewards || REWARDS;
  }, [customRewards]);

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

  const saveMetrics = useCallback(async (metrics: Omit<UserMetric, "id">[]) => {
    if (!user) return;
    await supabase.from("user_metrics").delete().eq("user_id", user.id);
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

  const resetMetricsToDefaults = useCallback(async () => {
    if (!user) return;
    await supabase.from("user_metrics").delete().eq("user_id", user.id);
    setUserMetrics([]);
    toast.success("Metrics reset to defaults");
  }, [user]);

  const resetRewardsToDefaults = useCallback(async () => {
    await saveRewards(null);
    toast.success("Rewards reset to defaults");
  }, [saveRewards]);

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
    await savePreferences({ ...preferences, enabledModules: modules });
  }, [savePreferences, preferences]);

  const saveTheme = useCallback(async (theme: ThemeMode, accentColor: AccentColor, frameStyle?: FrameStyle, heroLayout?: HeroLayout, fontPair?: FontPair, backgroundPattern?: BackgroundPattern, cardStyle?: CardStyle) => {
    const newPrefs = {
      ...preferences,
      theme,
      accentColor,
      frameStyle: frameStyle || preferences.frameStyle || "default",
      heroLayout: heroLayout || preferences.heroLayout || "default",
      fontPair: fontPair || preferences.fontPair || "default",
      backgroundPattern: backgroundPattern || preferences.backgroundPattern || "none",
      cardStyle: cardStyle || preferences.cardStyle || "default",
    };
    await savePreferences(newPrefs);
    applyThemePreview(theme, accentColor, frameStyle || preferences.frameStyle || "default", fontPair || preferences.fontPair || "default", cardStyle || preferences.cardStyle || "default");
  }, [savePreferences, preferences]);

  const saveKeybinds = useCallback(async (keybinds: Partial<KeybindMap> | null) => {
    const newPrefs = { ...preferences, customKeybinds: keybinds || undefined };
    await savePreferences(newPrefs);
  }, [savePreferences, preferences]);

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
    saveTheme,
    saveKeybinds,
    savePreferences,
    resetMetricsToDefaults,
    resetRewardsToDefaults,
  };
}
