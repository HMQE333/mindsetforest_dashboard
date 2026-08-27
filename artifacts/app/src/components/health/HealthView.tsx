import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, Printer, Watch, HeartPulse, Sparkles, AlertCircle, Upload } from "lucide-react";
import { useHealthEntries } from "@/hooks/useHealthEntries";
import { useWatchEntries } from "@/hooks/useWatchEntries";
import {
  HEALTH_METRICS,
  computeBMI,
  getStatus,
  getBPStatus,
  computeAggregateScore,
  type HealthEntry,
  type HealthStatus,
} from "@/lib/health-data";
import {
  WATCH_METRICS,
  CLUSTER_META,
  VERDICT_META,
  computeReadiness,
  fmtPace,
  type WatchCluster,
  type WatchEntry,
} from "@/lib/watch-data";
import HealthMetricCard from "./HealthMetricCard";
import HealthTreeWidget from "./HealthTreeWidget";
import LogHealthCheckModal from "./LogHealthCheckModal";
import LabTestListModal from "./LabTestListModal";
import WatchMetricCard from "./WatchMetricCard";
import ReadinessSummary from "./ReadinessSummary";
import LogWatchModal from "./LogWatchModal";
import WeeklyImportModal from "./WeeklyImportModal";
import IntervalsIntegration from "./IntervalsIntegration";

const CORE_METRIC_IDS = [
  "weight_kg",
  "bmi",
  "bp",
  "fasting_glucose_mgdl",
  "hba1c_pct",
  "ldl_mgdl",
  "hdl_mgdl",
  "hemoglobin_gdl",
  "egfr",
] as const;

type Mode = "watch" | "labs";

