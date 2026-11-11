import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { elapsedMs, pauseTimer, startTimer, timerKey, useMissionTimers } from "@/lib/mission-timer";
import { todayKey } from "@/lib/today";

/** Asks the Home view to finish a mission's timer and open its quiet "how long?" card. */
export const MISSION_TIMER_FINISH_EVENT = "mf:mission-timer-finish";
export const requestTimerFinish = (categoryId: string, index: number) =>
  window.dispatchEvent(new CustomEvent(MISSION_TIMER_FINISH_EVENT, { detail: { categoryId, index } }));

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Ticks once a second while `on`. */
export function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/**
 * ▶ on a mission. Running: ⏸ and the time (pause keeps it). Paused with time
 * kept: ▶ and the total, to go on. Finishing is in the timer bar or by ticking.
 */
export default function MissionTimerButton({ categoryId, index, title, size = "md" }: { categoryId: string; index: number; title: string; size?: "sm" | "md" }) {
  const timers = useMissionTimers();
  const t = timers[timerKey(categoryId, index)];
  const mine = t && t.title === title ? t : undefined;
  const running = mine?.runningSince != null;
  const now = useNow(running);
  const box = size === "sm" ? "h-6 px-1.5 rounded-md" : "h-8 px-2 rounded-lg border-2 border-white/15";
  if (running) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); pauseTimer(categoryId, index); }}
        className={`${box} flex items-center gap-1 bg-primary/15 text-primary text-xs font-semibold tabular-nums hover:bg-primary/25 transition-all`}
        title="Pause (the time is kept)"
        aria-label="Pause the timer"
      >
        <Pause className="h-3 w-3 fill-current" /> {clock(elapsedMs(mine!, now))}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); startTimer(categoryId, index, title, todayKey()); }}
      className={`${box} flex items-center justify-center gap-1 bg-white/5 text-xs tabular-nums transition-all hover:bg-primary/15 ${mine ? "text-foreground/70" : "text-foreground/50 hover:text-foreground"}`}
      title={mine ? "Go on (adds to the time kept)" : "Start a timer for this mission"}
      aria-label={mine ? "Resume the timer" : "Start a timer"}
    >
      <Play className="h-3.5 w-3.5" />{mine && <span>{clock(mine.accumulatedMs)}</span>}
    </button>
  );
}
