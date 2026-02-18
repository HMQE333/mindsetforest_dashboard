import { motion } from "framer-motion";
import { TrackerEntry, TRACKER_METRICS } from "@/lib/tracker-data";

interface TrackerRecentLogProps {
  entries: TrackerEntry[];
}

const textColorMap: Record<string, string> = {
  "cat-mind": "text-cat-mind",
  "cat-body": "text-cat-body",
  "cat-creation": "text-cat-creation",
  "cat-exploration": "text-cat-exploration",
  "cat-networking": "text-cat-networking",
  "cat-trading": "text-cat-trading",
  "cat-spirit": "text-cat-spirit",
  "cat-order": "text-cat-order",
};

export default function TrackerRecentLog({ entries }: TrackerRecentLogProps) {
  const recent = [...entries].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);

  if (recent.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card p-8 text-center"
      >
        <span className="text-4xl block mb-3">📝</span>
        <p className="text-muted-foreground text-sm">No entries yet. Click a stat card to log your first metric!</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="glass-card p-6"
    >
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Recent Activity</h3>
      <div className="space-y-2">
        {recent.map((entry, i) => {
          const metric = TRACKER_METRICS.find((m) => m.id === entry.metricId);
          if (!metric) return null;
          const time = new Date(entry.timestamp);
          const timeStr = time.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
          const isToday = entry.date === new Date().toISOString().split("T")[0];

          return (
            <motion.div
              key={entry.timestamp + entry.metricId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <span className="text-lg">{metric.icon}</span>
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-semibold ${textColorMap[metric.colorVar] || ""}`}>
                  {metric.label}
                </span>
              </div>
              <span className="text-sm font-bold font-mono text-stat-value">
                +{entry.value} <span className="text-xs text-muted-foreground">{metric.unit}</span>
              </span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {isToday ? timeStr : entry.date}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
