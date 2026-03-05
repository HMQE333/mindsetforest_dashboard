import { motion } from "framer-motion";
import { DailyCompletion } from "@/hooks/useDailyCompletions";

interface WeeklyProgressProps {
  history: DailyCompletion[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeeklyProgress({ history }: WeeklyProgressProps) {
  if (history.length === 0) return null;

  const maxXP = Math.max(...history.map(d => d.xp_earned), 1);
  const totalXP = history.reduce((s, d) => s + d.xp_earned, 0);
  const totalMissions = history.reduce((s, d) => s + d.missions_completed, 0);
  const activeDays = history.filter(d => d.missions_completed > 0).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="glass-card p-6 mb-8"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          📅 Weekly Progress
        </h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span><strong className="text-stat-value font-mono">{totalXP}</strong> XP</span>
          <span><strong className="text-stat-value font-mono">{totalMissions}</strong> missions</span>
          <span><strong className="text-stat-value font-mono">{activeDays}</strong>/7 days</span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-28">
        {history.map((day, i) => {
          const d = new Date(day.date + "T12:00:00");
          const label = DAY_LABELS[d.getDay()];
          const isToday = i === history.length - 1;
          const barHeight = day.xp_earned > 0 ? Math.max((day.xp_earned / maxXP) * 100, 8) : 4;

          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              {day.xp_earned > 0 && (
                <span className="text-[10px] font-bold text-stat-value font-mono">
                  {day.xp_earned}
                </span>
              )}
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${barHeight}%` }}
                transition={{ delay: 0.1 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`w-full rounded-lg transition-colors ${
                  day.xp_earned > 0
                    ? isToday
                      ? "gradient-purple glow-sm"
                      : "bg-primary/40"
                    : "bg-white/5"
                }`}
                style={{ minHeight: 4 }}
                title={`${day.date}: ${day.xp_earned} XP, ${day.missions_completed} missions`}
              />
              <span className={`text-[10px] font-medium ${
                isToday ? "text-primary" : "text-muted-foreground"
              }`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
