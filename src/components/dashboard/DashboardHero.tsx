import { motion } from "framer-motion";
import { DashboardState } from "@/hooks/useDashboardState";

interface DashboardHeroProps {
  state: DashboardState;
  onResetDay: () => void;
  onShowShortcuts: () => void;
}

export default function DashboardHero({ state, onResetDay, onShowShortcuts }: DashboardHeroProps) {
  const xpForLevel = state.currentXP % 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="text-center mb-8"
    >
      {/* Streak Badge */}
      <div className="inline-flex items-center gap-3 px-8 py-4 rounded-3xl gradient-purple border-2 border-primary/40 glow-md animate-pulse-glow mb-6">
        <span className="text-3xl animate-fire">🔥</span>
        <span className="text-xl font-bold text-primary-foreground">
          {state.streakDays} Day Streak
        </span>
      </div>

      {/* XP Bar */}
      <div className="max-w-[600px] mx-auto mb-8">
        <div className="flex justify-between items-center mb-3">
          <span className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-base font-bold glow-sm">
            Level {state.currentLevel}
          </span>
          <span className="text-accent-foreground font-semibold">
            {xpForLevel} / 100 XP
          </span>
        </div>
        <div className="h-6 bg-primary/10 rounded-xl border-2 border-primary/30 overflow-hidden relative">
          <motion.div
            className="h-full gradient-purple rounded-xl relative overflow-hidden"
            initial={{ width: 0 }}
            animate={{ width: `${xpForLevel}%` }}
            transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="absolute inset-0 animate-shimmer" />
          </motion.div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex justify-center gap-6 flex-wrap mb-6">
        {[
          { value: state.currentXP, label: "Total XP" },
          { value: state.missionsCompleted, label: "Missions Done" },
          { value: state.categoriesEngaged.size, label: "Categories" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-card px-6 py-4 text-center min-w-[150px]"
          >
            <span className="text-2xl font-bold text-stat-value font-mono block">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          onClick={onResetDay}
          className="glass-card px-6 py-3 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          title="Click to reset today's progress"
        >
          🔄 Reset Day
        </button>
        <button
          onClick={onShowShortcuts}
          className="glass-card px-4 py-3 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          title="Keyboard shortcuts (?)"
        >
          ⌨️
        </button>
      </div>
    </motion.div>
  );
}
