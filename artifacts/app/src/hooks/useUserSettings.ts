import { useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { applyThemePreview } from "@/lib/theme-preview";
import { KeybindMap } from "@/hooks/useKeyboardShortcuts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { CATEGORIES, Category } from "@/lib/dashboard-data";
import { TRACKER_METRICS, TrackerMetric } from "@/lib/tracker-data";
import { REWARDS, Reward } from "@/lib/oracle-data";
import { toast } from "sonner";
import type { TrackerXpConfig } from "@/lib/tracker-xp";
import { USER_SETTINGS_CHANGED_EVENT, emitAppEvent, onAppEvent } from "@/lib/app-events";
import type { HotkeyMap } from "@/lib/hotkeys";
import type { InboxSettings } from "@/lib/inbox";
import { setHotkeysCache } from "@/hooks/useHotkeys";

export interface CustomCategory {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  iconUrl?: string;
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
export type FrameStyle = "default" | "aura" | "neon" | "frost" | "sharp" | "prism" | "electric" | "plasma" | "icicle" | "bark";
export type HeroLayout = "default" | "compact" | "minimal" | "command" | "solid";
export type FontPair = "default" | "mono" | "editorial" | "geometric" | "handcraft" | "clean";
export type BackgroundPattern = "none" | "grid" | "dots" | "noise" | "starry" | "mesh" | "fireflies" | "forest" | "snow" | "leaves";
export type CardStyle = "default" | "glassmorphic" | "solid" | "outline" | "elevated" | "frosted" | "wood" | "neumorphic";
export type FocusPulseStyle = "glow" | "ping" | "none";
export type CompletionEffect = "burst" | "banner" | "fireworks" | "none";

export interface UserPreferences {
  enabledModules: string[];
  theme?: ThemeMode;
  accentColor?: AccentColor;
  frameStyle?: FrameStyle;
  customKeybinds?: Partial<KeybindMap>;
  /** Shortcuts with a modifier (lib/hotkeys.ts); only the ones changed from the defaults. */
  hotkeys?: Partial<HotkeyMap>;
  heroLayout?: HeroLayout;
  fontPair?: FontPair;
  backgroundPattern?: BackgroundPattern;
  cardStyle?: CardStyle;
  focusPulseStyle?: FocusPulseStyle;
  completionEffect?: CompletionEffect;
  /** Play a sound when a mission (or a path step on Home) is done. On unless false. */
  completionSound?: boolean;
  showCompletionBadge?: boolean;
  /** What the bell inbox may show and whether it rings (lib/inbox.ts). */
  inbox?: Partial<InboxSettings>;
  customAccentHue?: number | null;
  cardOpacity?: number;
  backgroundIntensity?: number;
  borderRadius?: number;
  moduleOrder?: string[];
  trackerXp?: TrackerXpConfig;
}

const DEFAULT_MODULES = ["dashboard", "tracker", "paths", "oracle", "archive", "projects", "library", "monthly-focus", "finance", "breathing", "health"];

/**
 * Mastery Ladder + Habit Loop were merged into one module ("paths"). Saved
 * preferences still name the old ids, so fold them in on read - otherwise the
 * Paths tab would be invisible for every existing user.
 */
function normalizeModuleIds(ids: string[] | undefined): string[] | undefined {
  if (!ids) return ids;
  const out: string[] = [];
  for (const id of ids) {
    const mapped = id === "ladder" || id === "habitloop" ? "paths" : id;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

function getCachedCategories(): CustomCategory[] {
  try {
    const cached = localStorage.getItem("cached_custom_categories");
    return cached ? JSON.parse(cached) : [];
  } catch { return []; }
}

interface SettingsState {
  customCategories: CustomCategory[];
  userMetrics: UserMetric[];
  customRewards: Reward[] | null;
  preferences: UserPreferences;
  loading: boolean;
}

const freshState = (loading: boolean): SettingsState => ({
  customCategories: getCachedCategories(),
  userMetrics: [],
  customRewards: null,
  preferences: { enabledModules: DEFAULT_MODULES },
  loading,
});

/** A copy mounted this long after the last load reads the settings again (once, for every copy). */
const STALE_MS = 5 * 60_000;

/**
 * One copy of the settings for the whole page. Every caller of the hook used
 * to load its own (user_onboarding, user_metrics and oracle_state on mount),
 * and the Archive mounts one per note card: about a thousand requests to open
 * it. Now the first caller loads, every caller reads the same state, and a
 * save shows everywhere at once.
 */
const store = {
  /** undefined until the first hook mounts. */
  userId: undefined as string | null | undefined,
  state: freshState(true),
  listeners: new Set<() => void>(),
  /** Bumped by every load and on a user change: only the newest load's answer is kept. */
  seq: 0,
  inFlight: null as Promise<void> | null,
  loadedAt: 0,
  /** The theme settings last applied from a load, so a background reload does not undo a preview. */
  appliedTheme: "",
  /** Set while this hook emits USER_SETTINGS_CHANGED_EVENT itself (its own save needs no reload). */
  emitting: false,
  eventHooked: false,
};

function setSettingsState(patch: Partial<SettingsState>) {
  store.state = { ...store.state, ...patch };
  store.listeners.forEach((l) => l());
}

const subscribeSettings = (listener: () => void) => {
  store.listeners.add(listener);
  return () => { store.listeners.delete(listener); };
};
const settingsSnapshot = () => store.state;

/** Load the user's settings; `force` starts a new read even while one is running (the newest one wins). */
function loadSettings(userId: string, force = false): Promise<void> {
  if (store.inFlight && !force) return store.inFlight;
  const seq = ++store.seq;
  const run = (async () => {
    // Three independent reads, side by side.
    const [{ data: onb }, { data: metrics }, { data: oracle }] = await Promise.all([
      supabase.from("user_onboarding").select("custom_categories, preferences").eq("user_id", userId).maybeSingle(),
      supabase.from("user_metrics").select("*").eq("user_id", userId).order("sort_order", { ascending: true }),
      supabase.from("oracle_state").select("custom_rewards").eq("user_id", userId).maybeSingle(),
    ]);
    if (seq !== store.seq || store.userId !== userId) return;

    const patch: Partial<SettingsState> = { loading: false };
    if (onb?.custom_categories) {
      const cats = onb.custom_categories as unknown as CustomCategory[];
      patch.customCategories = cats;
      try { localStorage.setItem("cached_custom_categories", JSON.stringify(cats)); } catch {}
    }
    if (onb?.preferences) {
      const prefs = onb.preferences as unknown as UserPreferences;
      if (prefs.enabledModules && prefs.enabledModules.length > 0) {
        patch.preferences = {
          ...prefs,
          enabledModules: normalizeModuleIds(prefs.enabledModules)!,
          moduleOrder: normalizeModuleIds(prefs.moduleOrder),
        };
      }
      if (prefs.theme || prefs.accentColor || prefs.frameStyle || prefs.fontPair || prefs.cardStyle) {
        const args = [prefs.theme || "dark", prefs.accentColor || "purple", prefs.frameStyle || "default", prefs.fontPair || "default", prefs.cardStyle || "default", prefs.customAccentHue, prefs.borderRadius, prefs.cardOpacity] as const;
        const key = JSON.stringify(args);
        if (key !== store.appliedTheme) {
          store.appliedTheme = key;
          applyThemePreview(...args);
        }
      }
    }
    if (metrics) {
      patch.userMetrics = metrics.map(m => ({
        id: m.id,
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        categoryId: m.category_id,
        colorVar: m.color_var,
        sortOrder: m.sort_order,
      }));
    }
    if (oracle?.custom_rewards) {
      const cr = oracle.custom_rewards as unknown as Reward[];
      if (Array.isArray(cr) && cr.length > 0) patch.customRewards = cr;
    }
    store.loadedAt = Date.now();
    setSettingsState(patch);
  })()
    .catch(() => {
      // Offline or the like: show the defaults instead of loading forever; the next mount tries again.
      if (seq === store.seq && store.state.loading) setSettingsState({ loading: false });
    })
    .finally(() => {
      if (store.inFlight === run) store.inFlight = null;
    });
  store.inFlight = run;
  return run;
}

/** Point the store at the signed-in user: a new user starts from defaults and loads; the same user reloads when stale. */
function switchSettingsUser(userId: string | null) {
  if (store.userId !== userId) {
    store.userId = userId;
    store.seq++;
    store.inFlight = null;
    store.loadedAt = 0;
    store.appliedTheme = "";
    setSettingsState(freshState(!!userId));
    if (userId) void loadSettings(userId);
  } else if (userId && !store.inFlight && Date.now() - store.loadedAt > STALE_MS) {
    void loadSettings(userId);
  }
}

/** Test hook: forget the shared settings (the next mount loads again). */
export function resetUserSettingsStore() {
  store.userId = undefined;
  store.seq++;
  store.inFlight = null;
  store.loadedAt = 0;
  store.appliedTheme = "";
  store.state = freshState(true);
}

export function useUserSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const live = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  // Until the effect below switches the store, a different user's state must not show.
  const fresh = useMemo(() => freshState(!!userId), [userId]);
  const state = store.userId === userId ? live : fresh;
  const { customCategories, userMetrics, customRewards, preferences, loading } = state;

  useEffect(() => {
    switchSettingsUser(userId);
  }, [userId]);

  // Preferences written elsewhere (the assistant's set_theme / toggle_module) reload here, once for every copy.
  useEffect(() => {
    if (store.eventHooked) return;
    store.eventHooked = true;
    onAppEvent(USER_SETTINGS_CHANGED_EVENT, () => {
      if (store.emitting || !store.userId) return;
      void loadSettings(store.userId, true);
    });
  }, []);

  const setCustomCategories = useCallback((cats: CustomCategory[]) => setSettingsState({ customCategories: cats }), []);
  const setUserMetrics = useCallback((metrics: UserMetric[]) => setSettingsState({ userMetrics: metrics }), []);
  const setCustomRewards = useCallback((rewards: Reward[] | null) => setSettingsState({ customRewards: rewards }), []);
  const setPreferences = useCallback((prefs: UserPreferences) => setSettingsState({ preferences: prefs }), []);

  const getCategories = useCallback((): Category[] => {
    return CATEGORIES.map(cat => {
      const custom = customCategories.find(c => c.id === cat.id);
      if (!custom) return cat;
      return {
        ...cat,
        name: custom.name || cat.name,
        tagline: custom.tagline || cat.tagline,
        icon: custom.icon || cat.icon,
        iconUrl: custom.iconUrl || undefined,
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

  // Persist to user_onboarding while preserving preference keys this hook does
  // not manage (e.g. `bookmarks`, written by useBookmarks). Read-merge-write:
  // fetch the current preferences from the DB, overlay the keys we're saving,
  // and upsert. So a settings save never clobbers unrelated preference keys.
  const persistOnboarding = useCallback(
    async (cats: CustomCategory[], prefs: UserPreferences) => {
      const { data, error: readErr } = await supabase
        .from("user_onboarding")
        .select("preferences")
        .eq("user_id", user!.id)
        .maybeSingle();
      // Abort on read failure: writing with an empty base would clobber
      // unmanaged preference keys (e.g. Bookmarks). Caller surfaces the error.
      if (readErr) return { error: readErr };
      const existing = (data?.preferences as Record<string, unknown>) || {};
      const mergedPrefs = { ...existing, ...prefs };
      return await (supabase.from("user_onboarding") as any).upsert([{
        user_id: user!.id,
        completed: true,
        custom_categories: cats,
        preferences: mergedPrefs,
      }], { onConflict: "user_id" });
    },
    [user]
  );

  const saveCategories = useCallback(async (cats: CustomCategory[]) => {
    if (!user) return;
    setCustomCategories(cats);
    try { localStorage.setItem("cached_custom_categories", JSON.stringify(cats)); } catch {}
    const { error } = await persistOnboarding(cats, preferences);
    if (error) toast.error("Failed to save categories");
    else toast.success("Categories saved");
  }, [user, preferences, persistOnboarding]);

  const saveMetrics = useCallback(async (metrics: (Omit<UserMetric, "id"> & { existingId?: string })[]) => {
    if (!user) return;

    // Separate existing (update) vs new (insert)
    const toUpdate = metrics.filter(m => m.existingId);
    const toInsert = metrics.filter(m => !m.existingId);

    // Find metrics to delete (existing IDs not in the save list)
    const keepIds = new Set(toUpdate.map(m => m.existingId!));
    const currentIds = userMetrics.map(m => m.id);
    const toDeleteIds = currentIds.filter(id => !keepIds.has(id));

    // Delete removed metrics
    if (toDeleteIds.length > 0) {
      await supabase.from("user_metrics").delete().in("id", toDeleteIds);
    }

    // Update existing metrics
    for (const m of toUpdate) {
      await supabase.from("user_metrics").update({
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        category_id: m.categoryId,
        color_var: m.colorVar,
        sort_order: m.sortOrder,
      }).eq("id", m.existingId!);
    }

    // Insert new metrics
    let insertedData: any[] = [];
    if (toInsert.length > 0) {
      const rows = toInsert.map(m => ({
        user_id: user.id,
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        category_id: m.categoryId,
        color_var: m.colorVar,
        sort_order: m.sortOrder,
      }));
      const { data, error } = await supabase.from("user_metrics").insert(rows).select();
      if (error) { toast.error("Failed to save metrics"); return; }
      insertedData = data || [];
    }

    // Rebuild local state from kept + inserted
    const updatedMetrics: UserMetric[] = [
      ...toUpdate.map(m => ({
        id: m.existingId!,
        label: m.label,
        unit: m.unit,
        icon: m.icon,
        categoryId: m.categoryId,
        colorVar: m.colorVar,
        sortOrder: m.sortOrder,
      })),
      ...insertedData.map((d: any) => ({
        id: d.id,
        label: d.label,
        unit: d.unit,
        icon: d.icon,
        categoryId: d.category_id,
        colorVar: d.color_var,
        sortOrder: d.sort_order,
      })),
    ].sort((a, b) => a.sortOrder - b.sortOrder);

    setUserMetrics(updatedMetrics);
    toast.success("Metrics saved");
  }, [user, userMetrics]);

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
    const { error } = await persistOnboarding(customCategories, prefs);
    if (error) toast.error("Failed to save preferences");
    else {
      toast.success("Preferences saved");
      // The shared state already shows it everywhere; the event is for the other readers (hotkeys).
      store.emitting = true;
      try { emitAppEvent(USER_SETTINGS_CHANGED_EVENT); } finally { store.emitting = false; }
    }
  }, [user, customCategories, persistOnboarding]);

  const saveEnabledModules = useCallback(async (modules: string[], order?: string[]) => {
    const newPrefs = { ...preferences, enabledModules: modules };
    if (order) newPrefs.moduleOrder = order;
    await savePreferences(newPrefs);
  }, [savePreferences, preferences]);

  const saveTheme = useCallback(async (theme: ThemeMode, accentColor: AccentColor, frameStyle?: FrameStyle, heroLayout?: HeroLayout, fontPair?: FontPair, backgroundPattern?: BackgroundPattern, cardStyle?: CardStyle, extraPrefs?: Partial<UserPreferences>) => {
    const newPrefs = {
      ...preferences,
      theme,
      accentColor,
      frameStyle: frameStyle || preferences.frameStyle || "default",
      heroLayout: heroLayout || preferences.heroLayout || "default",
      fontPair: fontPair || preferences.fontPair || "default",
      backgroundPattern: backgroundPattern || preferences.backgroundPattern || "none",
      cardStyle: cardStyle || preferences.cardStyle || "default",
      ...extraPrefs,
    };
    await savePreferences(newPrefs);
    applyThemePreview(theme, accentColor, frameStyle || preferences.frameStyle || "default", fontPair || preferences.fontPair || "default", cardStyle || preferences.cardStyle || "default", newPrefs.customAccentHue, newPrefs.borderRadius, newPrefs.cardOpacity);
  }, [savePreferences, preferences]);

  /** Both kinds of shortcut in one write, so neither save can undo the other. */
  const saveKeybinds = useCallback(async (keybinds: Partial<KeybindMap> | null, hotkeys?: Partial<HotkeyMap> | null) => {
    const newPrefs = { ...preferences, customKeybinds: keybinds || undefined };
    if (hotkeys !== undefined) newPrefs.hotkeys = hotkeys || undefined;
    await savePreferences(newPrefs);
    // savePreferences told the other copies; the desktop tracker reads it on its next sync.
    if (user && hotkeys !== undefined) setHotkeysCache(user.id, hotkeys);
  }, [savePreferences, preferences, user]);

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
