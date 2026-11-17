import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Check, ChefHat, Minus, Package, Plus, RotateCcw, X } from "lucide-react";
import type { CookingRecipe } from "@/hooks/useCookingState";
import { MAX_BOXES, MIN_BOXES, boxContents, moveTo, parseIngredients, readBoxes, setCount, type RecipeBoxes } from "@/lib/recipe-boxes";

/**
 * Prep boxes. Lay a recipe's ingredients out into numbered boxes (drag, or
 * tap an ingredient and then a box), in the order they go into the pan.
 * Then Cook: one box at a time, big, "box 1 in", "box 2 in"... Little to
 * hold in your head while the pan is hot.
 */
const BOX_COLORS = ["#a855f7", "#f97316", "#22c55e", "#3b82f6", "#ec4899", "#eab308"];
const DRAG_TYPE = "text/x-ingredient";

export default function RecipeBoxesModal({ recipe, onSave, onClose }: { recipe: CookingRecipe; onSave: (b: RecipeBoxes) => Promise<boolean>; onClose: () => void }) {
  const ingredients = useMemo(() => parseIngredients(recipe.ingredients), [recipe.ingredients]);
  const [boxes, setBoxes] = useState<RecipeBoxes>(() => readBoxes(recipe.boxes));
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState<number | "table" | null>(null);
  const [mode, setMode] = useState<"arrange" | "cook">(() => (Object.keys(readBoxes(recipe.boxes).assign).length ? "cook" : "arrange"));
  const [step, setStep] = useState(0);
  const { boxes: inBox, loose } = boxContents(ingredients, boxes);

  // Saved a moment after the last change, and on close.
  const changed = useRef(false);
  const saved = useRef(boxes);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    if (boxes === saved.current) return;
    changed.current = true;
    const t = setTimeout(() => { saved.current = boxes; void saveRef.current(boxes); }, 600);
    return () => clearTimeout(t);
  }, [boxes]);
  const close = () => { if (changed.current && saved.current !== boxes) void onSave(boxes); onClose(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (mode === "cook" && (e.key === "ArrowRight" || e.key === " ")) { e.preventDefault(); setStep((s) => Math.min(boxes.count, s + 1)); }
      if (mode === "cook" && e.key === "ArrowLeft") setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const put = (key: string, box: number | null) => { setBoxes((b) => moveTo(b, key, box)); setPicked(null); };
  const dropOn = (box: number | null) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const key = e.dataTransfer.getData(DRAG_TYPE);
    if (key) put(key, box);
  };
  const dragOver = (target: number | "table") => (e: DragEvent) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(target); } };
  // Tapping a box or the table with an ingredient picked moves it there.
  const tapTarget = (box: number | null) => () => { if (picked) put(picked, box); };

  const chip = (key: string, text: string, color?: string) => (
    <button
      key={key}
      type="button"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, key); e.dataTransfer.effectAllowed = "move"; }}
      onClick={(e) => { e.stopPropagation(); setPicked(picked === key ? null : key); }}
      aria-pressed={picked === key}
      className={`max-w-full cursor-grab truncate rounded-lg border px-2.5 py-1.5 text-left text-sm transition-all active:cursor-grabbing ${picked === key ? "border-primary bg-primary/25 text-foreground ring-2 ring-primary/50" : "border-white/10 bg-white/[0.05] text-foreground/90 hover:border-white/25"}`}
      style={color && picked !== key ? { borderColor: `${color}55` } : undefined}
      title="Drag into a box, or tap it and then tap a box"
    >
      {text}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-background sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 truncate font-semibold">{recipe.title}</h2>
          <div className="flex rounded-lg bg-muted/40 p-0.5 text-xs font-semibold" role="group" aria-label="Mode">
            <button type="button" onClick={() => setMode("arrange")} aria-pressed={mode === "arrange"} className={`rounded-md px-2.5 py-1 ${mode === "arrange" ? "bg-primary/25 text-primary" : "text-muted-foreground"}`}>Arrange</button>
            <button type="button" onClick={() => { setMode("cook"); setStep(0); }} aria-pressed={mode === "cook"} className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${mode === "cook" ? "bg-primary/25 text-primary" : "text-muted-foreground"}`}><ChefHat className="h-3.5 w-3.5" /> Cook</button>
          </div>
          <button type="button" onClick={close} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {mode === "arrange" ? (
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {/* The table: ingredients not in a box yet. */}
            <div
              onDragOver={dragOver("table")}
              onDragLeave={() => setOver(null)}
              onDrop={dropOn(null)}
              onClick={tapTarget(null)}
              className={`rounded-xl border border-dashed p-3 transition-colors ${over === "table" || (picked && boxes.assign[picked] !== undefined) ? "border-primary/60 bg-primary/[0.06]" : "border-white/15"}`}
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                On the table {loose.length ? `(${loose.length})` : ""} <span className="font-normal normal-case tracking-normal">· drag into a box, or tap then tap a box</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {loose.length ? loose.map((i) => chip(i.key, i.text)) : <span className="text-xs text-muted-foreground">Everything is in a box. Ready to cook.</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {inBox.map((items, b) => {
                const color = BOX_COLORS[b % BOX_COLORS.length];
                return (
                  <div
                    key={b}
                    onDragOver={dragOver(b)}
                    onDragLeave={() => setOver(null)}
                    onDrop={dropOn(b)}
                    onClick={tapTarget(b)}
                    className={`min-h-28 rounded-2xl border-2 p-3 transition-colors ${over === b || (picked && boxes.assign[picked] !== b) ? "bg-white/[0.04]" : "bg-white/[0.02]"}`}
                    style={{ borderColor: over === b ? color : `${color}55` }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: color }}>{b + 1}</span>
                      <input
                        value={boxes.labels[b] ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { const labels = [...boxes.labels]; labels[b] = e.target.value.slice(0, 40); setBoxes({ ...boxes, labels }); }}
                        placeholder={b === 0 ? "e.g. aromatics" : b === boxes.count - 1 ? "e.g. to finish" : "name (optional)"}
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground/50 focus:outline-none"
                        aria-label={`Box ${b + 1} name`}
                      />
                      <span className="text-[11px] text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">{items.map((i) => chip(i.key, i.text, color))}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                Boxes
                <button type="button" disabled={boxes.count <= MIN_BOXES} onClick={() => setBoxes(setCount(boxes, boxes.count - 1))} className="rounded-md bg-muted/40 p-1 disabled:opacity-30" aria-label="One box less"><Minus className="h-3 w-3" /></button>
                <span className="w-4 text-center font-semibold text-foreground">{boxes.count}</span>
                <button type="button" disabled={boxes.count >= MAX_BOXES} onClick={() => setBoxes(setCount(boxes, boxes.count + 1))} className="rounded-md bg-muted/40 p-1 disabled:opacity-30" aria-label="One box more"><Plus className="h-3 w-3" /></button>
              </div>
              <button type="button" onClick={() => setBoxes({ ...boxes, assign: {} })} className="flex items-center gap-1 hover:text-foreground"><RotateCcw className="h-3 w-3" /> Empty all boxes</button>
            </div>
          </div>
        ) : (
          <CookSteps recipe={recipe} inBox={inBox} labels={boxes.labels} loose={loose.map((l) => l.text)} step={step} setStep={setStep} onArrange={() => setMode("arrange")} />
        )}
      </div>
    </div>
  );
}

/** Cooking: one box at a time, big; the instructions stay a tap away. */
function CookSteps({ recipe, inBox, labels, loose, step, setStep, onArrange }: {
  recipe: CookingRecipe; inBox: { key: string; text: string }[][]; labels: string[]; loose: string[];
  step: number; setStep: (n: number) => void; onArrange: () => void;
}) {
  const [showSteps, setShowSteps] = useState(false);
  const count = inBox.length;
  const done = step >= count;
  const empty = inBox.every((b) => b.length === 0);
  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
        Nothing is in a box yet.
        <button type="button" onClick={onArrange} className="rounded-lg bg-primary/20 px-3 py-1.5 font-semibold text-primary">Arrange the boxes</button>
      </div>
    );
  }
  const color = BOX_COLORS[Math.min(step, count - 1) % BOX_COLORS.length];
  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      {/* Progress: one dot per box. */}
      <div className="mb-4 flex items-center justify-center gap-2">
        {inBox.map((_, b) => (
          <button key={b} type="button" onClick={() => setStep(b)} className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-all ${b < step ? "text-white/90" : b === step ? "scale-110 text-white" : "bg-white/[0.05] text-muted-foreground"}`} style={b <= step ? { background: BOX_COLORS[b % BOX_COLORS.length], opacity: b < step ? 0.5 : 1 } : undefined} aria-label={`Box ${b + 1}`}>
            {b < step ? <Check className="h-4 w-4" /> : b + 1}
          </button>
        ))}
      </div>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="text-5xl">🍽️</span>
          <p className="text-lg font-semibold">All boxes in.</p>
          <button type="button" onClick={() => setStep(0)} className="text-xs text-muted-foreground hover:text-foreground">Start again</button>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-xl rounded-3xl border-2 p-5 sm:p-7" style={{ borderColor: color, background: `${color}10` }}>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl font-bold text-white" style={{ background: color }}>{step + 1}</span>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Box {step + 1} of {count}</p>
              {labels[step] && <p className="text-xl font-bold">{labels[step]}</p>}
            </div>
          </div>
          {inBox[step].length ? (
            <ul className="space-y-2">
              {inBox[step].map((i) => <li key={i.key} className="text-lg leading-snug sm:text-xl">• {i.text}</li>)}
            </ul>
          ) : <p className="text-sm text-muted-foreground">This box is empty.</p>}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-2">
        <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-xl bg-muted/40 px-4 py-2.5 text-sm font-semibold disabled:opacity-30">Back</button>
        {!done && (
          <button type="button" onClick={() => setStep(step + 1)} className="rounded-xl px-6 py-2.5 text-sm font-bold text-white" style={{ background: color }}>
            {step + 1 < count ? `Box ${step + 1} in → next` : "Last box in"}
          </button>
        )}
      </div>

      {loose.length > 0 && <p className="mt-3 text-center text-xs text-amber-300/80">Not in a box: {loose.join(", ")}</p>}

      {recipe.instructions.trim() && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <button type="button" onClick={() => setShowSteps((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">{showSteps ? "Hide" : "Show"} the recipe's steps</button>
          {showSteps && <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground/80">{recipe.instructions}</pre>}
        </div>
      )}
    </div>
  );
}
