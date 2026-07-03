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

  const stats = useMemo(() => {
    if (!metric) return null;

    const weekTotal = getLast7DaysTotal(entries, metric.id);
    const yearTotal = getYearTotal(entries, metric.id, year);
    const dailyAvg = getDailyAverage(entries, metric.id);
    const habit = getHabitScore(entries, metric.id);

    const months: { label: string; value: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString("default", { month: "short" }),
        value: getMonthTotal(entries, metric.id, d.getFullYear(), d.getMonth()),
      });
    }

    return { weekTotal, yearTotal, dailyAvg, habit, months };
  }, [entries, selectedMetricId, metric, year]);

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
                </div>
                <div className="flex gap-2" style={{ height: "11rem" }}>
                  {stats.months.map((m, i) => {
                    const heightPct = m.value > 0 ? Math.max(8, (m.value / maxMonth) * 100) : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="text-[10px] font-mono font-bold shrink-0"
                          style={{ color: m.value > 0 ? "#5AC7D7" : "transparent" }}
                        >
                          {m.value > 0 ? m.value : "–"}
                        </div>
                        <div className="relative w-full flex-1 rounded-t-sm overflow-hidden">
                          <div
                            className="absolute bottom-0 left-0 w-full rounded-t-sm transition-all duration-300 hover:brightness-125"
                            style={{
                              height: m.value > 0 ? `${heightPct}%` : "2px",
                              background: m.value > 0
                                ? "linear-gradient(to top, #3a9aa8, #5AC7D7)"
                                : "hsl(var(--muted) / 0.15)",
                              boxShadow: m.value > 0 ? "0 0 8px rgba(90, 199, 215, 0.3)" : "none",
                            }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-foreground font-medium shrink-0">{m.label.slice(0, 3)}</span>
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
