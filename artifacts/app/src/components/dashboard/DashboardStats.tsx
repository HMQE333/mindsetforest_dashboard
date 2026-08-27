import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import { DailyCompletion } from "@/hooks/useDailyCompletions";
import { Category } from "@/lib/dashboard-data";

type Period = "week" | "month" | "year" | "all";

interface DashboardStatsProps {
  history: DailyCompletion[]; // rolling last 7 days, already loaded
  fetchAllHistory: () => Promise<DailyCompletion[]>;
  dashboardState?: {
    currentXP: number;
    currentLevel: number;
    streakDays: number;
    missionsCompleted: number;
  };
  categories: Category[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PERIOD_LABELS: Record<Period, string> = { week: "Week", month: "Month", year: "Year", all: "All-time" };

interface Aggregate {
  xp: number;
  missions: number;
  activeDays: number;
  catDays: Map<string, number>;
  titleCounts: Map<string, number>;
}

function aggregate(list: DailyCompletion[]): Aggregate {
  let xp = 0;
  let missions = 0;
  const activeDates = new Set<string>();
  const catDays = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  for (const d of list) {
    xp += d.xp_earned;
    missions += d.missions_completed;
    if (d.missions_completed > 0 || d.xp_earned > 0) activeDates.add(d.date);
    for (const c of new Set(d.categories_engaged)) catDays.set(c, (catDays.get(c) || 0) + 1);
    for (const t of d.completed_mission_titles) titleCounts.set(t, (titleCounts.get(t) || 0) + 1);
  }
  return { xp, missions, activeDays: activeDates.size, catDays, titleCounts };
}

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? null : 100;
  return Math.round(((cur - prev) / prev) * 100);
}

async function exportCSV(all: DailyCompletion[], dashboardState?: DashboardStatsProps["dashboardState"]) {
  const lines: string[] = [];
  if (dashboardState) {
    lines.push("=== Dashboard Summary ===");
    lines.push(`Level,${dashboardState.currentLevel}`);
    lines.push(`Total XP,${dashboardState.currentXP}`);
    lines.push(`Streak Days,${dashboardState.streakDays}`);
    lines.push("");
  }
  lines.push("=== Full Progress History ===");
  lines.push("Date,Missions Completed,XP Earned,Categories Engaged,Completed Missions");
  for (const day of all) {
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
  a.download = `mindsetforest-progress-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardStats({ history, fetchAllHistory, dashboardState, categories }: DashboardStatsProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [allHistory, setAllHistory] = useState<DailyCompletion[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [showAllDone, setShowAllDone] = useState(false);

  // Lazily load full history the first time a non-week period is opened.
  useEffect(() => {
    if (period !== "week" && allHistory === null && !loadingAll) {
      setLoadingAll(true);
      fetchAllHistory()
        .then((rows) => setAllHistory(rows))
        .finally(() => setLoadingAll(false));
    }
  }, [period, allHistory, loadingAll, fetchAllHistory]);

  useEffect(() => setShowAllDone(false), [period]);

  // Current + previous window entries for the selected period.
  const { current, previous, buckets, bucketLabel } = useMemo(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const source = period === "week" ? history : allHistory || [];

    if (period === "week") {
      // history is already the rolling last-7-days (oldest→newest, zero-filled).
      const cur = history;
      const buckets = history.map((d) => ({
        label: DAY_LABELS[new Date(d.date + "T12:00:00").getDay()],
        value: d.xp_earned,
      }));
      return { current: cur, previous: [] as DailyCompletion[], buckets, bucketLabel: "Last 7 days" };
    }

    if (period === "month") {
      const prefix = `${yyyy}-${mm}`;
      const pm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const py = now.getMonth() === 0 ? yyyy - 1 : yyyy;
      const prevPrefix = `${py}-${String(pm + 1).padStart(2, "0")}`;
      const cur = source.filter((d) => d.date.startsWith(prefix));
      const prev = source.filter((d) => d.date.startsWith(prevPrefix));
      const daysInMonth = new Date(yyyy, now.getMonth() + 1, 0).getDate();
      const byDay = new Map<string, number>();
      for (const d of cur) byDay.set(d.date, (byDay.get(d.date) || 0) + d.xp_earned);
      const buckets = Array.from({ length: daysInMonth }, (_, i) => {
        const day = String(i + 1).padStart(2, "0");
        return { label: String(i + 1), value: byDay.get(`${prefix}-${day}`) || 0 };
      });
      return { current: cur, previous: prev, buckets, bucketLabel: `${MONTH_LABELS[now.getMonth()]} ${yyyy}` };
    }

    if (period === "year") {
      const cur = source.filter((d) => d.date.startsWith(`${yyyy}-`));
      const prev = source.filter((d) => d.date.startsWith(`${yyyy - 1}-`));
      const byMonth = new Array(12).fill(0);
      for (const d of cur) {
        const monthIdx = parseInt(d.date.slice(5, 7), 10) - 1;
        if (monthIdx >= 0 && monthIdx < 12) byMonth[monthIdx] += d.xp_earned;
      }
      const buckets = MONTH_LABELS.map((label, i) => ({ label, value: byMonth[i] }));
      return { current: cur, previous: prev, buckets, bucketLabel: `${yyyy}` };
    }

    // all-time. One bar per calendar year present in the data.
    const byYear = new Map<number, number>();
    for (const d of source) {
      const y = parseInt(d.date.slice(0, 4), 10);
      byYear.set(y, (byYear.get(y) || 0) + d.xp_earned);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    const buckets = years.map((y) => ({ label: String(y), value: byYear.get(y) || 0 }));
    return { current: source, previous: [] as DailyCompletion[], buckets, bucketLabel: "Every year" };
  }, [period, history, allHistory]);

  const cur = useMemo(() => aggregate(current), [current]);
  const prev = useMemo(() => aggregate(previous), [previous]);

  const catStats = useMemo(() => {
    const maxDays = Math.max(1, ...categories.map((c) => cur.catDays.get(c.id) || 0));
    return categories
      .map((c) => ({ cat: c, days: cur.catDays.get(c.id) || 0, maxDays }))
      .sort((a, b) => b.days - a.days);
  }, [categories, cur]);

  const topDone = useMemo(() => {
    const arr = Array.from(cur.titleCounts.entries()).sort((a, b) => b[1] - a[1]);
    return arr;
  }, [cur]);

  const maxBucket = Math.max(1, ...buckets.map((b) => b.value));
  const showComparison = period === "month" || period === "year";
  const xpDelta = showComparison ? pct(cur.xp, prev.xp) : null;
  const missionDelta = showComparison ? pct(cur.missions, prev.missions) : null;

  if (history.length === 0 && (allHistory === null || allHistory.length === 0)) return null;

  const deltaBadge = (delta: number | null) => {
    if (delta === null) return <span className="text-muted-foreground">.</span>;
    if (delta > 0) return <span className="text-green-400">↑ {delta}%</span>;
    if (delta < 0) return <span className="text-destructive">↓ {Math.abs(delta)}%</span>;
    return <span className="text-muted-foreground">. 0%</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      className="glass-card p-6 mb-8 mt-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-lg font-bold text-foreground hover:text-primary transition-colors"
        >
          📊 Progress
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
        <div className="flex items-center gap-3">
          {!collapsed && (
            <div className="hidden sm:flex gap-4 text-xs text-muted-foreground">
              <span><strong className="text-stat-value font-mono">{cur.xp}</strong> XP</span>
              <span><strong className="text-stat-value font-mono">{cur.missions}</strong> missions</span>
              <span><strong className="text-stat-value font-mono">{cur.activeDays}</strong> active days</span>
            </div>
          )}
          <button
            onClick={async () => exportCSV(allHistory || (await fetchAllHistory()), dashboardState)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            title="Download full history as CSV"
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
            {/* Period selector */}
            <div className="flex flex-wrap gap-2 mt-4 mb-5">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    p === period
                      ? "text-primary border-current bg-secondary/80"
                      : "text-muted-foreground border-border/50 hover:border-border"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
              <span className="ml-auto self-center text-[11px] text-muted-foreground font-medium">{bucketLabel}</span>
            </div>

            {loadingAll && period !== "week" ? (
              <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Loading history…</div>
            ) : (
              <>
                {/* Key stat tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <div className="bg-secondary/40 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">XP Earned</div>
                    <div className="text-xl font-bold font-mono text-stat-value">{cur.xp}</div>
                    {showComparison && <div className="text-[10px] font-semibold mt-0.5">{deltaBadge(xpDelta)}</div>}
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Missions</div>
                    <div className="text-xl font-bold font-mono text-stat-value">{cur.missions}</div>
                    {showComparison && <div className="text-[10px] font-semibold mt-0.5">{deltaBadge(missionDelta)}</div>}
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Active Days</div>
                    <div className="text-xl font-bold font-mono text-stat-value">{cur.activeDays}</div>
                  </div>
                  <div className="bg-secondary/40 rounded-xl p-3 text-center">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Avg XP / Active Day</div>
                    <div className="text-xl font-bold font-mono text-stat-value">
                      {cur.activeDays > 0 ? Math.round(cur.xp / cur.activeDays) : 0}
                    </div>
                  </div>
                </div>

                {/* Trend chart */}
                {buckets.length > 0 && (
                  <div className="mb-6">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                      XP over {PERIOD_LABELS[period].toLowerCase()}
                    </div>
                    <div className="flex items-end gap-1 sm:gap-1.5" style={{ height: "7rem" }}>
                      {buckets.map((b, i) => {
                        const h = b.value > 0 ? Math.max(8, (b.value / maxBucket) * 100) : 0;
                        // Keep day labels readable on the dense month view.
                        const showLabel =
                          period !== "month" || i === 0 || (i + 1) % 5 === 0 || i === buckets.length - 1;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                            <div className="relative w-full flex-1 rounded-t-sm overflow-hidden">
                              <div
                                className="absolute bottom-0 left-0 w-full rounded-t-sm transition-all duration-300 hover:brightness-125"
                                style={{
                                  height: b.value > 0 ? `${h}%` : "2px",
                                  background: b.value > 0 ? "linear-gradient(to top, #3a9aa8, #5AC7D7)" : "hsl(var(--muted) / 0.15)",
                                  boxShadow: b.value > 0 ? "0 0 8px rgba(90, 199, 215, 0.3)" : "none",
                                }}
                                title={`${b.label}: ${b.value} XP`}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground font-medium shrink-0 truncate w-full text-center">
                              {showLabel ? b.label : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Per-category breakdown */}
                <div className="mb-6">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                    By category. Active days
                  </div>
                  <div className="space-y-2">
                    {catStats.map(({ cat, days, maxDays }) => (
                      <div key={cat.id} className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 w-28 shrink-0">
                          <span className="text-sm" style={{ filter: `drop-shadow(0 0 4px ${cat.color})` }}>{cat.icon}</span>
                          <span className="text-xs font-semibold truncate" style={{ color: cat.color }}>{cat.name}</span>
                        </div>
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${days > 0 ? Math.max(6, (days / maxDays) * 100) : 0}%`,
                              background: cat.color,
                              boxShadow: days > 0 ? `0 0 8px ${cat.color}66` : "none",
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground w-14 text-right shrink-0">
                          {days} {days === 1 ? "day" : "days"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What was done */}
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">
                    What was done {topDone.length > 0 && <span className="text-muted-foreground/60">({topDone.length} unique)</span>}
                  </div>
                  {topDone.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nothing logged in this period yet.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {(showAllDone ? topDone : topDone.slice(0, 8)).map(([title, count]) => (
                          <span
                            key={title}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/40 text-xs text-foreground/80"
                            title={`${title}. Done ${count}×`}
                          >
                            <span className="truncate max-w-[16rem]">{title}</span>
                            <span className="font-mono font-bold text-stat-value">{count}×</span>
                          </span>
                        ))}
                      </div>
                      {topDone.length > 8 && (
                        <button
                          onClick={() => setShowAllDone((v) => !v)}
                          className="mt-2 text-[11px] font-semibold text-primary hover:underline"
                        >
                          {showAllDone ? "Show less" : `Show all ${topDone.length}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
