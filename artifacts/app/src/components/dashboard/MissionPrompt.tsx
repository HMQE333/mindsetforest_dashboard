import { useEffect, useRef, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { formatMinutes } from "@/lib/mission-amount";

/**
 * The quiet question after a mission: how much (pages, reps) or how long.
 * A small card in the corner, no sound, never in the way of the list. It
 * offers a number; the user's own number is the one saved. Ignored, it goes
 * away and nothing is logged.
 */
export type PromptModel =
  | { kind: "amount"; title: string; target: string; unit: string; value: number; /** Step of −/+; hours use 0.25. */ step?: number }
  | {
      kind: "time";
      title: string;
      /** Where the minutes go, if anywhere ("Learning", or null: only the plan-vs-actual note). */
      target: string | null;
      elapsed: number;
      planned: number | null;
      value: number;
      /** Why the starting value differs from the clock, in a few words; null when it is the clock. */
      hint: string | null;
      /** Offer to tick the mission too (it was not done yet). */
      canComplete: boolean;
    };

interface Props {
  model: PromptModel;
  onSave: (value: number, complete: boolean) => void;
  onDismiss: () => void;
}

/** Amount prompts go away by themselves; a stopped timer waits (it holds a measured time). */
const AMOUNT_HIDE_MS = 15_000;

export default function MissionPrompt({ model, onSave, onDismiss }: Props) {
  // The field keeps what is typed ("1.", ""); the number is read from it.
  const [text, setText] = useState(String(model.value));
  const [complete, setComplete] = useState(model.kind === "time" && model.canComplete);
  const [touched, setTouched] = useState(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => { setText(String(model.value)); setTouched(false); setComplete(model.kind === "time" && model.canComplete); }, [model]);
  useEffect(() => {
    if (model.kind !== "amount" || touched) return;
    const t = setTimeout(() => dismissRef.current(), AMOUNT_HIDE_MS);
    return () => clearTimeout(t);
  }, [model, touched]);

  const step = model.kind === "time" ? 5 : model.step ?? (model.value >= 20 ? 5 : 1);
  // Minutes are whole; amounts keep up to two decimals (1.25 h, 2.5 km).
  const clean = (n: number) => Math.max(0, model.kind === "time" ? Math.round(n) : Math.round(n * 100) / 100);
  const parsed = Number(text.replace(",", "."));
  const value = Number.isFinite(parsed) ? clean(parsed) : 0;
  const set = (n: number) => { setTouched(true); setText(String(clean(n))); };
  const chip = "rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-foreground/70 hover:bg-white/[0.12] hover:text-foreground";

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-background/85 p-3 text-xs shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
      onPointerDown={() => setTouched(true)}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 truncate text-foreground/60" title={model.title}>{model.title}</p>
        <button type="button" onClick={onDismiss} className="text-foreground/40 hover:text-foreground" aria-label="Skip">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" onClick={() => set(value - step)} className="rounded-lg bg-white/[0.06] p-1 hover:bg-white/[0.12]" aria-label="Less"><Minus className="h-3.5 w-3.5" /></button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={model.kind === "time" ? 1 : "any"}
          value={text}
          onChange={(e) => { setTouched(true); setText(e.target.value); }}
          onBlur={() => setText(String(value))}
          className="w-16 rounded-lg border border-white/10 bg-background/60 px-2 py-1 text-center text-sm font-semibold text-foreground outline-none focus:border-primary/60"
          aria-label={model.kind === "time" ? "Minutes" : model.unit || "Amount"}
        />
        <button type="button" onClick={() => set(value + step)} className="rounded-lg bg-white/[0.06] p-1 hover:bg-white/[0.12]" aria-label="More"><Plus className="h-3.5 w-3.5" /></button>
        <span className="min-w-0 truncate text-foreground/70">
          {model.kind === "time" ? "min" : model.unit}
          {model.target && <span className="text-foreground/40"> → {model.target}</span>}
        </span>
        <button
          type="button"
          onClick={() => onSave(value, complete)}
          disabled={value <= 0}
          className="ml-auto flex items-center gap-1 rounded-lg bg-primary/80 px-2.5 py-1 font-semibold text-primary-foreground hover:bg-primary disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> Save
        </button>
      </div>

      {model.kind === "time" && (
        <div className="mt-2 space-y-1.5 text-foreground/50">
          <div className="flex flex-wrap items-center gap-1">
            <span>Timer {formatMinutes(model.elapsed)}{model.planned ? ` · plan ${formatMinutes(model.planned)}` : ""}</span>
            <span className="ml-auto flex gap-1">
              <button type="button" className={chip} onClick={() => set(model.elapsed)}>all</button>
              <button type="button" className={chip} onClick={() => set(model.elapsed * 0.75)}>~¾</button>
              <button type="button" className={chip} onClick={() => set(model.elapsed - 10)}>−10</button>
            </span>
          </div>
          {model.hint && <p className="text-[11px] text-foreground/40">{model.hint}</p>}
          {model.canComplete && (
            <label className="flex items-center gap-1.5 text-foreground/60">
              <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} className="accent-primary" /> Tick the mission
            </label>
          )}
        </div>
      )}
    </div>
  );
}
