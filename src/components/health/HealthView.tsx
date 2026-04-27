import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Sparkles, Pencil, Trash2 } from "lucide-react";
import { useHealthEntries } from "@/hooks/useHealthEntries";
import {
  HEALTH_METRICS,
  computeBMI,
  getStatus,
  getBPStatus,
  computeAggregateScore,
  type HealthEntry,
  type HealthStatus,
} from "@/lib/health-data";
import HealthMetricCard from "./HealthMetricCard";
import HealthTreeWidget from "./HealthTreeWidget";
import LogHealthCheckModal from "./LogHealthCheckModal";

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

function rangeLabel(id: string): string {
  const def = HEALTH_METRICS.find(m => m.id === id);
  if (!def) return "";
  if (id === "bp") return "<120/<80 mmHg";
  if (def.optimal) return `${def.optimal[0]}–${def.optimal[1]} ${def.unit}`;
  return "—";
}

export default function HealthView() {
  const { entries, loading, addEntry, updateEntry, deleteEntry, seedSampleData, uploadLabReport, latest, previous } =
    useHealthEntries();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HealthEntry | null>(null);

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

  const insights = useMemo(() => {
    if (!latest) return [];
    const out: { tone: "good" | "warn" | "info"; text: string }[] = [];
    const ldlStatus = statusFor(latest, "ldl_mgdl");
    if (ldlStatus === "optimal" && latest.ldl_mgdl != null) {
      out.push({ tone: "good", text: `LDL at ${latest.ldl_mgdl} mg/dL — within AHA optimal range.` });
    } else if (ldlStatus === "out" && latest.ldl_mgdl != null) {
      out.push({ tone: "warn", text: `LDL is elevated (${latest.ldl_mgdl} mg/dL). Consider diet & cardio focus.` });
    }
    const bpStatus = statusFor(latest, "bp");
    if (bpStatus === "optimal" && latest.bp_systolic && latest.bp_diastolic) {
      out.push({ tone: "good", text: `Blood pressure ${latest.bp_systolic}/${latest.bp_diastolic} — healthy range.` });
    } else if (bpStatus === "out") {
      out.push({ tone: "warn", text: `Blood pressure is high — repeat measurement on a calm morning.` });
    }
    if (latest.self_rating >= 8) {
      out.push({ tone: "good", text: `Self-rating ${latest.self_rating}/10 reflects strong overall wellbeing.` });
    }
    if (entries.length >= 3) {
      const oldestWeight = entries[entries.length - 1]?.weight_kg;
      if (oldestWeight && latest.weight_kg && Math.abs(latest.weight_kg - oldestWeight) < 1.5) {
        out.push({ tone: "info", text: "Weight stable across recent entries — excellent consistency." });
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

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading…</div>;
  }

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
          <p className="text-sm text-muted-foreground">Vitals & bloodwork — quarterly check-ins.</p>
        </div>
        <div className="flex items-center gap-2">
          {entries.length === 0 && (
            <button
              onClick={seedSampleData}
              className="px-3 py-2 rounded-xl bg-muted/40 text-muted-foreground hover:text-foreground text-xs font-semibold transition-all border border-border inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Seed demo data
            </button>
          )}
          <button
            onClick={handleNew}
            className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Log New Health Check
          </button>
        </div>
      </motion.div>

      {entries.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <div className="text-5xl mb-3">🌱</div>
          <div className="text-lg font-bold text-foreground mb-1">No health entries yet</div>
          <p className="text-sm text-muted-foreground mb-4">
            Log your first check-in or seed sample data to explore the dashboard.
          </p>
        </div>
      ) : (
        <>
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
                <div className="text-xs text-muted-foreground mt-2">Health Score</div>
                <div className="text-2xl font-extrabold text-foreground tabular-nums">{aggregateScore}</div>
              </div>
              {insights.length > 0 && (
                <div className="glass-card p-4 space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Insights</div>
                  {insights.map((ins, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-xs leading-relaxed"
                    >
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
                      <td className="py-2 tabular-nums">{e.weight_kg ?? "—"}</td>
                      <td className="py-2 tabular-nums">
                        {e.bp_systolic != null && e.bp_diastolic != null ? `${e.bp_systolic}/${e.bp_diastolic}` : "—"}
                      </td>
                      <td className="py-2 tabular-nums">{e.fasting_glucose_mgdl ?? "—"}</td>
                      <td className="py-2 tabular-nums">{e.ldl_mgdl ?? "—"}</td>
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
        </>
      )}

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
    </div>
  );
}