import { useSyncExternalStore } from "react";

/**
 * Mission timers that remember. Work often happens in pieces: pausing keeps
 * the time, the next start adds to it, and only "Finish" (or ticking the
 * mission) asks how long it really took. One timer runs at a time; starting
 * another pauses the running one. Kept in localStorage, so a reload, a closed
 * tab or the next day does not lose a paused total.
 *
 * While a timer runs it also counts the time the app was hidden (another tab,
 * a locked phone): only as a quiet hint at the end. The user decides.
 */
export interface MissionTimer {
  categoryId: string;
  index: number;
  /** The title shown when it started: on finish, the mission at `index` must still carry it. */
  title: string;
  /** Time from earlier pieces. */
  accumulatedMs: number;
  /** When the current piece started; null while paused. */
  runningSince: number | null;
  /** Milliseconds the page was hidden while it ran (a hint, not a deduction). */
  hiddenMs: number;
  /** When the page went hidden during the current piece (null while visible). */
  hiddenSince: number | null;
  /** Day key of the first piece (shown when a paused timer is from an earlier day). */
  firstDay: string;
}

export const timerKey = (categoryId: string, index: number) => `${categoryId}-${index}`;

const KEY = "mf.missionTimers";
const OLD_KEY = "mf.missionTimer";
let timers: Record<string, MissionTimer> = read();
const listeners = new Set<() => void>();

function read(): Record<string, MissionTimer> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, MissionTimer>;
    // A timer from the first version (one running timer) carries over.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old);
      localStorage.removeItem(OLD_KEY);
      const t: MissionTimer = { categoryId: o.categoryId, index: o.index, title: o.title, accumulatedMs: 0, runningSince: o.startedAt, hiddenMs: o.hiddenMs ?? 0, hiddenSince: o.hiddenSince ?? null, firstDay: "" };
      return { [timerKey(t.categoryId, t.index)]: t };
    }
  } catch { /* unreadable: start clean */ }
  return {};
}
function write(next: Record<string, MissionTimer>) {
  timers = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: still works for this page */ }
  listeners.forEach((l) => l());
}

/** Close the running piece of a timer into its total. */
function paused(t: MissionTimer, now: number): MissionTimer {
  if (t.runningSince == null) return t;
  const hidden = t.hiddenSince ? now - t.hiddenSince : 0;
  return { ...t, accumulatedMs: t.accumulatedMs + (now - t.runningSince), runningSince: null, hiddenMs: t.hiddenMs + hidden, hiddenSince: null };
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const now = Date.now();
    let changed = false;
    const next: Record<string, MissionTimer> = {};
    for (const [k, t] of Object.entries(timers)) {
      if (t.runningSince == null) { next[k] = t; continue; }
      changed = true;
      if (document.hidden) next[k] = { ...t, hiddenSince: now };
      else next[k] = t.hiddenSince ? { ...t, hiddenMs: t.hiddenMs + (now - t.hiddenSince), hiddenSince: null } : t;
    }
    if (changed) write(next);
  });
}

/** Total time of a timer so far. */
export const elapsedMs = (t: MissionTimer, now = Date.now()) => t.accumulatedMs + (t.runningSince != null ? now - t.runningSince : 0);

/** Start (or resume) a mission's timer; any other running timer is paused, its time kept. */
export function startTimer(categoryId: string, index: number, title: string, day: string, now = Date.now()) {
  const next: Record<string, MissionTimer> = {};
  for (const [k, t] of Object.entries(timers)) next[k] = paused(t, now);
  const k = timerKey(categoryId, index);
  const t = next[k];
  next[k] = t && t.title === title
    ? { ...t, runningSince: now }
    : { categoryId, index, title, accumulatedMs: 0, runningSince: now, hiddenMs: 0, hiddenSince: null, firstDay: day };
  write(next);
}

export function pauseTimer(categoryId: string, index: number, now = Date.now()) {
  const k = timerKey(categoryId, index);
  if (!timers[k]) return;
  write({ ...timers, [k]: paused(timers[k], now) });
}

/** Ends a timer and gives what it measured; null when it has none. */
export function finishTimer(categoryId: string, index: number, now = Date.now()): { timer: MissionTimer; elapsedMin: number; hiddenMin: number } | null {
  const k = timerKey(categoryId, index);
  const t = timers[k];
  if (!t) return null;
  const done = paused(t, now);
  const { [k]: _gone, ...rest } = timers;
  write(rest);
  return { timer: t, elapsedMin: done.accumulatedMs / 60000, hiddenMin: done.hiddenMs / 60000 };
}

export function discardTimer(categoryId: string, index: number) {
  const { [timerKey(categoryId, index)]: _gone, ...rest } = timers;
  write(rest);
}

/** All timers (running and paused). */
export function useMissionTimers(): Record<string, MissionTimer> {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => timers,
    () => timers,
  );
}

/**
 * The value the finish card starts from: the measured time, minus hidden time
 * only when it is a real part of it (5 min or more). A total far past the
 * plan is not trusted: it starts from the plan instead.
 */
export function suggestedMinutes(elapsedMin: number, hiddenMin: number, plannedMin: number | null): { value: number; reason: "measured" | "hidden" | "plan" } {
  const elapsed = Math.round(elapsedMin);
  if (plannedMin && elapsed > Math.max(plannedMin * 3, plannedMin + 120)) return { value: plannedMin, reason: "plan" };
  if (hiddenMin >= 5 && hiddenMin < elapsedMin) return { value: Math.max(1, Math.round(elapsedMin - hiddenMin)), reason: "hidden" };
  return { value: Math.max(1, elapsed), reason: "measured" };
}
