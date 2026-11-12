import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { rowToSeries, splitReminders, type Reminder, type ReminderSeries, type RepeatRule } from "@/lib/reminders";

/** Window event: a reminder was added, dismissed or deleted (also by the assistant). */
export const REMINDERS_CHANGED_EVENT = "reminders-changed";

/** The user's open reminders (not dismissed), split into arrived and still waiting. */
export function useReminders() {
  const { user } = useAuth();
  const [list, setList] = useState<Reminder[]>([]);
  const [series, setSeries] = useState<ReminderSeries[]>([]);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async (roll = false) => {
    if (!user) { setList([]); setSeries([]); return; }
    // Repeating reminders are made ahead (35 days) by the database; topped up on each load.
    if (roll) await supabase.rpc("roll_reminder_series" as never);
    const { data: rows } = await supabase.from("reminder_series" as never).select("id,message,freq,days,month_day,at_time,active").eq("user_id", user.id);
    setSeries(((rows ?? []) as never[]).map((x) => rowToSeries(x)).filter((x): x is ReminderSeries => !!x && x.active));
    const { data, error } = await supabase
      .from("reminders")
      .select("id,message,deliver_at,created_at,series_id" as "id,message,deliver_at,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("deliver_at", { ascending: true })
      .limit(500);
    if (!error) setList((data || []).map((r) => ({ id: r.id, message: r.message, deliverAt: r.deliver_at, createdAt: r.created_at, seriesId: (r as { series_id?: string | null }).series_id ?? null })));
  }, [user]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const onChange = () => { void load(); };
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChange);
    // A reminder arrives on the minute it is set for, while the app is open.
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => { window.removeEventListener(REMINDERS_CHANGED_EVENT, onChange); window.clearInterval(timer); };
  }, [load]);

  const changed = () => window.dispatchEvent(new CustomEvent(REMINDERS_CHANGED_EVENT));

  const add = useCallback(async (message: string, deliverAt: Date) => {
    const text = message.trim();
    if (!user || !text || Number.isNaN(deliverAt.getTime())) return false;
    const { error } = await supabase.from("reminders").insert({ user_id: user.id, message: text.slice(0, 2000), deliver_at: deliverAt.toISOString() });
    if (error) return false;
    changed();
    return true;
  }, [user]);

  /** A repeating reminder: the rule is saved, its times are made by the database. */
  const addSeries = useCallback(async (message: string, rule: RepeatRule) => {
    const text = message.trim();
    if (!user || !text) return false;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Warsaw";
    const { error } = await supabase.from("reminder_series" as never).insert({
      user_id: user.id,
      message: text.slice(0, 2000),
      freq: rule.freq,
      days: rule.freq === "weekly" ? rule.days : [],
      month_day: rule.freq === "monthly" ? rule.monthDay : null,
      at_time: rule.time,
      tz,
    } as never);
    if (error) return false;
    await load(true);
    changed();
    return true;
  }, [user, load]);

  /** Stops a repeating reminder: its future times go, the ones already shown stay in history. */
  const stopSeries = useCallback(async (id: string) => {
    const { error } = await supabase.from("reminder_series" as never).update({ active: false } as never).eq("id", id);
    if (error) return false;
    await load(true);
    changed();
    return true;
  }, [load]);

  const dismiss = useCallback(async (id: string) => {
    const { error } = await supabase.from("reminders").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
    if (error) return false;
    changed();
    return true;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) return false;
    changed();
    return true;
  }, []);

  const { due, upcoming } = useMemo(() => splitReminders(list, now), [list, now]);
  return { due, upcoming, series, add, addSeries, stopSeries, dismiss, remove };
}
