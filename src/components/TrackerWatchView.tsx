import { motion } from "framer-motion";
import { TRACKER_METRICS } from "@/lib/tracker-data";
import { TrackerEntry, getTodayTotal } from "@/hooks/useTrackerEntries";

const borderColorMap: Record<string, string> = {
  "cat-mind": "border-cat-mind/50",
  "cat-body": "border-cat-body/50",
  "cat-creation": "border-cat-creation/50",
  "cat-exploration": "border-cat-exploration/50",
  "cat-networking": "border-cat-networking/50",
  "cat-trading": "border-cat-trading/50",
  "cat-spirit": "border-cat-spirit/50",
  "cat-order": "border-cat-order/50",
};

interface TrackerWatchViewProps {
  entries: TrackerEntry[];
  streak: number;
  onAdd: (metricId: string) => void;
}

export default function TrackerWatchView({ entries, streak, onAdd }: TrackerWatchViewProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-2 py-3">
      {/* Streak pill */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-secondary/60 border border-white/10 rounded-full px-3 py-1 mb-3 text-xs font-bold text-foreground/80"
      >
        🔥 {streak}
      </motion.div>

      {/* Circle grid */}
      <div className="grid grid-cols-3 gap-2 w-full max-w-[220px]">
        {TRACKER_METRICS.map((metric, i) => {
          const todayVal = getTodayTotal(entries, metric.id);
          return (
            <motion.button
              key={metric.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onAdd(metric.id)}
              className={`flex flex-col items-center justify-center w-14 h-14 mx-auto rounded-full bg-secondary/50 border-2 ${borderColorMap[metric.colorVar] || "border-border"} active:scale-90 transition-transform`}
            >
              <span className="text-xl leading-none">{metric.icon}</span>
              {todayVal > 0 && (
                <span className="text-[8px] font-mono font-bold text-foreground/60 mt-0.5 leading-none">
                  {todayVal}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
