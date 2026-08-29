import { useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown, Trash2, Check, Sparkles, Archive } from "lucide-react";
import { Path, PathStep, activeStep, nextStep, pathProgress, sortSteps } from "@/lib/path-data";
import { Category } from "@/lib/dashboard-data";

interface Props {
  path: Path;
  steps: PathStep[];
  loggedTodayIds: Set<string>;
  streakOf: (stepId: string) => number;
  categories: Category[];
  onLog: (stepId: string) => void;
  onUndo: (stepId: string) => void;
  onAddStep: (title: string, repsTarget: number) => void;
  onUpdateStep: (id: string, patch: Partial<PathStep>) => void;
  onDeleteStep: (id: string) => void;
  onMoveStep: (id: string, dir: -1 | 1) => void;
  onUpdatePath: (patch: Partial<Pick<Path, "name" | "category_id" | "archived">>) => void;
  onDeletePath: () => void;
  onAI: () => void;
  /** Opened from a Planning mention - expand so the link lands somewhere useful. */
  focused?: boolean;
}

export default function PathCard({
  path, steps, loggedTodayIds, streakOf, categories,
  onLog, onUndo, onAddStep, onUpdateStep, onDeleteStep, onMoveStep,
  onUpdatePath, onDeletePath, onAI, focused,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(path.name);
  const [newTitle, setNewTitle] = useState("");
  const [newReps, setNewReps] = useState(1);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState<string | null>(null);

  useEffect(() => { if (focused) setExpanded(true); }, [focused]);

  const ordered = sortSteps(steps);
  const progress = pathProgress(ordered);
  const active = activeStep(ordered);
  const upcoming = nextStep(ordered);
  const category = categories.find(c => c.id === path.category_id);
  const finished = ordered.length > 0 && !active;

  const submitName = () => {
    const name = nameDraft.trim();
    if (name && name !== path.name) onUpdatePath({ name });
    else setNameDraft(path.name);
    setEditingName(false);
  };

  const submitNewStep = () => {
    const title = newTitle.trim();
    if (!title) return;
    onAddStep(title, Math.max(1, newReps));
    setNewTitle("");
    setNewReps(1);
  };

  const renderStepRow = (step: PathStep, index: number) => {
    const isActive = active?.id === step.id;
    const loggedToday = loggedTodayIds.has(step.id);
    const streak = step.mode === "reps" ? streakOf(step.id) : 0;
    const pct = step.mode === "reps"
      ? Math.min(100, Math.round((step.reps_done / Math.max(1, step.reps_target)) * 100))
      : step.done ? 100 : 0;

    return (
      <div
        key={step.id}
        className={`group rounded-xl border px-3 py-2.5 transition-all ${
          step.done
            ? "border-green-500/20 bg-green-500/5"
            : isActive
              ? "border-primary/30 bg-primary/5"
              : "border-white/8 bg-white/[0.02]"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm w-5 text-center flex-shrink-0">
            {step.done ? "✅" : isActive ? "▶️" : "·"}
          </span>

          {editingStep === step.id ? (
            <input
              defaultValue={step.title}
              autoFocus
              onBlur={e => {
                const title = e.target.value.trim();
                if (title && title !== step.title) onUpdateStep(step.id, { title });
                setEditingStep(null);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingStep(null);
              }}
              className="flex-1 min-w-0 bg-background/60 border border-primary/40 rounded-lg px-2 py-1 text-sm text-foreground outline-none"
            />
          ) : (
            <button
              onClick={() => setEditingStep(step.id)}
              className={`flex-1 min-w-0 text-left text-sm truncate ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}
              title="Click to rename"
            >
              {step.title}
            </button>
          )}

          {step.mode === "reps" && (
            <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">
              {step.reps_done}/{step.reps_target}
            </span>
          )}
          {streak > 1 && (
            <span className="text-[11px] font-bold text-amber-300 flex-shrink-0" title={`${streak} day streak`}>
              🔥{streak}
            </span>
          )}

          {isActive && (
            loggedToday ? (
              <button
                onClick={() => onUndo(step.id)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-green-500/30 bg-green-500/10 text-green-300 flex-shrink-0"
                title="Logged today - click to undo"
              >
                <Check className="h-3 w-3 inline" /> today
              </button>
            ) : (
              <button
                onClick={() => onLog(step.id)}
                className="px-3 py-1 rounded-lg text-[11px] font-bold gradient-purple text-primary-foreground glow-sm hover:-translate-y-0.5 transition-all flex-shrink-0"
              >
                {step.mode === "reps" ? "+1 day" : "Done"}
              </button>
            )
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button onClick={() => onMoveStep(step.id, -1)} disabled={index === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20">
              <ArrowUp className="h-3 w-3" />
            </button>
            <button onClick={() => onMoveStep(step.id, 1)} disabled={index === ordered.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-20">
              <ArrowDown className="h-3 w-3" />
            </button>
            <button onClick={() => onDeleteStep(step.id)} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {step.mode === "reps" && !step.done && (
          <div className="mt-1.5 ml-7 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    );
  };

  /** Steps are grouped only when the user (or AI) actually named a stage. */
  const renderSteps = () => {
    const out: ReactNode[] = [];
    let lastStage: string | null = null;
    ordered.forEach((step, i) => {
      const stage = step.stage || null;
      if (stage && stage !== lastStage) {
        out.push(
          <p key={`stage-${step.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-1 pl-1">
            {stage}
          </p>,
        );
      }
      lastStage = stage;
      out.push(renderStepRow(step, i));

      if (editingStage === step.id) {
        out.push(
          <input
            key={`stage-edit-${step.id}`}
            defaultValue={step.stage || ""}
            autoFocus
            placeholder="Stage label (optional)..."
            onBlur={e => {
              onUpdateStep(step.id, { stage: e.target.value.trim() || null });
              setEditingStage(null);
            }}
            onKeyDown={e => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingStage(null);
            }}
            className="w-full bg-background/60 border border-primary/40 rounded-lg px-2 py-1 text-xs text-foreground outline-none"
          />,
        );
      }
    });
    return out;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <select
          value={path.category_id || ""}
          onChange={e => onUpdatePath({ category_id: e.target.value || null })}
          className="bg-transparent text-lg outline-none cursor-pointer flex-shrink-0"
          title="Category"
        >
          <option value="">🏷️</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.icon}</option>
          ))}
        </select>

        {editingName ? (
          <input
            value={nameDraft}
            autoFocus
            onChange={e => setNameDraft(e.target.value)}
            onBlur={submitName}
            onKeyDown={e => {
              if (e.key === "Enter") submitName();
              if (e.key === "Escape") { setNameDraft(path.name); setEditingName(false); }
            }}
            className="flex-1 min-w-0 bg-background/60 border border-primary/40 rounded-lg px-2 py-1 text-sm font-bold text-foreground outline-none"
          />
        ) : (
          <button onClick={() => setEditingName(true)} className="flex-1 min-w-0 text-left">
            <span className="font-bold text-foreground truncate">{path.name}</span>
            {category && <span className="ml-2 text-[11px] text-muted-foreground">{category.name}</span>}
          </button>
        )}

        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
          {progress.done}/{progress.total}
        </span>
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all flex-shrink-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full gradient-purple transition-all duration-500"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* Collapsed: only what's next */}
      {!expanded && (
        <div className="mt-3 space-y-2">
          {ordered.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No steps yet - expand to add them, or let AI draft them.</p>
          )}
          {finished && (
            <p className="text-xs text-green-400 font-semibold">🏆 Path complete.</p>
          )}
          {active && renderStepRow(active, ordered.findIndex(s => s.id === active.id))}
          {upcoming && (
            <p className="text-[11px] text-muted-foreground/60 pl-8 truncate">next · {upcoming.title}</p>
          )}
        </div>
      )}

      {/* Expanded: the whole path */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5">{renderSteps()}</div>

            {/* Add step: title + how many days. Leave the number at 1 for a one-off. */}
            <div className="mt-3 flex items-center gap-2">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitNewStep()}
                placeholder="Next step..."
                className="flex-1 min-w-0 bg-background/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
              />
              <div className="flex items-center gap-1 flex-shrink-0" title="How many separate days? 1 = do it once">
                <span className="text-xs text-muted-foreground">×</span>
                <input
                  type="number"
                  min={1}
                  value={newReps}
                  onChange={e => setNewReps(Math.max(1, Number(e.target.value) || 1))}
                  className="w-12 bg-background/60 border border-white/10 rounded-lg px-1.5 py-1.5 text-sm text-center text-foreground outline-none focus:border-primary/40"
                />
              </div>
              <button
                onClick={submitNewStep}
                className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground flex-shrink-0"
              >
                Add
              </button>
            </div>

            {/* Card actions */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={onAI}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20 transition-all"
              >
                <Sparkles className="h-3 w-3" /> AI draft steps
              </button>
              {active && (
                <button
                  onClick={() => setEditingStage(active.id)}
                  className="px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground transition-all"
                >
                  Label stage
                </button>
              )}
              <button
                onClick={() => onUpdatePath({ archived: true })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground transition-all ml-auto"
              >
                <Archive className="h-3 w-3" /> Archive
              </button>
              <button
                onClick={onDeletePath}
                className="px-3 py-1.5 rounded-lg text-xs border border-destructive/25 text-destructive/80 hover:bg-destructive/10 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
