import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { DailyCompletion } from "@/hooks/useDailyCompletions";

interface WeeklyProgressProps {
  history: DailyCompletion[];
  dashboardState?: {
    currentXP: number;
    currentLevel: number;
    streakDays: number;
    missionsCompleted: number;
  };
  onExportAll?: () => Promise<DailyCompletion[]>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

async function exportProgressCSV(dashboardState?: WeeklyProgressProps["dashboardState"], onExportAll?: () => Promise<DailyCompletion[]>) {
  const allHistory = onExportAll ? await onExportAll() : [];
  const lines: string[] = [];

  // Summary section
  if (dashboardState) {
    lines.push("=== Dashboard Summary ===");
    lines.push(`Level,${dashboardState.currentLevel}`);
    lines.push(`Total XP,${dashboardState.currentXP}`);
    lines.push(`Streak Days,${dashboardState.streakDays}`);
    lines.push(`Missions Completed Today,${dashboardState.missionsCompleted}`);
    lines.push("");
  }

  // Full history
  lines.push("=== Full Progress History ===");
  lines.push("Date,Missions Completed,XP Earned,Categories Engaged,Completed Missions");
  for (const day of allHistory) {
    lines.push([
      day.date,
      day.missions_completed,
      day.xp_earned,
      `"${day.categories_engaged.join(", ")}"`,
      `"${day.completed_mission_titles.join(", ")}"`,
    ].join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dashboard-progress-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WeeklyProgress({ history, dashboardState, onExportAll }: WeeklyProgressProps) {
  const [collapsed, setCollapsed] = useState(false);

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
      className="glass-card p-6 mb-8 mt-8"
    >
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-lg font-bold text-foreground hover:text-primary transition-colors"
        >
          📅 Weekly Progress
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-3">
          {!collapsed && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span><strong className="text-stat-value font-mono">{totalXP}</strong> XP</span>
              <span><strong className="text-stat-value font-mono">{totalMissions}</strong> missions</span>
              <span><strong className="text-stat-value font-mono">{activeDays}</strong>/7 days</span>
            </div>
          )}
          <button
            onClick={() => exportProgressCSV(dashboardState, onExportAll)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title="Download progress as CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            {/* Bar chart */}
            <div className="flex items-end gap-2 h-28 mt-4">
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
        )}
      </AnimatePresence>
    </motion.div>
  );
}
