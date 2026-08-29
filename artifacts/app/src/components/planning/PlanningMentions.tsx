import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, AlertTriangle, ExternalLink } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { usePaths } from "@/hooks/usePaths";
import { PlanningMention } from "@/hooks/usePlanningState";

/** Shared dispatch helper. Fired both from the side panel and from canvas chips. */
export function navigateToMention(m: PlanningMention) {
  window.dispatchEvent(new CustomEvent("lov:navigate-module", {
    detail: { module: "paths", pathId: m.pathId },
  }));
}

function isPathMention(m: unknown): m is PlanningMention {
  return !!m && typeof m === "object" && (m as PlanningMention).kind === "path";
}

interface Props {
  mentions: PlanningMention[];
  onChange: (next: PlanningMention[]) => void;
}

/**
 * Link a planning node to a Path. The old version made you pick a module tab,
 * then a category, then a ladder level or a loop index - three decisions for
 * one link. Now it is one list of paths.
 */
export default function PlanningMentions({ mentions, onChange }: Props) {
  const { getCategories, preferences } = useUserSettings();
  const { paths } = usePaths();
  const [adding, setAdding] = useState(false);

  const enabled = preferences.enabledModules || [];
  if (enabled.length > 0 && !enabled.includes("paths")) return null;

  const categories = getCategories();
  // Legacy ladder/loop mentions from before the merge are dropped on read.
  const safeMentions = (mentions || []).filter(isPathMention);
  const livePaths = paths.filter(p => !p.archived);

  const addPath = (pathId: string) => {
    if (safeMentions.some(m => m.pathId === pathId)) { setAdding(false); return; }
    onChange([...safeMentions, { kind: "path", pathId }]);
    setAdding(false);
  };

  const removeMention = (idx: number) => onChange(safeMentions.filter((_, i) => i !== idx));

  return (
    <div className="rounded-xl bg-muted/10 border border-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Paths</p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-all ${
            adding ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {adding ? "Cancel" : "Link"}
        </button>
      </div>

      {safeMentions.length > 0 && (
        <div className="space-y-1.5">
          {safeMentions.map((m, idx) => {
            const path = paths.find(p => p.id === m.pathId);
            const category = categories.find(c => c.id === path?.category_id);
            return (
              <div
                key={`${m.pathId}-${idx}`}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                  path ? "border-violet-500/30 bg-violet-500/5" : "border-destructive/30 bg-destructive/5"
                }`}
              >
                <button
                  onClick={() => navigateToMention(m)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                  title="Open in Paths"
                >
                  <span className="text-base">{category?.icon || "🪜"}</span>
                  {path ? (
                    <span className="text-[11px] text-foreground truncate">{path.name}</span>
                  ) : (
                    <span className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> deleted
                    </span>
                  )}
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/60 flex-shrink-0" />
                </button>
                <button onClick={() => removeMention(idx)} className="text-muted-foreground/60 hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {safeMentions.length === 0 && !adding && (
        <p className="text-[10px] text-muted-foreground/70 italic">Link this node to one of your paths.</p>
      )}

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1 pt-2 border-t border-white/5 overflow-hidden"
          >
            {livePaths.length === 0 ? (
              <p className="text-[10px] text-muted-foreground/70 italic px-1">No paths yet.</p>
            ) : (
              <div className="space-y-1 max-h-[160px] overflow-y-auto">
                {livePaths.map(p => {
                  const category = categories.find(c => c.id === p.category_id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addPath(p.id)}
                      className="w-full text-left text-[11px] px-2 py-1.5 rounded-md border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 text-foreground transition-colors truncate"
                    >
                      {category?.icon || "🪜"} {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
