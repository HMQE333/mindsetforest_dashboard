import { motion } from "framer-motion";
import { TrackerEntry } from "@/hooks/useTrackerEntries";

interface TrackerOverviewBarProps {
  entries: TrackerEntry[];
  streak: number;
}

export default function TrackerOverviewBar({ entries, streak }: TrackerOverviewBarProps) {
  const today = new Date().toISOString().split("T")[0];
  const todayEntries = entries.filter((e) => e.date === today);
  const uniqueMetricsToday = new Set(todayEntries.map((e) => e.metricId)).size;
  const totalLogsToday = todayEntries.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="text-center mb-10"
    >
      <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl gradient-purple border-2 border-primary/40 glow-md animate-pulse-glow mb-6">
        <span className="text-2xl animate-fire">🔥</span>
        <span className="text-lg font-bold text-primary-foreground">{streak} Day Streak</span>
      </div>

      <div className="flex justify-center gap-6 flex-wrap">
        {[
          { value: totalLogsToday, label: "Logs Today" },
          { value: uniqueMetricsToday, label: "Metrics Hit" },
          { value: entries.length, label: "Total Logs" },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="glass-card px-6 py-4 text-center min-w-[120px]"
          >
            <span className="text-2xl font-bold text-stat-value font-mono block">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
