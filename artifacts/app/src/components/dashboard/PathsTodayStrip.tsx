import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { TodayStep } from "@/lib/path-data";
import { Category } from "@/lib/dashboard-data";

interface Props {
  steps: TodayStep[];
  categories: Category[];
  onLog: (step: TodayStep) => void;
  onUndo: (stepId: string) => void;
  onOpenPaths: () => void;
}

/**
 * The only thing Paths puts on Home: the current step of each live path.
 * One row per path, never more - the category grid stays untouched below it.
 */
export default function PathsTodayStrip({ steps, categories, onLog, onUndo, onOpenPaths }: Props) {
  if (steps.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3.5 mb-5"
    >
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          🪜 On your paths
        </p>
        <button
          onClick={onOpenPaths}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          open →
        </button>
      </div>

      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {steps.map(({ path, step, loggedToday, streak }) => {
            const category = categories.find(c => c.id === path.category_id);
            return (
              <motion.div
                key={step.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all ${
                  loggedToday ? "border-green-500/20 bg-green-500/5" : "border-white/8 bg-white/[0.02]"
                }`}
              >
                <span className="text-sm flex-shrink-0">{category?.icon || "🪜"}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${loggedToday ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {path.name}
                    {step.mode === "reps" && ` · ${step.reps_done}/${step.reps_target} days`}
                    {streak > 1 && ` · 🔥${streak}`}
                  </p>
                </div>
                {loggedToday ? (
                  <button
                    onClick={() => onUndo(step.id)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-green-500/30 bg-green-500/10 text-green-300 flex-shrink-0"
                    title="Logged today - click to undo"
                  >
                    <Check className="h-3 w-3 inline" />
                  </button>
                ) : (
                  <button
                    onClick={() => onLog({ path, step, loggedToday, streak })}
                    className="px-3 py-1 rounded-lg text-[11px] font-bold gradient-purple text-primary-foreground glow-sm hover:-translate-y-0.5 transition-all flex-shrink-0"
                  >
                    +{step.xp} XP
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
