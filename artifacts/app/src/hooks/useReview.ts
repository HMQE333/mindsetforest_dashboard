import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { monthKey, todayKey } from "@/lib/today";
import { loadReviewSnapshot } from "@/lib/review-load";
import { LAUNCH_SETTLED_EVENT, launchHoldsPopups } from "@/lib/launch";
import { REVIEWS_CHANGED_EVENT, emitAppEvent } from "@/lib/app-events";
import {
  monthlyDue,
  previousMonth,
  reviewDay,
  reviewStreak,
  savedQuestions,
  type ReviewKind,
  type ReviewSnapshot,
} from "@/lib/review-data";

export interface ReviewQuestion {
  id: string;
  question: string;
  suggestions: string[];
}

export interface ReviewTarget {
  kind: ReviewKind;
  period: string;
}

const MISSING_TABLE = /PGRST205|42P01|schema cache/;
/** Window event asking Home to open a review: detail = ReviewTarget. */
export const OPEN_REVIEW_EVENT = "lov:open-review";
let pendingReview: ReviewTarget | null = null;
/**
 * Open a review from outside Home (the bell). Home may not be mounted yet,
 * so the request waits until it is.
 */
export function requestReview(t: ReviewTarget): void {
  pendingReview = t;
  window.dispatchEvent(new CustomEvent(OPEN_REVIEW_EVENT));
}
const qKey = (t: ReviewTarget) => `mf-review-q-${t.kind}-${t.period}`;
const laterKey = (t: ReviewTarget) => `mf-review-later-${t.kind}-${t.period}`;
const AUTO_KEY = "mf-review-auto";
const NO_ANSWERS: Record<string, string> = {};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/**
 * The morning review loop. On Home it works out which reviews are due
 * (yesterday; and last month during the first ten days of a month), opens the
 * first one automatically once a day unless the user said "later", loads the
 * numbers and the AI questions, and saves the answers.
 */
