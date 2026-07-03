import { motion } from "framer-motion";
import { TrackerMetric } from "@/lib/tracker-data";

interface TrackerStatCardProps {
  metric: TrackerMetric;
  todayValue: number;
  weekValue: number;
  allTimeValue: number;
  index: number;
  onAdd: (metricId: string) => void;
}

const colorMap: Record<string, string> = {
  "cat-mind": "border-cat-mind/30 hover:border-cat-mind/60",
  "cat-body": "border-cat-body/30 hover:border-cat-body/60",
  "cat-creation": "border-cat-creation/30 hover:border-cat-creation/60",
  "cat-exploration": "border-cat-exploration/30 hover:border-cat-exploration/60",
  "cat-networking": "border-cat-networking/30 hover:border-cat-networking/60",
  "cat-trading": "border-cat-trading/30 hover:border-cat-trading/60",
  "cat-spirit": "border-cat-spirit/30 hover:border-cat-spirit/60",
  "cat-order": "border-cat-order/30 hover:border-cat-order/60",
};

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

const glowMap: Record<string, string> = {
  "cat-mind": "hover:shadow-[0_20px_60px_rgba(139,92,246,0.15)]",
  "cat-body": "hover:shadow-[0_20px_60px_rgba(239,68,68,0.15)]",
  "cat-creation": "hover:shadow-[0_20px_60px_rgba(249,115,22,0.15)]",
  "cat-exploration": "hover:shadow-[0_20px_60px_rgba(6,182,212,0.15)]",
  "cat-networking": "hover:shadow-[0_20px_60px_rgba(251,191,36,0.15)]",
  "cat-trading": "hover:shadow-[0_20px_60px_rgba(99,102,241,0.15)]",
  "cat-spirit": "hover:shadow-[0_20px_60px_rgba(217,70,239,0.15)]",
  "cat-order": "hover:shadow-[0_20px_60px_rgba(161,161,170,0.15)]",
};

export default function TrackerStatCard({
  metric,
  todayValue,
  weekValue,
  allTimeValue,
  index,
  onAdd,
}: TrackerStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-card-hover p-6 cursor-pointer group ${colorMap[metric.colorVar] || ""} ${glowMap[metric.colorVar] || ""}`}
      onClick={() => onAdd(metric.id)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{metric.icon}</span>
          <div>
            <h3 className={`font-semibold text-sm ${textColorMap[metric.colorVar] || "text-foreground"}`}>
              {metric.label}
            </h3>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {metric.categoryIcon} {metric.categoryName}
            </span>
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-primary/20 border border-primary/30 rounded-full px-3 py-1 text-xs font-semibold text-primary-foreground">
          + Add
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Today</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-stat-value font-mono">{todayValue}</span>
            <span className="text-xs text-muted-foreground">{metric.unit}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">7 Days</div>
            <span className="text-sm font-semibold text-foreground/80 font-mono">{weekValue}</span>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">All Time</div>
            <span className="text-sm font-semibold text-foreground/80 font-mono">{allTimeValue}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
