import { CalendarRange } from "lucide-react";
import { DATE_PRESETS, type DateFilter } from "@/lib/date-filter";

/** Any time / Today / 7 days / 30 days / This year / a custom from–to range. */
export default function DateFilterRow({ value, onChange, className = "" }: { value: DateFilter; onChange: (f: DateFilter) => void; className?: string }) {
  const custom = value.preset === "custom";
  const chip = (on: boolean) =>
    `rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${on ? "bg-primary/80 text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`;
  const input = "h-6 rounded-md border border-white/15 bg-background/60 px-1.5 text-[11px] text-foreground [color-scheme:dark] outline-none focus:border-primary/70";
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`} role="group" aria-label="Filter by date">
      <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {DATE_PRESETS.map((p) => (
        <button key={p.id} type="button" aria-pressed={value.preset === p.id} onClick={() => onChange({ preset: p.id })} className={chip(value.preset === p.id)}>
          {p.label}
        </button>
      ))}
      <button type="button" aria-pressed={custom} onClick={() => onChange(custom ? { preset: "all" } : { preset: "custom", from: value.from, to: value.to })} className={chip(custom)}>
        Range…
      </button>
      {custom && (
        <span className="flex items-center gap-1">
          <input type="date" aria-label="From" value={value.from ?? ""} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} className={input} />
          <span className="text-muted-foreground text-[11px]">–</span>
          <input type="date" aria-label="To" value={value.to ?? ""} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} className={input} />
        </span>
      )}
    </div>
  );
}
