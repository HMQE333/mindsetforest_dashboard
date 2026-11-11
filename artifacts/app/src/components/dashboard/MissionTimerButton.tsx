import { useEffect, useState } from "react";
import { Play, Square } from "lucide-react";
import { startTimer, useMissionTimer } from "@/lib/mission-timer";

/** Asks the Home view to stop the running timer and open its quiet "how long?" card. */
export const MISSION_TIMER_STOP_EVENT = "mf:mission-timer-stop";
export const requestTimerStop = () => window.dispatchEvent(new CustomEvent(MISSION_TIMER_STOP_EVENT));

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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/**
 * ▶ on a mission: starts its timer (one at a time; starting another stops the
 * running one first, through its card). While it runs here it shows the time
 * and a stop square.
 */
export default function MissionTimerButton({ categoryId, index, title, size = "md" }: { categoryId: string; index: number; title: string; size?: "sm" | "md" }) {
  const timer = useMissionTimer();
  const mine = !!timer && timer.categoryId === categoryId && timer.index === index;
  const now = useNow(mine);
  const box = size === "sm" ? "h-6 px-1.5 rounded-md" : "h-8 px-2 rounded-lg border-2 border-white/15";
  if (mine) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); requestTimerStop(); }}
        className={`${box} flex items-center gap-1 bg-primary/15 text-primary text-xs font-semibold tabular-nums hover:bg-primary/25 transition-all`}
        title="Stop the timer"
        aria-label="Stop the timer"
      >
        <Square className="h-3 w-3 fill-current" /> {clock(now - timer!.startedAt)}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (timer) requestTimerStop();
        startTimer(categoryId, index, title);
      }}
      className={`${box} flex items-center justify-center bg-white/5 text-foreground/50 hover:text-foreground hover:bg-primary/15 transition-all`}
      title="Start a timer for this mission"
      aria-label="Start a timer"
    >
      <Play className="h-3.5 w-3.5" />
    </button>
  );
}
