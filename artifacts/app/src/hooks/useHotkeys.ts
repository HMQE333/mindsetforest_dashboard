import { useEffect, useMemo, useReducer } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { resolveHotkeys, type HotkeyMap } from "@/lib/hotkeys";
import { USER_SETTINGS_CHANGED_EVENT, onAppEvent } from "@/lib/app-events";

/**
 * The user's shortcuts (lib/hotkeys.ts), read once and shared by every
 * component that listens for them, and read again when Settings saves.
 * Until the first read, and if it fails, the defaults apply.
 */
let cached: { userId: string; custom: Partial<HotkeyMap> } | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(userId: string): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const { data, error } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
    if (error) return;
    const prefs = (data?.preferences ?? {}) as { hotkeys?: Partial<HotkeyMap> };
    cached = { userId, custom: prefs.hotkeys ?? {} };
    listeners.forEach((l) => l());
  })().finally(() => { pending = null; });
  return pending;
}

/** Apply saved shortcuts at once, without waiting for the re-read. */
export function setHotkeysCache(userId: string, custom: Partial<HotkeyMap> | null | undefined): void {
  cached = { userId, custom: custom ?? {} };
  listeners.forEach((l) => l());
}

export function useHotkeys(): HotkeyMap {
  const { user } = useAuth();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => { listeners.delete(rerender); };
  }, []);
  useEffect(() => {
    if (user && cached?.userId !== user.id) void load(user.id);
  }, [user]);
  useEffect(() => onAppEvent(USER_SETTINGS_CHANGED_EVENT, () => { if (user) void load(user.id); }), [user]);
  const custom = user && cached?.userId === user.id ? cached.custom : null;
  return useMemo(() => resolveHotkeys(custom), [custom]);
}
