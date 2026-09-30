import { addDays, dayKey, todayKey } from "@/lib/today";
import type { KindSeconds } from "@/lib/app-usage-classify";

/**
 * Pure parts of the daily / monthly review: which period is due, what the
 * summary screen shows, and the review streak. The loaders that fill a
 * ReviewSnapshot live in review-load.ts (they need Supabase).
 */

export type ReviewKind = "daily" | "monthly";

export interface ReviewSnapshot {
  kind: ReviewKind;
  /** "YYYY-MM-DD" (daily) or "YYYY-MM" (monthly). */
  period: string;
  /** Days the period covers (1 for daily). */
  days: number;
  xp: number;
  missions: number;
  missionTitles: string[];
  /** Days with at least one completion (monthly). */
  activeDays: number;
  paths: { path: string; step: string; count: number }[];
  pathStepsFinished: string[];
  metrics: { label: string; unit: string; value: number; icon?: string }[];
  computer: {
    total: number;
    byKind: KindSeconds;
    unassigned: number;
    focusRatio: number | null;
    topApps: { name: string; seconds: number; kind: string | null }[];
  } | null;
  sleep: { avgMinutes: number | null; avgScore: number | null; avgHrv: number | null; avgRestingHr: number | null; steps: number | null; nights: number } | null;
  spend: { total: number; count: number; top: { label: string; amount: number }[] } | null;
  events: string[];
}

export function emptySnapshot(kind: ReviewKind, period: string, days = 1): ReviewSnapshot {
  return {
    kind, period, days, xp: 0, missions: 0, missionTitles: [], activeDays: 0, paths: [], pathStepsFinished: [],
    metrics: [], computer: null, sleep: null, spend: null, events: [],
  };
}

/** The day a morning review is about: yesterday on the app's 04:00 clock. */
export function reviewDay(today: string = todayKey()): string {
  return addDays(today, -1);
}

/**
 * Whether a timestamp (e.g. a path step's done_at) falls between two day keys,
 * dated on the app's own clock (local time, 04:00 boundary) rather than by its
 * UTC date, so a step finished this morning is not counted in yesterday's review.
 */
export function withinDays(at: string | null | undefined, from: string, to: string): boolean {
  if (!at) return false;
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return false;
  const day = dayKey(t);
  return day >= from && day <= to;
}

