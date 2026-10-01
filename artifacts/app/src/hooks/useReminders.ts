import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { splitReminders, type Reminder } from "@/lib/reminders";

/** Window event: a reminder was added, dismissed or deleted (also by the assistant). */
export const REMINDERS_CHANGED_EVENT = "reminders-changed";

/** The user's open reminders (not dismissed), split into arrived and still waiting. */
export function useReminders() {
  const { user } = useAuth();
  const [list, setList] = useState<Reminder[]>([]);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!user) { setList([]); return; }
    const { data, error } = await supabase
      .from("reminders")
      .select("id,message,deliver_at,created_at")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("deliver_at", { ascending: true })
      .limit(500);
    if (!error) setList((data || []).map((r) => ({ id: r.id, message: r.message, deliverAt: r.deliver_at, createdAt: r.created_at })));
  }, [user]);

  useEffect(() => { void load(); }, [load]);
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
  return { due, upcoming, add, dismiss, remove };
}
