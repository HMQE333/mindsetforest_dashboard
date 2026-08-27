import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, AlertTriangle, ExternalLink } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useMemo } from "react";
import { useLadderState } from "@/hooks/useLadderState";
import { useHabitLoopState } from "@/hooks/useHabitLoopState";
import { LADDER_LEVELS } from "@/lib/ladder-data";
import { PlanningMention } from "@/hooks/usePlanningState";

/** Shared dispatch helper. Fired both from the side panel and from canvas chips. */
export function navigateToMention(m: PlanningMention) {
  if (m.kind === "ladder") {
    window.dispatchEvent(new CustomEvent("lov:navigate-module", {
      detail: { module: "ladder", categoryId: m.categoryId, level: m.level },
    }));
  } else {
    window.dispatchEvent(new CustomEvent("lov:navigate-module", {
      detail: { module: "habitloop", categoryId: m.categoryId, loopIndex: m.loopIndex },
    }));
  }
}

function dedupe(list: PlanningMention[]): PlanningMention[] {
  const seen = new Set<string>();
  const out: PlanningMention[] = [];
  for (const m of list) {
    const key = m.kind === "ladder"
      ? `l:${m.categoryId}:${m.level}`
      : `h:${m.categoryId}:${m.loopIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

interface Props {
  mentions: PlanningMention[];
  onChange: (next: PlanningMention[]) => void;
}

export default function PlanningMentions({ mentions, onChange }: Props) {
  const { getCategories, preferences } = useUserSettings();
  const { ladders } = useLadderState();
  const { projects: habitProjects } = useHabitLoopState();

  // Compat: lookup by category (mentions still reference category IDs).
  const loopsByCategory = useMemo(() => {
    const map: Record<string, any> = {};
    habitProjects.forEach(p => { if (p.category) map[p.category] = { currentLoop: p.currentLoop, loops: p.loops }; });
    return map;
  }, [habitProjects]);

  const enabled = preferences.enabledModules || [];
  const ladderOn = enabled.length === 0 || enabled.includes("ladder");
  const loopOn = enabled.length === 0 || enabled.includes("habitloop");

  const categories = getCategories();

  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"ladder" | "loop">(ladderOn ? "ladder" : "loop");
  const [pickedCategory, setPickedCategory] = useState<string>(categories[0]?.id || "mind");

  if (!ladderOn && !loopOn) return null;

  const safeMentions = mentions || [];

  const removeMention = (idx: number) => {
    const next = safeMentions.filter((_, i) => i !== idx);
    onChange(next);
  };

  const addLadder = (categoryId: string, level: number) => {
    onChange(dedupe([...safeMentions, { kind: "ladder", categoryId, level }]));
    setAdding(false);
  };

  const addLoop = (categoryId: string, loopIndex: number) => {
    onChange(dedupe([...safeMentions, { kind: "loop", categoryId, loopIndex }]));
    setAdding(false);
  };

  const renderMentionRow = (m: PlanningMention, idx: number) => {
    const cat = categories.find(c => c.id === m.categoryId);
    const catLabel = cat ? `${cat.icon} ${cat.name}` : m.categoryId;

    if (m.kind === "ladder") {
      const meta = LADDER_LEVELS[m.level];
      const exists = !!meta;
      return (
        <div key={`l-${idx}`} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${exists ? "border-violet-500/30 bg-violet-500/5" : "border-destructive/30 bg-destructive/5"}`}>
          <button
            onClick={() => navigateToMention(m)}
            className="flex-1 flex items-center gap-2 text-left min-w-0"
            title="Open in Mastery Ladder"
          >
            <span className="text-base">🪜</span>
            <span className="text-[11px] text-muted-foreground truncate">{catLabel}</span>
            {exists ? (
              <span className="text-[10px] font-semibold text-violet-300">L{m.level} · {meta.title}</span>
            ) : (
              <span className="text-[10px] font-semibold text-destructive flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> missing</span>
            )}
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/60 flex-shrink-0" />
          </button>
          <button onClick={() => removeMention(idx)} className="text-muted-foreground/60 hover:text-destructive transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      );
    }

    const loopState = loopsByCategory[m.categoryId];
    const loop = loopState?.loops?.[m.loopIndex];
    const exists = !!loop;
    return (
      <div key={`h-${idx}`} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${exists ? "border-cyan-500/30 bg-cyan-500/5" : "border-destructive/30 bg-destructive/5"}`}>
        <button
          onClick={() => navigateToMention(m)}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
          title="Open in Habit Loop"
        >
          <span className="text-base">🔄</span>
          <span className="text-[11px] text-muted-foreground truncate">{catLabel}</span>
          {exists ? (
            <span className="text-[10px] font-semibold text-cyan-300 truncate">{loop.name || `Loop ${m.loopIndex + 1}`}</span>
          ) : (
            <span className="text-[10px] font-semibold text-destructive flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> missing</span>
          )}
          <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/60 flex-shrink-0" />
        </button>
        <button onClick={() => removeMention(idx)} className="text-muted-foreground/60 hover:text-destructive transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  };

  const loopsForCategory = loopsByCategory[pickedCategory]?.loops || [];

  return (
    <div className="rounded-xl bg-muted/10 border border-white/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Mentions</p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-all ${adding ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
        >
          {adding ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {adding ? "Cancel" : "Add"}
        </button>
      </div>

      {safeMentions.length > 0 && (
        <div className="space-y-1.5">
          {safeMentions.map(renderMentionRow)}
        </div>
      )}

      {safeMentions.length === 0 && !adding && (
        <p className="text-[10px] text-muted-foreground/70 italic">Link this node to a Ladder level or Habit Loop.</p>
      )}

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 pt-2 border-t border-white/5"
          >
            {/* Tab switcher (only shows if both modules enabled) */}
            {ladderOn && loopOn && (
              <div className="flex gap-1 p-0.5 bg-muted/20 rounded-lg">
                <button
                  onClick={() => setTab("ladder")}
                  className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all ${tab === "ladder" ? "bg-violet-500/20 text-violet-200" : "text-muted-foreground hover:text-foreground"}`}
                >🪜 Ladder</button>
                <button
                  onClick={() => setTab("loop")}
                  className={`flex-1 text-[10px] font-semibold py-1 rounded-md transition-all ${tab === "loop" ? "bg-cyan-500/20 text-cyan-200" : "text-muted-foreground hover:text-foreground"}`}
                >🔄 Loop</button>
              </div>
            )}

            {/* Category selector */}
            <div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Category</p>
              <select
                value={pickedCategory}
                onChange={e => setPickedCategory(e.target.value)}
                className="w-full bg-muted/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>

            {/* Ladder picker */}
            {(tab === "ladder" || !loopOn) && ladderOn && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Level</p>
                <div className="grid grid-cols-3 gap-1">
                  {LADDER_LEVELS.map(lvl => (
                    <button
                      key={lvl.level}
                      onClick={() => addLadder(pickedCategory, lvl.level)}
                      className={`text-[10px] font-semibold py-1.5 rounded-md border bg-gradient-to-br ${lvl.colors.bg} ${lvl.colors.border} ${lvl.colors.text} hover:scale-105 transition-transform`}
                    >
                      {lvl.emoji} {lvl.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loop picker */}
            {(tab === "loop" || !ladderOn) && loopOn && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Loop</p>
                {loopsForCategory.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/70 italic px-1">
                    No loops in this category yet.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-[140px] overflow-y-auto">
                    {loopsForCategory.map((loop, idx) => (
                      <button
                        key={idx}
                        onClick={() => addLoop(pickedCategory, idx)}
                        className="w-full text-left text-[11px] px-2 py-1.5 rounded-md border border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 text-foreground transition-colors truncate"
                      >
                        🔄 {loop.name || `Loop ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}