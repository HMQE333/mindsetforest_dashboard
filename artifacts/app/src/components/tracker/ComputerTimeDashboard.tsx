import { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import type { Category } from "@/lib/dashboard-data";
import { addDays, daysBetween, todayKey } from "@/lib/today";
import {
  classifyAll,
  logicalMinutesOfDay,
  weekdayBaseline,
  type AppClass,
  type AppKind,
  type ClassifyContext,
  type UsageAggregate,
  type UsageSession,
  type WeekdayBaseline,
} from "@/lib/app-usage-classify";
import { EMPTY } from "@/lib/utils";
import {
  ClassChip,
  KIND_LABELS,
  UNASSIGNED_LABEL,
  chartTooltipStyle,
  chipVariant,
  classColor,
  formatHm,
  pct,
  signedHm,
  tint,
  useKindPalette,
} from "./computer-time-shared";

interface Props {
  classes: AppClass[];
  categories: Category[];
  ctx: ClassifyContext;
  agg: UsageAggregate;
  /** Inclusive range the sessions cover. */
  from: string;
  to: string;
  /** Full sessions (with titles) for the given day keys, so title rules apply to the baseline too. */
  fetchSessionsForDates: (dates: string[]) => Promise<UsageSession[]>;
}

const TILE_KINDS: AppKind[] = ["work", "learning", "communication", "watching", "waste"];
const BASELINE_WEEKS = [1, 2, 3, 4];

/** Higher is better for productive kinds; for waste a drop is the good news. */
function deltaTone(kind: AppKind | "unassigned", delta: number): string {
  if (delta === 0) return "text-muted-foreground";
  const goodWhenUp = kind === "work" || kind === "learning";
  const goodWhenDown = kind === "waste" || kind === "unassigned";
  const good = (delta > 0 && goodWhenUp) || (delta < 0 && goodWhenDown);
  const bad = (delta < 0 && goodWhenUp) || (delta > 0 && goodWhenDown);
  return good ? "text-green-400" : bad ? "text-destructive" : "text-muted-foreground";
}

interface BaselineState {
  baseline: WeekdayBaseline | null;
  /** True when the day compared is today and the baseline was cut at the current time of day. */
  partial: boolean;
}

export default function ComputerTimeDashboard({ classes, categories, ctx, agg, from, to, fetchSessionsForDates }: Props) {
  const palette = useKindPalette();
  const singleDay = from === to;
  const dayCount = Math.max(1, daysBetween(from, to) + 1);

  // Baseline: the same weekday over the previous four weeks, median over the
  // days that have data, truncated to the current time of day for a partial today.
  const [state, setState] = useState<BaselineState>({ baseline: null, partial: false });
  useEffect(() => {
    if (!singleDay) {
      setState({ baseline: null, partial: false });
      return;
    }
    let cancelled = false;
    const dates = BASELINE_WEEKS.map((w) => addDays(to, -7 * w));
    const partial = to === todayKey();
    const cutoff = partial ? logicalMinutesOfDay(new Date()) : null;
    fetchSessionsForDates(dates).then((rows) => {
      if (cancelled) return;
      const baseline = rows.length === 0 ? null : weekdayBaseline(rows, classes, classifyAll(rows, ctx), dates, cutoff);
      setState({ baseline, partial });
    });
    return () => {
      cancelled = true;
    };
  }, [singleDay, to, classes, ctx, fetchSessionsForDates]);

  const baseline = state.baseline;

  const tiles = useMemo(() => {
    const list: { key: AppKind | "unassigned"; label: string; seconds: number; base: number | null; color: string }[] = TILE_KINDS.map((k) => ({
      key: k,
      label: KIND_LABELS[k],
      seconds: agg.byKind[k],
      base: baseline ? baseline.byKind[k] : null,
      color: palette[k],
    }));
    list.push({
      key: "unassigned",
      label: UNASSIGNED_LABEL,
      seconds: agg.unclassifiedSeconds,
      base: baseline ? baseline.unclassified : null,
      color: palette.unassigned,
    });
    return list;
  }, [agg, baseline, palette]);

  const donut = useMemo(() => {
    const slices = classes
      .map((c) => ({ id: c.id, name: c.name, value: agg.byClass[c.id] || 0, color: classColor(c, palette, categories) }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
    if (agg.unclassifiedSeconds > 0) slices.push({ id: "", name: UNASSIGNED_LABEL, value: agg.unclassifiedSeconds, color: palette.unassigned });
    return slices;
  }, [classes, agg, palette, categories]);

  const top = useMemo(() => agg.topAppKeys.slice(0, 10), [agg]);
  const maxTop = Math.max(1, ...top.map((t) => t.seconds));
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const focus = agg.focusRatio;

  return (
    <div className="space-y-6">
      {/* Summary line */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          <strong className="text-stat-value font-mono">{formatHm(agg.totalSeconds)}</strong> przy komputerze
        </span>
        {!singleDay && (
          <span>
            <strong className="text-stat-value font-mono">{formatHm(agg.totalSeconds / dayCount)}</strong> / dzień
          </span>
        )}
        {agg.idleSeconds > 0 && (
          <span>
            <strong className="font-mono">{formatHm(agg.idleSeconds)}</strong> bezczynności
          </span>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
            focus === null
              ? "border-border/50 text-muted-foreground"
              : focus >= 0.6
                ? "border-green-400/40 text-green-400 bg-green-400/10"
                : focus >= 0.4
                  ? "border-yellow-400/40 text-yellow-400 bg-yellow-400/10"
                  : "border-destructive/40 text-destructive bg-destructive/10"
          }`}
          title="Praca + nauka podzielone przez cały aktywny czas poza klasami neutralnymi"
        >
          Skupienie {focus === null ? EMPTY : `${Math.round(focus * 100)}%`}
        </span>
      </div>

      {/* Kind tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map((t) => {
          const delta = t.base === null ? null : t.seconds - t.base;
          return (
            <div key={t.key} className="bg-secondary/40 rounded-xl p-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
                {t.label}
              </div>
              <div className="text-xl font-bold font-mono text-stat-value">{formatHm(t.seconds)}</div>
              {singleDay ? (
                <div className={`text-[10px] font-semibold mt-0.5 ${delta === null ? "text-muted-foreground" : deltaTone(t.key, delta)}`}>
                  {delta === null ? `${EMPTY} brak porównania` : `${signedHm(delta)} vs mediana`}
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground mt-0.5">{formatHm(t.seconds / dayCount)} / dzień</div>
              )}
            </div>
          );
        })}
      </div>
      {singleDay && (
        <p className="text-[10px] text-muted-foreground -mt-3">
          {baseline
            ? `Porównanie z medianą tego samego dnia tygodnia z ${baseline.days} ${baseline.days === 1 ? "dnia" : "dni"} w poprzednich 4 tygodniach${
                state.partial ? ", liczoną do tej samej pory dnia" : ""
              }.`
            : "Brak porównania: potrzebne są co najmniej 2 takie same dni tygodnia z danymi w poprzednich 4 tygodniach."}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Klasy</div>
          {donut.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Brak zliczonego czasu w tym zakresie.</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2} stroke="none">
                      {donut.map((s) => (
                        <Cell key={s.id || "unassigned"} fill={s.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(value) => [formatHm(Number(value)), ""]}
                      separator=""
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 w-full space-y-1.5 min-w-0">
                {donut.map((s) => (
                  <li key={s.id || "unassigned"} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="truncate text-foreground/80">{s.name}</span>
                    <span className="ml-auto font-mono text-muted-foreground shrink-0">
                      {formatHm(s.value)} <span className="text-[10px]">({pct(s.value, agg.totalSeconds)})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Top apps */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">Top aplikacje</div>
          {top.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Brak sesji.</p>
          ) : (
            <div className="space-y-2">
              {top.map((t) => {
                const cls = t.classId ? classById.get(t.classId) : undefined;
                const color = cls ? classColor(cls, palette, categories) : palette.unassigned;
                return (
                  <div key={t.appKey} className="flex items-center gap-3" title={t.titles.join("\n")}>
                    <div className="w-36 sm:w-44 shrink-0 min-w-0">
                      <div className="text-xs font-semibold truncate text-foreground/90">{t.appKey}</div>
                      <div className="mt-0.5">
                        <ClassChip name={cls ? cls.name : UNASSIGNED_LABEL} color={color} variant={chipVariant(t.confidence, !!cls)} title={t.why} />
                      </div>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(4, (t.seconds / maxTop) * 100)}%`, background: color, boxShadow: `0 0 8px ${tint(color, 40)}` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono text-muted-foreground w-12 text-right shrink-0">{formatHm(t.seconds)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
