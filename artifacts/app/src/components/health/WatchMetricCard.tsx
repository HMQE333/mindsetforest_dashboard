import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SIGNAL,
  fmtPace,
  fmtDuration,
  watchTrend,
  type WatchEntry,
  type WatchMetricDef,
} from "@/lib/watch-data";

interface Props {
  def: WatchMetricDef;
  entry: WatchEntry | null;
  previous: WatchEntry | null;
  index?: number;
}

interface CardContent {
  primary: string | null;
  unit: string;
  trendValue: number | null;
  prevTrendValue: number | null;
  subStats: { label: string; value: string }[];
  progress?: { value: number; max: number; label: string };
}

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);

function getContent(def: WatchMetricDef, e: WatchEntry | null, prev: WatchEntry | null): CardContent {
  const v = (k: keyof WatchEntry) => (e ? (e[k] as number | null) : null);
  const p = (k: keyof WatchEntry) => (prev ? (prev[k] as number | null) : null);

  switch (def.id) {
    case "hrv_ms":
      return {
        primary: cap(e?.hrv_status) ?? (v("hrv_ms") != null ? `${v("hrv_ms")}` : null),
        unit: e?.hrv_status ? "" : "ms",
        trendValue: v("hrv_ms"),
        prevTrendValue: p("hrv_ms"),
        subStats: e?.hrv_status && v("hrv_ms") != null ? [{ label: "HRV", value: `${v("hrv_ms")} ms` }] : [],
      };
    case "sleep_score":
      return {
        primary: v("sleep_score") != null ? `${v("sleep_score")}` : null,
        unit: "/100",
        trendValue: v("sleep_score"),
        prevTrendValue: p("sleep_score"),
        subStats: [
          v("sleep_deep_min") != null ? { label: "Deep", value: `${v("sleep_deep_min")}m` } : null,
          v("sleep_rem_min") != null ? { label: "REM", value: `${v("sleep_rem_min")}m` } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };
    case "run_pace_sec":
      return {
        primary: fmtPace(v("run_pace_sec")),
        unit: v("run_pace_sec") != null ? "/km" : "",
        trendValue: v("run_pace_sec"),
        prevTrendValue: p("run_pace_sec"),
        subStats: [
          v("run_distance_km") != null ? { label: "Dist", value: `${v("run_distance_km")} km` } : null,
          v("run_avg_hr") != null ? { label: "Avg HR", value: `${v("run_avg_hr")} bpm` } : null,
          v("run_cadence_spm") != null ? { label: "Cadence", value: `${v("run_cadence_spm")} spm` } : null,
          v("run_power_w") != null ? { label: "Power", value: `${v("run_power_w")} W` } : null,
          v("run_kcal") != null ? { label: "Energy", value: `${v("run_kcal")} kcal` } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };
    case "race_5k_sec":
      return {
        primary: fmtDuration(v("race_5k_sec")),
        unit: v("race_5k_sec") != null ? "5K" : "",
        trendValue: v("race_5k_sec"),
        prevTrendValue: p("race_5k_sec"),
        subStats: [
          v("race_10k_sec") != null ? { label: "10K", value: fmtDuration(v("race_10k_sec"))! } : null,
          v("race_half_sec") != null ? { label: "Half", value: fmtDuration(v("race_half_sec"))! } : null,
          v("race_marathon_sec") != null ? { label: "Full", value: fmtDuration(v("race_marathon_sec"))! } : null,
          v("fitness_age") != null ? { label: "Fit age", value: `${v("fitness_age")} yr` } : null,
        ].filter(Boolean) as { label: string; value: string }[],
      };
    case "steps": {
      const im = v("intensity_minutes");
      return {
        primary: v("steps") != null ? `${(v("steps") as number).toLocaleString()}` : null,
        unit: v("steps") != null ? "steps" : "",
        trendValue: v("steps"),
        prevTrendValue: p("steps"),
        subStats: [],
        progress: im != null ? { value: im, max: 150, label: "Intensity min / wk" } : undefined,
      };
    }
    default: {
      const val = v(def.id as keyof WatchEntry);
      return {
        primary: val != null ? `${val}` : null,
        unit: def.unit,
        trendValue: val,
        prevTrendValue: p(def.id as keyof WatchEntry),
        subStats: [],
      };
    }
  }
}

export default function WatchMetricCard({ def, entry, previous, index = 0 }: Props) {
  const c = getContent(def, entry, previous);
  const trend = watchTrend(def, c.trendValue, c.prevTrendValue);
  const hasValue = c.primary != null;

  // Which "read" to surface: follow the trend when we have one, else stay neutral.
  const read =
    trend?.tone === "good" ? def.good : trend?.tone === "watch" ? def.watch : null;
  const readColor =
    trend?.tone === "good" ? SIGNAL.good : trend?.tone === "watch" ? SIGNAL.watch : SIGNAL.info;

  const progressPct = c.progress ? Math.min(100, (c.progress.value / c.progress.max) * 100) : 0;
  const progressMet = c.progress ? c.progress.value >= c.progress.max : false;

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card-hover p-4 relative overflow-hidden group flex flex-col"
      >
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: def.color, opacity: hasValue ? 0.7 : 0.2 }}
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl shrink-0" style={{ filter: `drop-shadow(0 0 8px ${def.color})` }}>
              {def.icon}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground leading-tight truncate">{def.label}</div>
              <div className="text-[10px] font-mono text-muted-foreground truncate">{def.tag}</div>
            </div>
          </div>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="hidden sm:inline-flex relative z-10 opacity-50 hover:opacity-100 transition-opacity shrink-0 p-1 -m-1"
                aria-label="What it means"
              >
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" align="start" className="max-w-xs text-xs z-[100] space-y-1.5">
              <p>{def.whatIs}</p>
              <p style={{ color: SIGNAL.watch }}>✦ {def.payoff}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-1.5 mb-2">
          <span
            className="text-2xl font-extrabold tabular-nums leading-none"
            style={{ color: hasValue ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
          >
            {c.primary ?? "—"}
          </span>
          {c.unit && <span className="text-[11px] text-muted-foreground">{c.unit}</span>}
        </div>

        {/* Sub-stats (composite cards) */}
        {c.subStats.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5">
            {c.subStats.map(s => (
              <div key={s.label} className="text-[10px] leading-tight">
                <span className="text-muted-foreground">{s.label} </span>
                <span className="font-semibold text-foreground/90 tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Intensity-minutes progress (steps card) */}
        {c.progress && (
          <div className="mb-2.5">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-muted-foreground">{c.progress.label}</span>
              <span className="font-semibold tabular-nums" style={{ color: progressMet ? SIGNAL.good : SIGNAL.watch }}>
                {Math.round(c.progress.value)}/{c.progress.max}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: progressMet ? SIGNAL.good : SIGNAL.watch }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        )}

        {/* Signal read */}
        {hasValue && read && (
          <div
            className="inline-flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[10px] font-semibold mb-2"
            style={{ background: `${readColor}18`, color: readColor }}
          >
            <span className="font-mono">{read.arrow}</span>
            <span className="uppercase tracking-wide">{read.small}</span>
          </div>
        )}

        {/* Guidance line — mint = the move */}
        <div className="mt-auto flex items-start gap-1.5 pt-1">
          <span className="text-[11px] font-mono shrink-0" style={{ color: SIGNAL.good }}>→</span>
          <span className="text-[11px] text-muted-foreground leading-snug">{def.soIDo}</span>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
