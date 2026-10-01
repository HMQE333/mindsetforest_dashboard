import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { monthKey } from "@/lib/today";

/**
 * The month's goals ("monthly focus"), rows of user_notifications for a
 * month. Set in the monthly review, shown in daily reviews and in the bell
 * inbox; the first three are "the three most important goals".
 */
export interface FocusItem {
  id: string;
  title: string;
}

export const MONTHLY_FOCUS_CHANGED_EVENT = "monthly-focus-changed";
export const FOCUS_SHOWN = 3;

export function useMonthlyFocus(month: string = monthKey()) {
  const { user } = useAuth();
  const [items, setItems] = useState<FocusItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("user_notifications")
      .select("id,title,created_at")
      .eq("user_id", user.id)
      .eq("month", month)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    if (!error) setItems((data || []).map((d) => ({ id: d.id, title: d.title })));
    setLoading(false);
  }, [user, month]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onChange = () => { void load(); };
    window.addEventListener(MONTHLY_FOCUS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(MONTHLY_FOCUS_CHANGED_EVENT, onChange);
  }, [load]);

  const changed = () => window.dispatchEvent(new CustomEvent(MONTHLY_FOCUS_CHANGED_EVENT));

  const add = useCallback(async (title: string) => {
    const t = title.trim();
    if (!user || !t) return false;
    const { error } = await supabase.from("user_notifications").insert({ user_id: user.id, title: t.slice(0, 200), month });
    if (error) return false;
    changed();
    return true;
  }, [user, month]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("user_notifications").delete().eq("id", id);
    if (error) return false;
    changed();
    return true;
  }, []);

  /** Make the month's goals exactly these, in this order (empty lines dropped). */
  const setAll = useCallback(async (titles: string[]) => {
    if (!user) return false;
    const clean = titles.map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 200));
    const { error: delError } = await supabase.from("user_notifications").delete().eq("user_id", user.id).eq("month", month);
    if (delError) return false;
    if (clean.length > 0) {
      // created_at spaced by a millisecond keeps the order the user wrote them in.
      const base = Date.now();
      const rows = clean.map((title, i) => ({ user_id: user.id, title, month, created_at: new Date(base + i).toISOString() }));
      const { error } = await supabase.from("user_notifications").insert(rows);
      if (error) return false;
    }
    changed();
    return true;
  }, [user, month]);

  return { items, top: items.slice(0, FOCUS_SHOWN), loading, add, remove, setAll, reload: load };
}

/** The month name for a "YYYY-MM" key, e.g. "October". */
export function monthName(month: string = monthKey()): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 15).toLocaleString("en-US", { month: "long" });
}
