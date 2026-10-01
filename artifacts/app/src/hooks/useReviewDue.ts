import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { todayKey } from "@/lib/today";
import { monthlyDue, previousMonth, reviewDay, type ReviewKind } from "@/lib/review-data";
import { REVIEWS_CHANGED_EVENT } from "@/lib/app-events";

/**
 * Which reviews are waiting, for the bell inbox: the same rule as Home's
 * review (yesterday; last month in the first days of a month), without the
 * auto-open, the numbers or the AI questions.
 */
export function useReviewDue() {
  const { user } = useAuth();
  const [answered, setAnswered] = useState<{ kind: ReviewKind; period: string }[] | null>(null);
  const [day, setDay] = useState(todayKey);

  const load = useCallback(async () => {
    if (!user) { setAnswered(null); return; }
    const { data, error } = await supabase
      .from("reviews")
      .select("kind,period")
      .eq("user_id", user.id)
      .order("period", { ascending: false })
      .limit(60);
    // A failed read shows nothing rather than reviews that may be done already.
    if (!error) setAnswered((data || []) as { kind: ReviewKind; period: string }[]);
  }, [user]);

  useEffect(() => { void load(); }, [load, day]);
  useEffect(() => {
    const onChange = () => { void load(); };
    window.addEventListener(REVIEWS_CHANGED_EVENT, onChange);
    // The app's day turns at 04:00; check once a minute so a new review shows up.
    const timer = window.setInterval(() => setDay(todayKey()), 60_000);
    return () => { window.removeEventListener(REVIEWS_CHANGED_EVENT, onChange); window.clearInterval(timer); };
  }, [load]);

  return useMemo(() => {
    if (!answered) return [];
    const has = (kind: ReviewKind, period: string) => answered.some((r) => r.kind === kind && r.period === period);
    const yesterday = reviewDay(day);
    const lastMonth = previousMonth(day);
    const due: { kind: ReviewKind; period: string }[] = [];
    if (!has("daily", yesterday)) due.push({ kind: "daily", period: yesterday });
    if (monthlyDue(day) && !has("monthly", lastMonth)) due.push({ kind: "monthly", period: lastMonth });
    return due;
  }, [answered, day]);
}