/** "2026-09" for any day in September. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The month before the one `today` falls in. */
export function previousMonth(today: string = todayKey()): string {
  const [y, m] = today.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

/** First and last day of a "YYYY-MM" month. */
export function monthRange(month: string): { from: string; to: string; days: number } {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, "0")}`, days };
}

/** The monthly review is offered during the first ten days of the next month. */
export function monthlyDue(today: string = todayKey()): boolean {
  return Number(today.slice(8, 10)) <= 10;
}

/** Consecutive reviewed days ending with the most recent one (skips count as breaks). */
export function reviewStreak(donePeriods: Iterable<string>, lastDay: string = reviewDay()): number {
  const done = new Set(donePeriods);
  let day = done.has(lastDay) ? lastDay : addDays(lastDay, -1);
  let n = 0;
  while (done.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/**
 * A saved review reopened: its answered questions come back as the questions,
 * answers filled in, so saving again edits them instead of replacing them with
 * a blank set. Null when nothing usable was saved (a skip, or no answers).
 */
export function savedQuestions(qa: unknown): {
  questions: { id: string; question: string; suggestions: string[] }[];
  answers: Record<string, string>;
} | null {
  if (!Array.isArray(qa)) return null;
  const questions: { id: string; question: string; suggestions: string[] }[] = [];
  const answers: Record<string, string> = {};
  for (const item of qa as { question?: unknown; answer?: unknown }[]) {
    if (!item || typeof item.question !== "string" || !item.question.trim()) continue;
    const id = `saved-${questions.length + 1}`;
    questions.push({ id, question: item.question, suggestions: [] });
    answers[id] = typeof item.answer === "string" ? item.answer : "";
  }
  return questions.length > 0 ? { questions, answers } : null;
}

const pln = (n: number) => `${Math.round(n).toLocaleString("en-US")} zł`;

function hoursMinutes(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** One duration format everywhere on the review: "4h 42m", "48m". */
export function formatDuration(seconds: number): string {
  return hoursMinutes(seconds / 60);
}
const formatHm = formatDuration;

export type ReviewTone = "good" | "neutral" | "warn";

export interface ReviewTile {
  key: string;
  icon: string;
  label: string;
  value: string;
  detail: string;
  tone: ReviewTone;
}

/**
 * The summary screen, as at most six tiles. Tiles without data are left out
 * rather than shown as zeros, so the screen only says what actually happened.
 */
export function reviewTiles(s: ReviewSnapshot): ReviewTile[] {
  const tiles: ReviewTile[] = [];
  const monthly = s.kind === "monthly";

  tiles.push({
    key: "xp",
    icon: "⚡",
    label: monthly ? "XP this month" : "XP",
    value: `+${s.xp}`,
    detail: monthly
      ? `${s.missions} missions · ${s.activeDays}/${s.days} active days`
      : s.missions > 0 ? `${s.missions} ${s.missions === 1 ? "mission" : "missions"}` : "no missions",
    tone: s.missions > 0 ? "good" : "warn",
  });

  if (s.computer && s.computer.total > 0) {
    const productive = s.computer.byKind.work + s.computer.byKind.learning;
    const lost = s.computer.byKind.waste + s.computer.byKind.watching;
    const focus = s.computer.focusRatio;
    tiles.push({
      key: "focus",
      icon: "🎯",
      label: "Work & learning",
      value: formatHm(productive),
      detail: focus === null ? `of ${formatHm(s.computer.total)} at the computer` : `${Math.round(focus * 100)}% focus`,
      tone: focus === null ? "neutral" : focus >= 0.6 ? "good" : focus >= 0.4 ? "neutral" : "warn",
    });
    if (lost > 0) {
      const top = s.computer.topApps.find((a) => a.kind === "waste" || a.kind === "watching");
      tiles.push({
        key: "lost",
        icon: "📺",
        label: "Distractions",
        value: formatHm(lost),
        detail: top ? `most: ${top.name}` : "wasted and watching",
        tone: lost >= 2 * 3600 * s.days ? "warn" : "neutral",
      });
    }
  }

  if (s.sleep && (s.sleep.avgMinutes || s.sleep.avgScore)) {
    const mins = s.sleep.avgMinutes;
    tiles.push({
      key: "sleep",
      icon: "😴",
      label: monthly ? "Sleep (average)" : "Sleep",
      value: mins ? hoursMinutes(mins) : `${Math.round(s.sleep.avgScore ?? 0)}`,
      detail: [
        s.sleep.avgScore ? `score ${Math.round(s.sleep.avgScore)}` : null,
        s.sleep.avgHrv ? `HRV ${Math.round(s.sleep.avgHrv)}` : null,
      ].filter(Boolean).join(" · ") || "from the watch",
      tone: mins ? (mins >= 420 ? "good" : mins >= 360 ? "neutral" : "warn") : "neutral",
    });
  }

  const pathCount = s.paths.reduce((n, p) => n + p.count, 0);
  if (pathCount > 0 || s.pathStepsFinished.length > 0) {
    tiles.push({
      key: "paths",
      icon: "🪜",
      label: "Paths",
      value: monthly ? `${s.pathStepsFinished.length} steps` : `${pathCount}`,
      detail: monthly
        ? `${pathCount} days logged`
        : s.paths.map((p) => p.path).slice(0, 2).join(", "),
      tone: "good",
    });
  }

  if (s.spend && s.spend.total > 0) {
    tiles.push({
      key: "spend",
      icon: "💸",
      label: monthly ? "Spending" : "Spent",
      value: pln(s.spend.total),
      detail: s.spend.top[0] ? `most: ${s.spend.top[0].label}` : `${s.spend.count} transactions`,
      tone: "neutral",
    });
  }

  if (tiles.length < 6 && s.metrics.length > 0) {
    const m = s.metrics[0];
    tiles.push({
      key: "metrics",
      icon: m.icon || "📊",
      label: s.metrics.length > 1 ? "Stats" : m.label,
      value: `${Math.round(m.value * 10) / 10} ${m.unit}`,
      detail: s.metrics.length > 1 ? `${m.label} + ${s.metrics.length - 1} more` : "logged",
      tone: "good",
    });
  }

  return tiles.slice(0, 6);
}

/** "Tuesday, September 29" / "September 2026". */
export function periodLabel(kind: ReviewKind, period: string): string {
  if (kind === "monthly") {
    const [y, m] = period.split("-").map(Number);
    const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    return `${name} ${y}`;
  }
  const [y, m, d] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
