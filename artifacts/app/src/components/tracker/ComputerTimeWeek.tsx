import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";
import { lastNDays } from "@/lib/today";
import { APP_KINDS, type AppKind, type UsageAggregate } from "@/lib/app-usage-classify";
import { KIND_LABELS, UNASSIGNED_LABEL, chartTooltipStyle, dayNumericLabel, dayShortLabel, formatHm, useKindPalette } from "./computer-time-shared";

interface Props {
  agg: UsageAggregate;
  /** Number of days to show ending on `to`. */
  days: number;
  to: string;
}

type Row = { date: string; label: string; unassigned: number; total: number } & Record<AppKind, number>;

const SERIES: (AppKind | "unassigned")[] = [...APP_KINDS, "unassigned"];

export default function ComputerTimeWeek({ agg, days, to }: Props) {
  const palette = useKindPalette();

  const data = useMemo<Row[]>(() => {
    const byDate = new Map(agg.byDay.map((d) => [d.date, d]));
    return lastNDays(days, to).map((date) => {
      const d = byDate.get(date);
      const row = {
        date,
        label: days > 10 ? dayNumericLabel(date) : dayShortLabel(date),
        unassigned: d ? d.unclassified / 3600 : 0,
        total: d ? d.total / 3600 : 0,
      } as Row;
      for (const k of APP_KINDS) row[k] = d ? d.byKind[k] / 3600 : 0;
      return row;
    });
  }, [agg, days, to]);

  const activeDays = data.filter((d) => d.total > 0).length;
  const avg = activeDays > 0 ? data.reduce((s, d) => s + d.total, 0) / activeDays : 0;
  const best = useMemo(() => {
    const scored = agg.byDay.filter((d) => d.focusRatio !== null && d.total >= 1800);
    if (scored.length === 0) return null;
    const sorted = [...scored].sort((a, b) => (b.focusRatio ?? 0) - (a.focusRatio ?? 0));
    return { best: sorted[0], worst: sorted[sorted.length - 1] };
  }, [agg]);

  return (
    <div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-4">
        <span>
          <strong className="text-stat-value font-mono">{activeDays}</strong> aktywnych dni
        </span>
        <span>
          <strong className="text-stat-value font-mono">{formatHm(avg * 3600)}</strong> średnio / aktywny dzień
        </span>
        {best && best.best.date !== best.worst.date && (
          <>
            <span>
              najlepsze skupienie: <strong className="text-green-400 font-mono">{dayNumericLabel(best.best.date)}</strong>{" "}
              ({Math.round((best.best.focusRatio ?? 0) * 100)}%)
            </span>
            <span>
              najsłabsze: <strong className="text-destructive font-mono">{dayNumericLabel(best.worst.date)}</strong>{" "}
              ({Math.round((best.worst.focusRatio ?? 0) * 100)}%)
            </span>
          </>
        )}
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap={days > 10 ? "20%" : "35%"}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={days > 10 ? 3 : 0} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} unit="h" allowDecimals={false} />
            <RechartsTooltip
              cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
              contentStyle={chartTooltipStyle}
              labelFormatter={(_, payload) => {
                const row = payload && payload[0] ? (payload[0].payload as Row) : null;
                return row ? `${row.date}. Razem ${formatHm(row.total * 3600)}` : "";
              }}
              formatter={(value, name) => [formatHm(Number(value) * 3600), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
            {SERIES.map((k) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="day"
                name={k === "unassigned" ? UNASSIGNED_LABEL : KIND_LABELS[k]}
                fill={k === "unassigned" ? palette.unassigned : palette[k]}
                radius={k === "unassigned" ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
