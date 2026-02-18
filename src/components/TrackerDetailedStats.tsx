import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TrackerEntry, getMonthTotal, getYearTotal, getDailyAverage, getHabitScore, getLast7DaysTotal } from "@/hooks/useTrackerEntries";
import { TRACKER_METRICS, TrackerMetric } from "@/lib/tracker-data";

interface TrackerDetailedStatsProps {
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

export default function TrackerDetailedStats({ entries }: TrackerDetailedStatsProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedMetricId, setSelectedMetricId] = useState<string>(TRACKER_METRICS[0]?.id || "");

  const metric = TRACKER_METRICS.find((m) => m.id === selectedMetricId);
  const now = new Date();
  const year = now.getFullYear();

  // Stable sample data seeded by metric id
  const sampleValues = useMemo(() => {
    const seed = selectedMetricId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 12 }, (_, i) => ((seed * (i + 1) * 7 + 13) % 40) + 5);
  }, [selectedMetricId]);

  const stats = useMemo(() => {
    if (!metric) return null;

    const weekTotal = getLast7DaysTotal(entries, metric.id);
    const yearTotal = getYearTotal(entries, metric.id, year);
    const dailyAvg = getDailyAverage(entries, metric.id);
    const habit = getHabitScore(entries, metric.id);

    const months: { label: string; value: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, now.getMonth() - i, 1);
      const real = getMonthTotal(entries, metric.id, d.getFullYear(), d.getMonth());
      months.push({
        label: d.toLocaleString("default", { month: "short" }),
        value: real > 0 ? real : sampleValues[11 - i],
      });
    }

    return { weekTotal, yearTotal, dailyAvg, habit, months };
  }, [entries, selectedMetricId, metric, year, sampleValues]);

  const maxMonth = stats ? Math.max(1, ...stats.months.map((m) => m.value)) : 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden mb-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Detailed Stats</h3>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {expanded && stats && metric && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
              {/* Metric selector */}
              <div className="flex flex-wrap gap-2 mb-6">
                {TRACKER_METRICS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMetricId(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      m.id === selectedMetricId
                        ? `${textColorMap[m.colorVar] || ""} border-current bg-secondary/80`
                        : "text-muted-foreground border-border/50 hover:border-border"
                    }`}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>

              {/* Key stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {[
                  { label: "This Week", value: stats.weekTotal, suffix: metric.unit },
                  { label: "This Year", value: stats.yearTotal, suffix: metric.unit },
                  { label: "Daily Avg", value: stats.dailyAvg, suffix: metric.unit },
                  {
                    label: "Habit Score",
                    value: stats.habit.score,
                    suffix: "%",
                    extra: stats.habit.trend,
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary/40 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{s.label}</div>
                    <div className="text-xl font-bold font-mono text-stat-value">
                      {s.value}
                      <span className="text-xs text-muted-foreground ml-1">{s.suffix}</span>
                    </div>
                    {s.extra && (
                      <div
                        className={`text-[10px] font-semibold mt-0.5 ${
                          s.extra === "above" ? "text-green-400" : s.extra === "below" ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {s.extra === "above" ? "↑ Above avg" : s.extra === "below" ? "↓ Below avg" : "— Average"}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 12-month bar chart */}
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                  12-Month Overview — {metric.label}
                  <span className="italic ml-2 text-muted-foreground/50">* sample data</span>
                </div>
                <div className="flex items-end gap-1.5 h-32">
                  {stats.months.map((m, i) => {
                    const height = m.value > 0 ? Math.max(10, (m.value / maxMonth) * 100) : 4;
                    const intensity = m.value > 0 ? 0.5 + (m.value / maxMonth) * 0.5 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
                        {/* Value label on hover */}
                        <div className="text-[9px] font-mono font-bold text-foreground/0 group-hover:text-foreground/80 transition-colors">
                          {m.value}
                        </div>
                        <div
                          className="w-full rounded-md transition-all duration-500 group-hover:scale-105 group-hover:brightness-125"
                          style={{
                            height: `${height}%`,
                            background: m.value > 0
                              ? `linear-gradient(to top, hsl(var(--${metric.colorVar}) / ${intensity * 0.6}), hsl(var(--${metric.colorVar}) / ${intensity}))`
                              : "hsl(var(--muted) / 0.3)",
                            boxShadow: m.value > 0
                              ? `0 0 12px hsl(var(--${metric.colorVar}) / ${intensity * 0.3})`
                              : "none",
                          }}
                          title={`${m.label}: ${m.value} ${metric.unit}`}
                        />
                        <span className="text-[9px] text-muted-foreground font-medium">{m.label.slice(0, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
