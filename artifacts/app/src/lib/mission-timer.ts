import { useSyncExternalStore } from "react";

/**
 * One timer at a time, for one Home mission. It lives in localStorage so a
 * reload or a closed tab does not lose it. While it runs it also counts the
 * time the app was hidden (another tab, a locked phone): only as a quiet hint
 * at the end. The user decides how long it really took.
 */
export interface RunningTimer {
  categoryId: string;
  index: number;
  /** The title shown when it started: on stop, the mission at `index` must still carry it. */
  title: string;
  startedAt: number;
  /** Milliseconds the page was hidden while the timer ran (a hint, not a deduction). */
  hiddenMs: number;
  /** When the page went hidden (null while visible). */
  hiddenSince: number | null;
}

const KEY = "mf.missionTimer";
let current: RunningTimer | null = read();
const listeners = new Set<() => void>();

function read(): RunningTimer | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as RunningTimer) : null;
  } catch {
    return null;
  }
}
function write(t: RunningTimer | null) {
  current = t;
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the timer still runs for this page */ }
  listeners.forEach((l) => l());
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!current) return;
    const now = Date.now();
    if (document.hidden) write({ ...current, hiddenSince: now });
    else if (current.hiddenSince) write({ ...current, hiddenMs: current.hiddenMs + (now - current.hiddenSince), hiddenSince: null });
  });
}

export function startTimer(categoryId: string, index: number, title: string) {
  write({ categoryId, index, title, startedAt: Date.now(), hiddenMs: 0, hiddenSince: null });
}

/** Stops the timer and gives what it measured; null when none runs. */
export function stopTimer(now = Date.now()): { timer: RunningTimer; elapsedMin: number; hiddenMin: number } | null {
  const t = current;
  if (!t) return null;
  const hidden = t.hiddenMs + (t.hiddenSince ? now - t.hiddenSince : 0);
  write(null);
  return { timer: t, elapsedMin: Math.max(0, (now - t.startedAt) / 60000), hiddenMin: Math.max(0, hidden / 60000) };
}

export function cancelTimer() {
  write(null);
}

export function useMissionTimer(): RunningTimer | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
    () => null,
  );
}

/**
 * The value the stop prompt starts from: the measured time, minus hidden time
 * only when it is a real part of it (5 min or more). A timer left running far
 * past the plan is not trusted: it starts from the plan instead.
 */
export function suggestedMinutes(elapsedMin: number, hiddenMin: number, plannedMin: number | null): { value: number; reason: "measured" | "hidden" | "plan" } {
  const elapsed = Math.round(elapsedMin);
  if (plannedMin && elapsed > Math.max(plannedMin * 3, plannedMin + 120)) return { value: plannedMin, reason: "plan" };
  if (hiddenMin >= 5 && hiddenMin < elapsedMin) return { value: Math.max(1, Math.round(elapsedMin - hiddenMin)), reason: "hidden" };
  return { value: Math.max(1, elapsed), reason: "measured" };
}
