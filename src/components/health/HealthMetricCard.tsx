import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HealthMetricDef,
  HealthStatus,
  STATUS_COLORS,
  STATUS_LABEL,
  getTrend,
} from "@/lib/health-data";

interface Props {
  def: HealthMetricDef;
  value: number | string | null;       // string for composite (e.g. "120/80")
  rangeLabel: string;                  // e.g. "<120/<80" or "70–99 mg/dL"
  status: HealthStatus;
  previousValue?: number | null;       // for trend (composite metrics: pass null)
  spark?: { date: string; value: number }[];
  index?: number;
}

export default function HealthMetricCard({ def, value, rangeLabel, status, previousValue, spark, index = 0 }: Props) {
  const colors = STATUS_COLORS[status];
  const trend = typeof value === "number" ? getTrend(value, previousValue ?? null) : null;
  const trendIsGood = trend
    ? trend.direction === "flat"
      ? null
      : (def.betterDirection === "lower" && trend.direction === "down") ||
        (def.betterDirection === "higher" && trend.direction === "up")
    : null;

  const trendColor =
    def.betterDirection === "neutral" || trendIsGood === null
      ? "hsl(var(--muted-foreground))"
      : trendIsGood
      ? "hsl(142, 70%, 55%)"
      : "hsl(0, 72%, 60%)";

  const TrendIcon = trend?.direction === "up" ? TrendingUp : trend?.direction === "down" ? TrendingDown : Minus;

  const sparkMax = spark && spark.length ? Math.max(...spark.map(s => s.value), 1) : 1;
  const sparkMin = spark && spark.length ? Math.min(...spark.map(s => s.value)) : 0;
  const sparkRange = sparkMax - sparkMin || 1;

  return (
    <TooltipProvider>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card-hover p-5 relative overflow-hidden group"
      >
        {/* Status accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: colors.text, opacity: status === "unknown" ? 0.2 : 0.7 }}
        />

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0" style={{ filter: `drop-shadow(0 0 8px ${def.color})` }}>
              {def.icon}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-foreground truncate">{def.label}</div>
              <div className="text-[10px] text-muted-foreground truncate">{rangeLabel}</div>
            </div>
          </div>
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="relative z-10 opacity-60 hover:opacity-100 transition-opacity shrink-0 p-1 -m-1"
                aria-label="Why it matters"
              >
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs z-[100]">
              {def.why}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-1.5 mb-3">
          <span
            className="text-3xl font-extrabold tabular-nums leading-none"
            style={{ color: value !== null ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
          >
            {value ?? "—"}
          </span>
          <span className="text-xs text-muted-foreground">{def.unit}</span>
        </div>

        {/* Status pill + trend */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border"
            style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
          >
            {STATUS_LABEL[status]}
          </span>
          {trend && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums"
              style={{ color: trendColor }}
            >
              <TrendIcon className="w-3 h-3" />
              {trend.direction === "flat" ? "stable" : `${Math.abs(trend.delta)}%`}
            </span>
          )}
        </div>

        {/* Sparkline */}
        {spark && spark.length > 1 && (
          <div className="flex items-end gap-0.5 h-8">
            {spark.map((p, i) => {
              const pct = ((p.value - sparkMin) / sparkRange) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all"
                  style={{
                    height: `${Math.max(pct, 8)}%`,
                    background: def.color,
                    opacity: i === spark.length - 1 ? 1 : 0.35 + (i / spark.length) * 0.4,
                  }}
                />
              );
            })}
          </div>
        )}
      </motion.div>
    </TooltipProvider>
  );
}