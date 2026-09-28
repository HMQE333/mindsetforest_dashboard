import { useMemo } from "react";
import type { Category } from "@/lib/dashboard-data";
import { formatHm, type AppClass, type AppKind, type ClassificationSource, type RuleSource } from "@/lib/app-usage-classify";

export { formatHm };

export const KIND_LABELS: Record<AppKind, string> = {
  work: "Praca",
  learning: "Nauka",
  communication: "Komunikacja",
  watching: "Oglądanie",
  waste: "Marnowanie",
  neutral: "Neutralne",
};

export const UNASSIGNED_LABEL = "Nieprzypisane";

export const SOURCE_LABELS: Record<RuleSource, string> = {
  manual: "ręczna",
  label: "etykieta",
  learned: "wyuczona",
  suggested: "propozycja",
};

export const CLASSIFICATION_SOURCE_LABELS: Record<ClassificationSource, string> = {
  rule: "reguła",
  keyword: "słowo kluczowe",
  prior: "historia",
  none: "brak",
};

/** Reads a theme HSL triplet ("263 70% 58%") and returns a concrete colour for SVG fills. */
export function cssHsl(varName: string, alpha?: number): string {
  if (typeof window === "undefined") return "#888";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return "#888";
  return alpha === undefined ? `hsl(${raw})` : `hsl(${raw} / ${alpha})`;
}

export interface KindPalette extends Record<AppKind, string> {
  unassigned: string;
}

/** Kind fallback colours resolved from the current theme (computed once per mount). */
export function useKindPalette(): KindPalette {
  return useMemo(
    () => ({
      work: cssHsl("--primary"),
      learning: cssHsl("--cat-mind"),
      communication: cssHsl("--cat-networking"),
      watching: cssHsl("--muted-foreground", 0.75),
      waste: cssHsl("--destructive", 0.85),
      neutral: cssHsl("--muted-foreground", 0.4),
      unassigned: cssHsl("--stat-value", 0.5),
    }),
    [],
  );
}

/** class.color, else the pillar's colour, else the kind fallback. */
export function classColor(cls: AppClass, palette: KindPalette, categories: Category[]): string {
  if (cls.color) return cls.color;
  if (cls.pillar_id) {
    const cat = categories.find((c) => c.id === cls.pillar_id);
    if (cat?.color) return cat.color;
  }
  return palette[cls.kind] || palette.neutral;
}

/** "12 min temu", "2 godz. temu", "3 dni temu". */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "?";
  const diffMin = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  const h = Math.floor(diffMin / 60);
  if (h < 48) return `${h} godz. temu`;
  return `${Math.floor(h / 24)} dni temu`;
}

/** Local HH:MM for an ISO instant. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "+0:25" / "-1:10" / "0:00". */
export function signedHm(deltaSeconds: number): string {
  const sign = deltaSeconds > 0 ? "+" : deltaSeconds < 0 ? "-" : "";
  return `${sign}${formatHm(Math.abs(deltaSeconds))}`;
}

export function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const DAY_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

export function dayShortLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return DAY_SHORT[new Date(y, m - 1, d, 12).getDay()];
}

export function dayNumericLabel(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

/** Shortens a device id for the filter: "a1b2c3d4…". */
export function deviceLabel(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

export const pillBase = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border";
export const pillActive = "text-primary border-current bg-secondary/80";
export const pillIdle = "text-muted-foreground border-border/50 hover:border-border";

export function ClassChip({ name, color, muted }: { name: string; color: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ${muted ? "opacity-60" : ""}`}
      style={{ background: `${color}22`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

export const chartTooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
} as const;
