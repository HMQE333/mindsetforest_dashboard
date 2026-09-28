import { useMemo, useState } from "react";
import type { Category } from "@/lib/dashboard-data";
import type { AppClass, UsageAggregate } from "@/lib/app-usage-classify";
import { ClassChip, UNASSIGNED_LABEL, chipVariant, classColor, formatHm, pct, useKindPalette } from "./computer-time-shared";

interface Props {
  agg: UsageAggregate;
  classes: AppClass[];
  categories: Category[];
  from: string;
  to: string;
}

const PAGE = 30;

export default function ComputerTimeAllTime({ agg, classes, categories, from, to }: Props) {
  const palette = useKindPalette();
  const [shown, setShown] = useState(PAGE);
  const [query, setQuery] = useState("");
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? agg.topAppKeys.filter((t) => t.appKey.toLowerCase().includes(q) || t.titles.some((x) => x.toLowerCase().includes(q)))
      : agg.topAppKeys;
  }, [agg, query]);
  const max = Math.max(1, ...list.slice(0, 1).map((t) => t.seconds));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs text-muted-foreground">
          {agg.topAppKeys.length} aplikacji, <strong className="font-mono text-stat-value">{formatHm(agg.totalSeconds)}</strong>{" "}
          ({from === to ? from : `${from} do ${to}`})
        </span>
        <input
          value={query}
          aria-label="Filtruj aplikacje"
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Filtruj…"
          className="ml-auto bg-secondary/40 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground w-40"
        />
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Brak sesji w tym zakresie.</p>
      ) : (
        <div className="space-y-2">
          {list.slice(0, shown).map((t, i) => {
            const cls = t.classId ? classById.get(t.classId) : undefined;
            const color = cls ? classColor(cls, palette, categories) : palette.unassigned;
            return (
              <div key={t.appKey} className="flex items-center gap-3" title={t.titles.join("\n")}>
                <span className="text-[10px] font-mono text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                <div className="w-40 sm:w-56 shrink-0 min-w-0">
                  <div className="text-xs font-semibold truncate text-foreground/90">{t.appKey}</div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {t.sessions} sesji{t.titles[0] ? `. ${t.titles[0]}` : ""}
                  </div>
                </div>
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(3, (t.seconds / max) * 100)}%`, background: color }}
                  />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground w-12 text-right shrink-0">{formatHm(t.seconds)}</span>
                <span className="text-[10px] font-mono text-muted-foreground w-9 text-right shrink-0">{pct(t.seconds, agg.totalSeconds)}</span>
                <span className="hidden md:inline-flex shrink-0 w-28 justify-end">
                  <ClassChip name={cls ? cls.name : UNASSIGNED_LABEL} color={color} variant={chipVariant(t.confidence, !!cls)} title={t.why} />
                </span>
              </div>
            );
          })}
          {list.length > shown && (
            <button onClick={() => setShown((n) => n + PAGE)} className="mt-2 text-[11px] font-semibold text-primary hover:underline">
              Pokaż więcej ({list.length - shown} pozostało)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
