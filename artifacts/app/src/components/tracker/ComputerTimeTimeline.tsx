import { useEffect, useMemo, useState } from "react";
import type { Category } from "@/lib/dashboard-data";
import type { AppClass, Classification, UsageSession } from "@/lib/app-usage-classify";
import { ClassChip, UNASSIGNED_LABEL, classColor, clockTime, formatHm, useKindPalette } from "./computer-time-shared";

interface Props {
  sessions: UsageSession[];
  classifications: Classification[];
  classes: AppClass[];
  categories: Category[];
  from: string;
  to: string;
}

const PAGE = 200;

export default function ComputerTimeTimeline({ sessions, classifications, classes, categories, from, to }: Props) {
  const palette = useKindPalette();
  const [day, setDay] = useState(to);
  const [shown, setShown] = useState(PAGE);

  // Keep the picked day inside the loaded range when the range changes.
  useEffect(() => {
    setDay((d) => (d < from || d > to ? to : d));
    setShown(PAGE);
  }, [from, to]);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const rows = useMemo(() => {
    const out: { s: UsageSession; c: Classification }[] = [];
    sessions.forEach((s, i) => {
      if (s.local_date === day) out.push({ s, c: classifications[i] });
    });
    out.sort((a, b) => a.s.started_at.localeCompare(b.s.started_at));
    return out;
  }, [sessions, classifications, day]);

  const dayTotal = useMemo(() => rows.reduce((sum, r) => sum + (r.s.idle ? 0 : r.s.seconds), 0), [rows]);
  const visible = rows.slice(0, shown);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Dzień</label>
        <input
          type="date"
          value={day}
          min={from}
          max={to}
          onChange={(e) => {
            if (e.target.value) {
              setDay(e.target.value);
              setShown(PAGE);
            }
          }}
          className="bg-secondary/40 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground"
        />
        <span className="text-xs text-muted-foreground">
          {rows.length} sesji, <strong className="font-mono text-stat-value">{formatHm(dayTotal)}</strong> aktywnie
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Brak sesji tego dnia.</p>
      ) : (
        <div className="space-y-0.5">
          {visible.map(({ s, c }) => {
            const cls = c.classId ? classById.get(c.classId) : undefined;
            const color = cls ? classColor(cls, palette, categories) : palette.unassigned;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 sm:gap-3 px-2 py-1.5 rounded-lg text-xs hover:bg-secondary/30 transition-colors ${
                  s.idle ? "opacity-45" : ""
                }`}
                title={s.window_title || s.app_key}
              >
                <span className="font-mono text-muted-foreground w-11 shrink-0">{clockTime(s.started_at)}</span>
                <span className="font-mono text-foreground/70 w-12 shrink-0 text-right">{formatHm(s.seconds)}</span>
                <span className="font-semibold text-foreground/90 w-24 sm:w-36 shrink-0 truncate">{s.app}</span>
                <span className="flex-1 min-w-0 truncate text-muted-foreground">
                  {s.idle && <span className="mr-1 text-[10px] uppercase tracking-wider">bezczynność</span>}
                  {s.window_title || s.app_key}
                </span>
                <span className="shrink-0 hidden sm:inline-flex">
                  <ClassChip name={cls ? cls.name : UNASSIGNED_LABEL} color={color} muted={!cls} />
                </span>
              </div>
            );
          })}
          {rows.length > shown && (
            <button onClick={() => setShown((n) => n + PAGE)} className="mt-3 text-[11px] font-semibold text-primary hover:underline">
              Pokaż więcej ({rows.length - shown} pozostało)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