export function useReview() {
  const { user } = useAuth();
  const [tableReady, setTableReady] = useState(true);
  const [answered, setAnswered] = useState<{ kind: ReviewKind; period: string; status: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [headline, setHeadline] = useState("");
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsError, setQuestionsError] = useState(false);
  // Answers of a review saved earlier, filled back in when it is reopened.
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>(NO_ANSWERS);
  const [autoOpen, setAutoOpenState] = useState<boolean>(() => readJson<boolean>(AUTO_KEY) ?? true);
  // Bumped by every start(), so a slow load for a review the user already left
  // cannot fill in the one on screen.
  const startSeq = useRef(0);
  // The pending auto-open, cancelled when the review is opened by hand first.
  const autoTimer = useRef<number | null>(null);

  const today = todayKey();
  const yesterday = reviewDay(today);
  const lastMonth = previousMonth(today);

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("reviews")
      .select("kind,period,status")
      .eq("user_id", user.id)
      .order("period", { ascending: false })
      .limit(120);
    if (error) {
      if (MISSING_TABLE.test(`${error.code} ${error.message}`)) {
        setTableReady(false);
        setLoaded(true);
      }
      // Any other failure keeps the last list read (or none): working out what
      // is due from an empty list would re-open reviews that are already done.
      return;
    }
    setTableReady(true);
    setAnswered((data || []) as { kind: ReviewKind; period: string; status: string }[]);
    setLoaded(true);
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const has = useCallback(
    (kind: ReviewKind, period: string) => answered.some((r) => r.kind === kind && r.period === period),
    [answered],
  );

  /** Reviews waiting for an answer, in the order they are offered. */
  const due = useMemo<ReviewTarget[]>(() => {
    if (!loaded || !tableReady) return [];
    const list: ReviewTarget[] = [];
    if (!has("daily", yesterday)) list.push({ kind: "daily", period: yesterday });
    if (monthlyDue(today) && !has("monthly", lastMonth)) list.push({ kind: "monthly", period: lastMonth });
    return list;
  }, [loaded, tableReady, has, yesterday, lastMonth, today]);

  const streak = useMemo(
    () => reviewStreak(answered.filter((r) => r.kind === "daily" && r.status === "done").map((r) => r.period), yesterday),
    [answered, yesterday],
  );

  const loadQuestions = useCallback(async (t: ReviewTarget, snap: ReviewSnapshot, force = false) => {
    const cached = force ? null : readJson<{ headline: string; questions: ReviewQuestion[] }>(qKey(t));
    if (cached && cached.questions?.length) {
      setHeadline(cached.headline);
      setQuestions(cached.questions);
      return;
    }
    const seq = startSeq.current;
    setQuestionsLoading(true);
    setQuestionsError(false);
    try {
      const now = new Date();
      // This month's goals go along; every third day one daily question is about them.
      const { data: focusRows } = await supabase
        .from("user_notifications")
        .select("title,created_at")
        .eq("month", monthKey())
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(3);
      const focus = (focusRows || []).map((r) => r.title);
      const { data, error } = await supabase.functions.invoke("ai-review", {
        body: {
          kind: t.kind,
          period: t.period,
          snapshot: snap,
          moment: { date: today, hour: now.getHours(), tzOffsetMinutes: -now.getTimezoneOffset() },
          focus,
          mentionFocus: Number(today.slice(8, 10)) % 3 === 0,
        },
      });
      if (error || !data || !Array.isArray(data.questions) || data.questions.length === 0) throw new Error("no questions");
      const result = { headline: String(data.headline || ""), questions: data.questions as ReviewQuestion[] };
      writeJson(qKey(t), result);
      if (seq !== startSeq.current) return;
      setHeadline(result.headline);
      setQuestions(result.questions);
    } catch {
      if (seq !== startSeq.current) return;
      setQuestionsError(true);
      // Still usable without AI: the classic three.
      setQuestions(
        t.kind === "monthly"
          ? [
              { id: "q1", question: "What did you get done this month?", suggestions: [] },
              { id: "q2", question: "Where did your time really go?", suggestions: [] },
              { id: "q3", question: "What do you take into next month, and what do you leave behind?", suggestions: [] },
            ]
          : [
              { id: "q1", question: "Where did your time really go yesterday?", suggestions: [] },
              { id: "q2", question: "What worked, and what didn't?", suggestions: [] },
              { id: "q3", question: "What matters most today?", suggestions: [] },
            ],
      );
    } finally {
      if (seq === startSeq.current) setQuestionsLoading(false);
    }
  }, [today]);

  const start = useCallback(async (t: ReviewTarget) => {
    if (!user) return;
    // Opened by hand before the auto-open fired: don't open (and ask the AI) twice.
    if (autoTimer.current !== null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    const seq = ++startSeq.current;
    setTarget(t);
    setSnapshot(null);
    setHeadline("");
    setQuestions([]);
    setQuestionsLoading(false);
    setQuestionsError(false);
    setInitialAnswers(NO_ANSWERS);
    setOpen(true);
    const [snap, saved] = await Promise.all([
      loadReviewSnapshot(user.id, t.kind, t.period),
      supabase.from("reviews").select("headline,qa").eq("user_id", user.id).eq("kind", t.kind).eq("period", t.period).maybeSingle(),
    ]);
    if (seq !== startSeq.current) return;
    setSnapshot(snap);
    // Answered before: bring its questions and answers back, so saving again
    // keeps or edits them instead of writing a blank set over them.
    const prior = savedQuestions(saved.data?.qa);
    if (prior) {
      setHeadline(saved.data?.headline || "");
      setQuestions(prior.questions);
      setInitialAnswers(prior.answers);
      return;
    }
    void loadQuestions(t, snap);
  }, [user, loadQuestions]);

  // Open the first due review once per day, unless "later" was chosen or auto-open is off.
  // When the app was opened straight into the assistant by a link, it waits
  // until the assistant is closed (it would cover it and block "Tap to talk").
  const [launchHold, setLaunchHold] = useState(launchHoldsPopups);
  useEffect(() => {
    const release = () => setLaunchHold(false);
    window.addEventListener(LAUNCH_SETTLED_EVENT, release);
    return () => window.removeEventListener(LAUNCH_SETTLED_EVENT, release);
  }, []);
  useEffect(() => {
    if (!autoOpen || open || due.length === 0 || launchHold) return;
    const first = due[0];
    if (readJson<string>(laterKey(first)) === today) return;
    const t = window.setTimeout(() => { autoTimer.current = null; void start(first); }, 900);
    autoTimer.current = t;
    return () => {
      window.clearTimeout(t);
      if (autoTimer.current === t) autoTimer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, due.length, due[0]?.kind, due[0]?.period, launchHold]);

  const write = useCallback(async (status: "done" | "skipped", qa: { question: string; answer: string }[]) => {
    if (!user || !target) return false;
    const row = {
      user_id: user.id,
      kind: target.kind,
      period: target.period,
      status,
      headline,
      snapshot: (snapshot ?? {}) as never,
      qa: qa as never,
      updated_at: new Date().toISOString(),
    };
    // A skip only records that the period was seen. It is insert-only, so it can
    // never overwrite a review that was already answered.
    const { error } = await supabase
      .from("reviews")
      .upsert(row, { onConflict: "user_id,kind,period", ignoreDuplicates: status === "skipped" });
    if (error) return false;
    try { localStorage.removeItem(qKey(target)); } catch { /* ignore */ }
    await refresh();
    emitAppEvent(REVIEWS_CHANGED_EVENT);
    return true;
  }, [user, target, headline, snapshot, refresh]);

  const save = useCallback((qa: { question: string; answer: string }[]) => write("done", qa), [write]);
  const skip = useCallback(async () => {
    const ok = await write("skipped", []);
    if (ok) setOpen(false);
    return ok;
  }, [write]);
  const later = useCallback(() => {
    if (target) writeJson(laterKey(target), today);
    setOpen(false);
  }, [target, today]);
  const setAutoOpen = useCallback((v: boolean) => {
    setAutoOpenState(v);
    writeJson(AUTO_KEY, v);
  }, []);

  // The bell inbox asks for a review (it navigates to Home first, so the
  // request may be waiting when this mounts).
  useEffect(() => {
    const take = () => {
      const t = pendingReview;
      pendingReview = null;
      if (t) void start(t);
    };
    take();
    window.addEventListener(OPEN_REVIEW_EVENT, take);
    return () => window.removeEventListener(OPEN_REVIEW_EVENT, take);
  }, [start]);

  /** What the review button on Home opens: the first due review, else yesterday's again. */
  const openLatest = useCallback(() => {
    void start(due[0] ?? { kind: "daily", period: yesterday });
  }, [due, start, yesterday]);

  const next = due.find((d) => !target || d.kind !== target.kind || d.period !== target.period) ?? null;

  return {
    tableReady,
    open,
    setOpen,
    target,
    snapshot,
    headline,
    questions,
    initialAnswers,
    questionsLoading,
    questionsError,
    retryQuestions: () => { if (target && snapshot) void loadQuestions(target, snapshot, true); },
    due,
    next,
    streak,
    start,
    save,
    skip,
    later,
    openLatest,
    autoOpen,
    setAutoOpen,
  };
}