function rangeLabel(id: string): string {
  const def = HEALTH_METRICS.find(m => m.id === id);
  if (!def) return "";
  if (id === "bp") return "<120/<80 mmHg";
  if (def.optimal) return `${def.optimal[0]}–${def.optimal[1]} ${def.unit}`;
  return ".";
}

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const opts: { id: Mode; label: string; sub: string; icon: typeof Watch }[] = [
    { id: "watch", label: "Watch", sub: "Daily", icon: Watch },
    { id: "labs", label: "Labs", sub: "Quarterly", icon: HeartPulse },
  ];
  return (
    <div className="inline-flex p-1 rounded-2xl bg-muted/40 border border-border relative">
      {opts.map(o => {
        const active = mode === o.id;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            onClick={() => setMode(o.id)}
            className="relative px-4 py-2 rounded-xl text-sm font-semibold transition-colors z-10 inline-flex items-center gap-2"
          >
            {active && (
              <motion.div
                layoutId="healthModePill"
                className="absolute inset-0 rounded-xl gradient-purple glow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className={`relative z-10 inline-flex items-center gap-1.5 ${active ? "text-primary-foreground" : "text-muted-foreground"}`}>
              <Icon className="w-4 h-4" />
              {o.label}
              <span className={`text-[10px] font-mono ${active ? "opacity-80" : "opacity-60"}`}>· {o.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatPill({ label, value, unit }: { label: string; value: string | number | null | undefined; unit?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-foreground tabular-nums">
        {value != null ? value : "."}{unit ? <span className="text-[10px] text-muted-foreground ml-0.5">{unit}</span> : null}
      </div>
    </div>
  );
}

export default function HealthView() {
  const [mode, setMode] = useState<Mode>("watch");

  // Labs (existing dashboard) ----------------------------------------------
  const { entries, loading, addEntry, updateEntry, deleteEntry, uploadLabReport, latest, previous } =
    useHealthEntries();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HealthEntry | null>(null);
  const [labListOpen, setLabListOpen] = useState(false);

  // Watch (new) ------------------------------------------------------------
  const watch = useWatchEntries();
  const [watchModalOpen, setWatchModalOpen] = useState(false);
  const [editingWatch, setEditingWatch] = useState<WatchEntry | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [watchFilter, setWatchFilter] = useState<"1w" | "1m" | "3m" | "1y" | "all">("all");

  const defaultHeight = useMemo(() => {
    for (const e of entries) {
      if (e.height_cm) return e.height_cm;
    }
    return null;
  }, [entries]);

  const valueFor = (entry: HealthEntry | null, id: string): number | null => {
    if (!entry) return null;
    if (id === "bmi") return computeBMI(entry.weight_kg, entry.height_cm);
    return (entry as any)[id] ?? null;
  };

  const statusFor = (entry: HealthEntry | null, id: string): HealthStatus => {
    if (!entry) return "unknown";
    const def = HEALTH_METRICS.find(m => m.id === id);
    if (!def) return "unknown";
    if (id === "bp") return getBPStatus(entry.bp_systolic, entry.bp_diastolic);
    return getStatus(valueFor(entry, id), def);
  };

  const aggregateScore = useMemo(() => {
    if (!latest) return 50;
    const statuses = CORE_METRIC_IDS.map(id => statusFor(latest, id));
    return computeAggregateScore({ metricStatuses: statuses, selfRating: latest.self_rating });
  }, [latest]);

  const sparkFor = (id: string) =>
    entries
      .slice(0, 6)
      .reverse()
      .map(e => ({ date: e.entry_date, value: valueFor(e, id) ?? 0 }))
      .filter(p => p.value > 0);

  // Per-metric trend history for the watch cards. Last ~3 weeks of that metric,
  // chronological (oldest→newest), skipping days where it wasn't logged.
  const watchHistoryFor = (id: keyof WatchEntry) =>
    watch.entries
      .slice(0, 21)
      .reverse()
      .map(e => ({ date: e.entry_date, value: e[id] as number | null }))
      .filter((p): p is { date: string; value: number } => p.value != null && Number.isFinite(p.value));

  const insights = useMemo(() => {
    if (!latest) return [];
    const out: { tone: "good" | "warn" | "info"; text: string }[] = [];
    const ldlStatus = statusFor(latest, "ldl_mgdl");
    if (ldlStatus === "optimal" && latest.ldl_mgdl != null) {
      out.push({ tone: "good", text: `LDL at ${latest.ldl_mgdl} mg/dL. Within AHA optimal range.` });
    } else if (ldlStatus === "out" && latest.ldl_mgdl != null) {
      out.push({ tone: "warn", text: `LDL is elevated (${latest.ldl_mgdl} mg/dL). Consider diet & cardio focus.` });
    }
    const bpStatus = statusFor(latest, "bp");
    if (bpStatus === "optimal" && latest.bp_systolic && latest.bp_diastolic) {
      out.push({ tone: "good", text: `Blood pressure ${latest.bp_systolic}/${latest.bp_diastolic}. Healthy range.` });
    } else if (bpStatus === "out") {
      out.push({ tone: "warn", text: `Blood pressure is high. Repeat measurement on a calm morning.` });
    }
    if (latest.self_rating >= 8) {
      out.push({ tone: "good", text: `Self-rating ${latest.self_rating}/10 reflects strong overall wellbeing.` });
    }
    if (entries.length >= 3) {
      const oldestWeight = entries[entries.length - 1]?.weight_kg;
      if (oldestWeight && latest.weight_kg && Math.abs(latest.weight_kg - oldestWeight) < 1.5) {
        out.push({ tone: "info", text: "Weight stable across recent entries. Excellent consistency." });
      }
    }
    return out.slice(0, 4);
  }, [latest, entries]);

  const handleEdit = (entry: HealthEntry) => {
    setEditing(entry);
    setModalOpen(true);
  };
  const handleNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const handleNewWatch = () => {
    setEditingWatch(null);
    setWatchModalOpen(true);
  };
  const handleEditWatch = (entry: WatchEntry) => {
    setEditingWatch(entry);
    setWatchModalOpen(true);
  };

  // ── Watch view ──────────────────────────────────────────
  const filteredEntries = useMemo(() => {
    if (watchFilter === "all") return watch.entries;
    const now = new Date();
    const days: Record<string, number> = { "1w": 7, "1m": 30, "3m": 90, "1y": 365 };
    const cutoff = new Date(now.getTime() - (days[watchFilter] || 0) * 86400000)
      .toISOString().split("T")[0];
    return watch.entries.filter(e => e.entry_date >= cutoff);
  }, [watch.entries, watchFilter]);

  const filteredLatest = filteredEntries[0] ?? null;
  const filteredPrevious = filteredEntries[1] ?? null;

  const watchStats = useMemo(() => {
    const e = filteredEntries;
    if (e.length === 0) return null;
    const avg = (vals: (number | null)[]) => {
      const nums = vals.filter(v => v != null) as number[];
      return nums.length > 0 ? Math.round(nums.reduce((a,b) => a+b, 0) / nums.length) : null;
    };
    return {
      days: e.length,
      avgRHR: avg(e.map(x => x.resting_hr)),
      avgHRV: avg(e.map(x => x.hrv_ms)),
      avgSleep: avg(e.map(x => x.sleep_score)),
      totalSteps: e.reduce((s, x) => s + (x.steps ?? 0), 0),
      bestSleep: e.reduce((b, x) => Math.max(b, x.sleep_score ?? 0), 0),
    };
  }, [filteredEntries]);

  const watchView = (
    <div className="space-y-6">
      <IntervalsIntegration onDataFetched={() => {
        watch.fetchEntries();
        // Also reload after a short delay to let DB writes propagate
        setTimeout(() => watch.fetchEntries(), 1500);
      }} />

      {/* Time filter + stats */}
      {watch.entries.length > 0 && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1">Zakres:</span>
            {(["1w", "1m", "3m", "1y", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setWatchFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  watchFilter === f
                    ? "gradient-purple text-primary-foreground glow-sm"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "1w" ? "1W" : f === "1m" ? "1M" : f === "3m" ? "3M" : f === "1y" ? "1R" : "Wszystko"}
              </button>
            ))}
          </div>
          {watchStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <StatPill label="Dni" value={watchStats.days} />
              <StatPill label="Śr. RHR" value={watchStats.avgRHR} unit="bpm" />
              <StatPill label="Śr. HRV" value={watchStats.avgHRV} unit="ms" />
              <StatPill label="Śr. Sen" value={watchStats.avgSleep} unit="/100" />
              <StatPill label="Najlepszy sen" value={watchStats.bestSleep} unit="/100" />
              <StatPill label="Kroki" value={watchStats.totalSteps?.toLocaleString()} />
            </div>
          )}
        </div>
      )}

      {!watch.tableReady && (
        <div className="glass-card p-4 flex items-start gap-3 border-amber-500/30">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold text-foreground">Watch tracking needs a one-time database update</div>
            <p className="text-muted-foreground mt-0.5">
              The <code className="font-mono text-xs">watch_entries</code> table isn't set up on your Supabase project yet.
              Apply the migration in <code className="font-mono text-xs">.migration-backup/supabase/migrations/</code> (or run it
              in the Supabase SQL editor), then reload. Your entries will save automatically.
            </p>
          </div>
        </div>
      )}

      {watch.loading ? (
        <div className="text-center py-20 text-muted-foreground">Loading…</div>
      ) : watch.entries.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <div className="text-5xl mb-3">⌚</div>
          <div className="text-lg font-bold text-foreground mb-1">No watch days logged yet</div>
          <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
            Log your morning numbers (or drop a Garmin run export) to get a readiness score and a
            words-first plan for the day.
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={handleNewWatch}
              className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Log from Watch
            </button>
            {watch.tableReady && (
              <button
                onClick={() => setWeeklyOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-muted/40 text-foreground font-semibold text-sm border border-border hover:bg-muted/60 transition-all inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Weekly import
              </button>
            )}
            {watch.tableReady && (
              <button
                onClick={watch.seedSampleData}
                className="px-4 py-2.5 rounded-xl bg-muted/40 text-foreground font-semibold text-sm border border-border hover:bg-muted/60 transition-all inline-flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Add sample data
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <ReadinessSummary latest={filteredLatest} previous={filteredPrevious} />

          {/* Clusters */}
          {(["A", "B", "C"] as WatchCluster[]).map(cluster => {
            const meta = CLUSTER_META[cluster];
            const metrics = WATCH_METRICS.filter(m => m.cluster === cluster);
            return (
              <section key={cluster} className="space-y-3">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-xs font-mono font-bold text-primary">{meta.num}</span>
                  <h3 className="text-base font-bold text-foreground">{meta.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">{meta.sub}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {metrics.map((def, i) => (
                    <WatchMetricCard
                      key={def.id}
                      def={def}
                      entry={filteredLatest}
                      previous={filteredPrevious}
                      history={watchHistoryFor(def.id as keyof WatchEntry)}
                      index={i}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* History */}
          <div className="glass-card p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Watch history ({filteredEntries.length}{watchFilter !== "all" ? ` / ${watch.entries.length} total` : ""})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="py-2 font-semibold">Date</th>
                    <th className="py-2 font-semibold">Readiness</th>
                    <th className="py-2 font-semibold">RHR</th>
                    <th className="py-2 font-semibold">Sleep</th>
                    <th className="py-2 font-semibold">VO₂</th>
                    <th className="py-2 font-semibold">Pace</th>
                    <th className="py-2 font-semibold">Steps</th>
                    <th className="py-2 font-semibold w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, idx) => {
                    const r = computeReadiness(e, filteredEntries[idx + 1]);
                    const vm = VERDICT_META[r.verdict];
                    return (
                      <tr
                        key={e.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => handleEditWatch(e)}
                      >
                        <td className="py-2 font-semibold text-foreground">{e.entry_date}</td>
                        <td className="py-2">
                          {r.hasData ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold tabular-nums"
                              style={{ color: vm.color, background: `${vm.color}18` }}
                            >
                              {r.score} {vm.emoji}
                            </span>
                          ) : (
                            "."
                          )}
                        </td>
                        <td className="py-2 tabular-nums">{e.resting_hr ?? "."}</td>
                        <td className="py-2 tabular-nums">{e.sleep_score ?? "."}</td>
                        <td className="py-2 tabular-nums">{e.vo2max ?? "."}</td>
                        <td className="py-2 tabular-nums">{fmtPace(e.run_pace_sec) ?? "."}</td>
                        <td className="py-2 tabular-nums">{e.steps != null ? e.steps.toLocaleString() : "."}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={ev => {
                                ev.stopPropagation();
                                handleEditWatch(e);
                              }}
                              className="p-1 text-muted-foreground hover:text-foreground"
                              aria-label="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={ev => {
                                ev.stopPropagation();
                                if (confirm("Delete this watch day?")) watch.deleteEntry(e.id);
                              }}
                              className="p-1 text-muted-foreground hover:text-destructive"
                              aria-label="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-muted-foreground italic pt-3 mt-2 border-t border-border">
              Personal tracking, not medical advice. Signals reflect trends against your own baseline.
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ── Labs view (existing, unchanged behaviour) ───────────
  const labsView = loading ? (
    <div className="text-center py-20 text-muted-foreground">Loading…</div>
  ) : entries.length === 0 ? (
    <div className="glass-card p-10 text-center">
      <div className="text-5xl mb-3">🌱</div>
      <div className="text-lg font-bold text-foreground mb-1">No health entries yet</div>
      <p className="text-sm text-muted-foreground mb-4">
        Log your first check-in or seed sample data to explore the dashboard.
      </p>
    </div>
  ) : (
    <div className="space-y-6">
      {/* Metric grid + tree */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CORE_METRIC_IDS.map((id, i) => {
            const def = HEALTH_METRICS.find(m => m.id === id)!;
            let displayValue: number | string | null;
            let prevValue: number | null = null;
            if (id === "bp") {
              displayValue =
                latest?.bp_systolic != null && latest?.bp_diastolic != null
                  ? `${latest.bp_systolic}/${latest.bp_diastolic}`
                  : null;
            } else {
              const v = valueFor(latest, id);
              displayValue = v;
              prevValue = valueFor(previous, id);
            }
            return (
              <HealthMetricCard
                key={id}
                def={def}
                value={displayValue}
                rangeLabel={rangeLabel(id)}
                status={statusFor(latest, id)}
                previousValue={prevValue}
                spark={id === "bp" ? undefined : sparkFor(id)}
                index={i}
              />
            );
          })}
        </div>

        {/* Tree + insights */}
        <div className="space-y-4">
          <div className="glass-card p-4 flex flex-col items-center">
            <HealthTreeWidget score={aggregateScore} />
          </div>
          {insights.length > 0 && (
            <div className="glass-card p-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Insights</div>
              {insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                  <span className="shrink-0 mt-0.5">
                    {ins.tone === "good" ? "🟢" : ins.tone === "warn" ? "🟡" : "💡"}
                  </span>
                  <span className="text-foreground/90">{ins.text}</span>
                </div>
              ))}
              <div className="text-[10px] text-muted-foreground italic pt-2 border-t border-border">
                For personal tracking only. Not medical advice.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History table */}
      <div className="glass-card p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Past Entries ({entries.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 font-semibold">Date</th>
                <th className="py-2 font-semibold">Rating</th>
                <th className="py-2 font-semibold">Weight</th>
                <th className="py-2 font-semibold">BP</th>
                <th className="py-2 font-semibold">Glucose</th>
                <th className="py-2 font-semibold">LDL</th>
                <th className="py-2 font-semibold w-20"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr
                  key={e.id}
                  className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => handleEdit(e)}
                >
                  <td className="py-2 font-semibold text-foreground">{e.entry_date}</td>
                  <td className="py-2 tabular-nums">{e.self_rating}/10</td>
                  <td className="py-2 tabular-nums">{e.weight_kg ?? "."}</td>
                  <td className="py-2 tabular-nums">
                    {e.bp_systolic != null && e.bp_diastolic != null ? `${e.bp_systolic}/${e.bp_diastolic}` : "."}
                  </td>
                  <td className="py-2 tabular-nums">{e.fasting_glucose_mgdl ?? "."}</td>
                  <td className="py-2 tabular-nums">{e.ldl_mgdl ?? "."}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={ev => {
                          ev.stopPropagation();
                          handleEdit(e);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={ev => {
                          ev.stopPropagation();
                          if (confirm("Delete this entry?")) deleteEntry(e.id);
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div>
          <h2 className="text-2xl font-bold text-foreground">❤️ Health</h2>
          <p className="text-sm text-muted-foreground">
            {mode === "watch"
              ? "Daily readiness from your Forerunner. One score, then what to improve."
              : "Vitals & bloodwork. Quarterly check-ins."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mode === "labs" ? (
            <>
              <button
                onClick={() => setLabListOpen(true)}
                className="px-3 py-2 rounded-xl bg-muted/40 text-muted-foreground hover:text-foreground text-xs font-semibold transition-all border border-border inline-flex items-center gap-1.5"
                title="Print exact lab test names to show at the clinic"
              >
                <Printer className="w-3.5 h-3.5" /> Lab list
              </button>
              <button
                onClick={handleNew}
                className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Log Health Check
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setWeeklyOpen(true)}
                className="px-3 py-2 rounded-xl bg-muted/40 text-muted-foreground hover:text-foreground text-xs font-semibold transition-all border border-border inline-flex items-center gap-1.5"
                title="Import a whole week at once from a CSV"
              >
                <Upload className="w-3.5 h-3.5" /> Weekly import
              </button>
              <button
                onClick={handleNewWatch}
                className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Log from Watch
              </button>
            </>
          )}
        </div>
      </motion.div>

      <ModeSwitch mode={mode} setMode={setMode} />

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {mode === "watch" ? watchView : labsView}
        </motion.div>
      </AnimatePresence>

      <LabTestListModal open={labListOpen} onClose={() => setLabListOpen(false)} />

      <LogHealthCheckModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSave={async input => {
          if (editing) await updateEntry(editing.id, input);
          else await addEntry(input);
        }}
        initial={editing}
        defaultHeight={defaultHeight}
        uploadFile={uploadLabReport}
      />

      <LogWatchModal
        open={watchModalOpen}
        onClose={() => {
          setWatchModalOpen(false);
          setEditingWatch(null);
        }}
        onSave={async input =>
          editingWatch ? watch.updateEntry(editingWatch.id, input) : !!(await watch.addEntry(input))
        }
        initial={editingWatch}
      />

      <WeeklyImportModal
        open={weeklyOpen}
        onClose={() => setWeeklyOpen(false)}
        onImport={watch.addEntries}
      />
    </div>
  );
}
