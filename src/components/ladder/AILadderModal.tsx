import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/dashboard-data";
import { LADDER_LEVELS, LadderTask } from "@/lib/ladder-data";

interface AILadderModalProps {
  categoryId: string;
  currentLadder: Record<number, LadderTask[]>;
  onApply: (level: number, tasks: LadderTask[]) => void;
  onClose: () => void;
  projectName?: string;
}

interface LevelSuggestion {
  level: number;
  tasks: string[];
}

type AIMode = "focused" | "strategic" | "recovery";
type TimeHorizon = "week" | "month" | "longterm";

export default function AILadderModal({ categoryId, currentLadder, onApply, onClose, projectName }: AILadderModalProps) {
  const category = CATEGORIES.find(c => c.id === categoryId);
  const displayName = projectName || category?.name || categoryId;
  const [suggestions, setSuggestions] = useState<LevelSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiMode, setAIMode] = useState<AIMode>("focused");
  const [generated, setGenerated] = useState(false);
  const [selectedLevels, setSelectedLevels] = useState<Set<number>>(new Set());

  // New controls state
  const [showControls, setShowControls] = useState(false);
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [focusLevels, setFocusLevels] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [tasksPerLevel, setTasksPerLevel] = useState(3);
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>("week");

  const toggleFocusLevel = (level: number) => {
    setFocusLevels(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level].sort()
    );
  };

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const currentTasks: Record<number, string[]> = {};
      Object.entries(currentLadder).forEach(([lvl, tasks]) => {
        currentTasks[Number(lvl)] = tasks.map(t => t.text).filter(Boolean);
      });

      const { data, error } = await supabase.functions.invoke("ai-ladder-suggest", {
        body: {
          categoryId,
          categoryName: displayName,
          categoryTagline: projectName ? "" : (category?.tagline || ""),
          currentTasks,
          projectName: projectName || undefined,
          aiMode,
          goal: goal || undefined,
          constraints: constraints || undefined,
          focusLevels,
          tasksPerLevel,
          timeHorizon,
        },
      });

      if (error) throw error;
      const items = (data?.levels || []) as LevelSuggestion[];
      setSuggestions(items);
      setSelectedLevels(new Set(items.map(l => l.level)));
      setGenerated(true);
    } catch (e) {
      console.error("AI ladder suggestion failed:", e);
    } finally {
      setLoading(false);
    }
  }, [categoryId, category, currentLadder, aiMode, goal, constraints, focusLevels, tasksPerLevel, timeHorizon]);

  const toggleLevel = (level: number) => {
    setSelectedLevels(prev => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  };

  const handleApply = () => {
    suggestions.forEach(s => {
      if (!selectedLevels.has(s.level)) return;
      const existingTasks = currentLadder[s.level] || [];
      const newTasks: LadderTask[] = s.tasks.map(text => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        text,
        completed: false,
      }));
      onApply(s.level, [...existingTasks, ...newTasks]);
    });
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(circle at 20% 30%, rgba(168,85,247,0.22), transparent 55%), radial-gradient(circle at 80% 60%, rgba(45,212,191,0.16), transparent 55%), linear-gradient(to bottom, rgba(0,0,0,0.66), rgba(0,0,0,0.82))",
        backdropFilter: "blur(10px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.99, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[700px] rounded-2xl border border-white/14 overflow-hidden max-h-[85vh] flex flex-col"
        style={{ background: "rgba(16,16,24,0.72)", backdropFilter: "blur(18px)", boxShadow: "0 24px 90px rgba(0,0,0,0.55)" }}
      >
        {/* Header */}
        <div className="p-4 flex items-start justify-between gap-3 border-b border-white/10"
          style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12), transparent 55%)" }}>
          <div className="flex gap-3 items-start min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/15 border border-primary/25 text-lg" style={{ filter: "drop-shadow(0 0 14px rgba(168,85,247,0.35))" }}>
              🧠
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">AI Ladder Suggestions · {displayName}</h2>
              <p className="text-xs text-foreground/60 truncate">Generate progression tasks for each level</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-9 rounded-xl border border-white/12 bg-white/5 text-foreground/80 hover:bg-white/12 transition-colors">✕</button>
        </div>

        {/* AI Mode */}
        <div className="p-4 border-b border-white/10">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80 mb-2">AI Mode</h3>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: "focused" as AIMode, label: "Focused", desc: "Concrete steps" },
              { value: "strategic" as AIMode, label: "Strategic", desc: "Growth-oriented" },
              { value: "recovery" as AIMode, label: "Recovery", desc: "Low friction" },
            ]).map(opt => (
              <button key={opt.value} onClick={() => setAIMode(opt.value)}
                className={`flex-1 min-w-[100px] p-3 rounded-xl border text-left transition-all ${
                  aiMode === opt.value ? "border-primary/30 bg-gradient-to-br from-primary/20 to-green-500/10" : "border-white/12 bg-white/[0.04] hover:bg-white/[0.08]"
                }`}>
                <span className="font-black text-sm text-foreground block">{opt.label}</span>
                <span className="text-[11px] text-foreground/50">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Context & Controls (collapsible) */}
        <div className="border-b border-white/10">
          <button
            onClick={() => setShowControls(prev => !prev)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors"
          >
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80">Context & Controls</h3>
            <span className={`text-foreground/50 text-sm transition-transform ${showControls ? "rotate-180" : ""}`}>▾</span>
          </button>
          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-3">
                  {/* Goal */}
                  <div>
                    <label className="text-xs font-bold text-foreground/70 mb-1 block">Goal</label>
                    <input
                      value={goal}
                      onChange={e => setGoal(e.target.value)}
                      placeholder="e.g. Trade options profitably, Run a half marathon..."
                      className="w-full px-3 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/40 transition-colors"
                    />
                  </div>

                  {/* Constraints */}
                  <div>
                    <label className="text-xs font-bold text-foreground/70 mb-1 block">Constraints</label>
                    <input
                      value={constraints}
                      onChange={e => setConstraints(e.target.value)}
                      placeholder="e.g. No gym access, Max 30 min per task, Budget under $50..."
                      className="w-full px-3 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/40 transition-colors"
                    />
                  </div>

                  {/* Focus Levels */}
                  <div>
                    <label className="text-xs font-bold text-foreground/70 mb-1.5 block">Focus Levels</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {LADDER_LEVELS.map((lvl, i) => {
                        const active = focusLevels.includes(i);
                        return (
                          <button
                            key={i}
                            onClick={() => toggleFocusLevel(i)}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                              active
                                ? "border-primary/30 bg-primary/15 text-foreground"
                                : "border-white/10 bg-white/[0.03] text-foreground/40 hover:bg-white/[0.06]"
                            }`}
                          >
                            {lvl.emoji} {lvl.title}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {/* Tasks Per Level */}
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground/70 mb-1 block">Tasks / Level</label>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(n => (
                          <button
                            key={n}
                            onClick={() => setTasksPerLevel(n)}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                              tasksPerLevel === n
                                ? "border-primary/30 bg-primary/15 text-foreground"
                                : "border-white/10 bg-white/[0.03] text-foreground/40 hover:bg-white/[0.06]"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time Horizon */}
                    <div className="flex-1">
                      <label className="text-xs font-bold text-foreground/70 mb-1 block">Time Horizon</label>
                      <div className="flex gap-1">
                        {([
                          { value: "week" as TimeHorizon, label: "Week" },
                          { value: "month" as TimeHorizon, label: "Month" },
                          { value: "longterm" as TimeHorizon, label: "Long" },
                        ]).map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setTimeHorizon(opt.value)}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                              timeHorizon === opt.value
                                ? "border-primary/30 bg-primary/15 text-foreground"
                                : "border-white/10 bg-white/[0.03] text-foreground/40 hover:bg-white/[0.06]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {!generated && !loading && (
            <div className="text-center py-10">
              <button onClick={generate} className="px-6 py-3 rounded-xl gradient-purple text-primary-foreground font-bold glow-md hover:-translate-y-0.5 transition-all">
                ✨ Generate Ladder Tasks
              </button>
            </div>
          )}
          {loading && (
            <div className="text-center py-10 text-foreground/50 animate-pulse">Generating ladder suggestions...</div>
          )}
          {suggestions.map(s => {
            const lvl = LADDER_LEVELS[s.level];
            const selected = selectedLevels.has(s.level);
            return (
              <div key={s.level}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${selected ? "border-green-500/30 bg-green-500/5" : "border-white/10 bg-white/[0.03]"}`}
                onClick={() => toggleLevel(s.level)}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? "border-green-500/45 bg-green-500/20" : "border-white/20 bg-black/10"}`}>
                    {selected && <span className="text-xs font-black text-foreground">✓</span>}
                  </div>
                  <span className="text-sm">{lvl?.emoji}</span>
                  <span className="font-bold text-sm text-gradient-purple">{lvl?.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{s.tasks.length} tasks</span>
                </div>
                <div className="ml-9 space-y-1">
                  {s.tasks.map((t, i) => (
                    <p key={i} className="text-xs text-foreground/70">• {t}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-end gap-3 bg-white/[0.03]">
          {generated && (
            <button onClick={generate} className="px-4 py-2 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all flex items-center gap-2">
              ⟳ Regenerate
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">
            ✕ Cancel
          </button>
          <button onClick={handleApply} disabled={selectedLevels.size === 0 || !generated}
            className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all ${
              selectedLevels.size > 0 && generated
                ? "border-primary/30 bg-gradient-to-r from-primary/20 to-pink-500/15 text-foreground hover:from-primary/30 hover:to-pink-500/22"
                : "opacity-45 pointer-events-none border-white/10 bg-white/5 text-foreground/50"
            }`}>
            ✓ Apply ({selectedLevels.size} levels)
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
