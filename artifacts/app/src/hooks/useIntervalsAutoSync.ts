import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { WATCH_ENTRIES_CHANGED_EVENT, emitAppEvent } from "@/lib/app-events";

/** Pull again when the last import is older than this. */
const STALE_MS = 2 * 60 * 60 * 1000;
/** Re-check while the app stays open. */
const CHECK_EVERY_MS = 30 * 60 * 1000;
const LAST_TRY_KEY = "mf-intervals-last-try";

/**
 * Watch data with no button: whenever the app is open, comes back online or
 * regains focus, and the last intervals.icu import is stale, pull again. The
 * watch -> Garmin Connect -> intervals.icu hop happens on the phone; this just
 * makes sure the app picks up whatever intervals.icu has, without a click.
 */
export function useIntervalsAutoSync() {
  const { user } = useAuth();
  const running = useRef(false);

  const maybeSync = useCallback(async () => {
    if (!user || running.current || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    // One attempt per stale window per browser, even across tabs and reloads.
    try {
      const lastTry = Number(localStorage.getItem(LAST_TRY_KEY) || 0);
      if (Date.now() - lastTry < 10 * 60 * 1000) return;
    } catch { /* storage unavailable: carry on */ }
    running.current = true;
    try {
      const { data } = await supabase.from("user_onboarding").select("preferences").eq("user_id", user.id).maybeSingle();
      const prefs = (data?.preferences as Record<string, unknown> | null) || {};
      if (!prefs.intervals_api_key || !prefs.intervals_athlete_id) return;
      const last = Date.parse(String(prefs.intervals_last_sync || "")) || 0;
      if (Date.now() - last < STALE_MS) return;
      try { localStorage.setItem(LAST_TRY_KEY, String(Date.now())); } catch { /* ignore */ }
      const { data: res, error } = await supabase.functions.invoke("fetch-intervals-icu", { body: { action: "fetch" } });
      if (!error && res && Number(res.imported) > 0) emitAppEvent(WATCH_ENTRIES_CHANGED_EVENT);
    } catch {
      /* silent: this runs in the background, the Health page still has the manual button */
    } finally {
      running.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void maybeSync();
    const onVisible = () => { if (document.visibilityState === "visible") void maybeSync(); };
    const onOnline = () => { void maybeSync(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => { void maybeSync(); }, CHECK_EVERY_MS);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [user, maybeSync]);
}
