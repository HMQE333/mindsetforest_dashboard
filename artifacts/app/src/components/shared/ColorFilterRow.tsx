import { Palette } from "lucide-react";
import { HUES, HUE_SWATCH } from "@/lib/image-palette";

/** Colour dots: only notes (or pictures) with a real part of that colour. Shows the colours present. */
export default function ColorFilterRow({
  hues,
  value,
  onChange,
  className = "",
}: {
  /** Colours per note or picture; a dot shows for each colour found at least once. */
  hues: ReadonlyMap<string, ReadonlySet<string>> | ReadonlySet<string>;
  value: string | null;
  onChange: (hue: string | null) => void;
  className?: string;
}) {
  const present = new Set<string>();
  if (hues instanceof Map) for (const set of hues.values()) for (const h of set) present.add(h);
  else for (const h of hues as ReadonlySet<string>) present.add(h);
  const shown = HUES.filter((h) => present.has(h) || h === value);
  if (!shown.length) return null;
  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`} role="group" aria-label="Filter by colour">
      <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {shown.map((h) => (
        <button
          key={h}
          type="button"
          aria-pressed={value === h}
          title={value === h ? `Showing ${h}. Click for every colour` : `Pictures with ${h}`}
          onClick={() => onChange(value === h ? null : h)}
          className={`h-5 w-5 rounded-full border transition-transform ${value === h ? "scale-110 border-primary ring-2 ring-primary/60" : "border-white/25 hover:scale-110"}`}
          style={{ background: HUE_SWATCH[h] }}
        >
          <span className="sr-only">{h}</span>
        </button>
      ))}
      {value && (
        <button type="button" onClick={() => onChange(null)} className="text-[11px] text-muted-foreground hover:text-foreground ml-1">
          {value} ✕
        </button>
      )}
    </div>
  );
}
