import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/dashboard-data";
import { HabitLoop } from "@/lib/habit-loop-data";

interface AIHabitLoopModalProps {
  categoryId: string;
  onApply: (loops: HabitLoop[]) => void;
  onClose: () => void;
}

type AIMode = "focused" | "strategic" | "recovery";
type TimeHorizon = "week" | "month" | "longterm";

interface LoopSuggestion {
  name: string;
  repsRequired: number;
  tasks: string[];
}

export default function AIHabitLoopModal({ categoryId, onApply, onClose }: AIHabitLoopModalProps) {
  const category = CATEGORIES.find(c => c.id === categoryId);
  const [suggestions, setSuggestions] = useState<LoopSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiMode, setAIMode] = useState<AIMode>("focused");
  const [generated, setGenerated] = useState(false);

  const [showControls, setShowControls] = useState(false);
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>("week");

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-habit-loop-suggest", {
        body: {
          categoryId,
          categoryName: category?.name || categoryId,
          categoryTagline: category?.tagline || "",
          aiMode,
          goal: goal || undefined,
          constraints: constraints || undefined,
          timeHorizon,
        },
      });
      if (error) throw error;
      setSuggestions((data?.loops || []) as LoopSuggestion[]);
      setGenerated(true);
    } catch (e) {
      console.error("AI habit loop suggestion failed:", e);
    } finally {
      setLoading(false);
    }
  }, [categoryId, category, aiMode, goal, constraints, timeHorizon]);

  const handleApply = () => {
    const loops: HabitLoop[] = suggestions.map(s => ({
      name: s.name,
      repsRequired: s.repsRequired,
      tasks: s.tasks.map(text => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        text,
        completedReps: 0,
      })),
    }));
    onApply(loops);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(circle at 20% 30%, rgba(168,85,247,0.22), transparent 55%), radial-gradient(circle at 80% 60%, rgba(45,212,191,0.16), transparent 55%), linear-gradient(to bottom, rgba(0,0,0,0.66), rgba(0,0,0,0.82))",
        backdropFilter: "blur(10px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.99, y: 8 }} animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[700px] rounded-2xl border border-white/14 overflow-hidden max-h-[85vh] flex flex-col"
        style={{ background: "rgba(16,16,24,0.72)", backdropFilter: "blur(18px)", boxShadow: "0 24px 90px rgba(0,0,0,0.55)" }}
      >
        {/* Header */}
        <div className="p-4 flex items-start justify-between gap-3 border-b border-white/10"
          style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12), transparent 55%)" }}>
          <div className="flex gap-3 items-start min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/15 border border-primary/25 text-lg" style={{ filter: "drop-shadow(0 0 14px rgba(168,85,247,0.35))" }}>
              🔄
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">AI Habit Loops · {category?.name}</h2>
              <p className="text-xs text-foreground/60 truncate">Generate progressive habit cycles</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-9 rounded-xl border border-white/12 bg-white/5 text-foreground/80 hover:bg-white/12 transition-colors">✕</button>
        </div>

        {/* AI Mode */}
        <div className="p-4 border-b border-white/10">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80 mb-2">AI Mode</h3>
          <div className="flex gap-2 flex-wrap">
            {([
              { value: "focused" as AIMode, label: "Focused", desc: "Concrete habits" },
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

        {/* Context & Controls */}
        <div className="border-b border-white/10">
          <button onClick={() => setShowControls(prev => !prev)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.03] transition-colors">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80">Context & Controls</h3>
            <span className={`text-foreground/50 text-sm transition-transform ${showControls ? "rotate-180" : ""}`}>▾</span>
          </button>
          <AnimatePresence>
            {showControls && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <label className="text-xs font-bold text-foreground/70 mb-1 block">Goal</label>
                    <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="e.g. Build a daily meditation practice..."
                      className="w-full px-3 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/40 transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground/70 mb-1 block">Constraints</label>
                    <input value={constraints} onChange={e => setConstraints(e.target.value)} placeholder="e.g. Max 20 min per habit, no equipment..."
                      className="w-full px-3 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/40 transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-foreground/70 mb-1 block">Time Horizon</label>
                    <div className="flex gap-1">
                      {([
                        { value: "week" as TimeHorizon, label: "Week" },
                        { value: "month" as TimeHorizon, label: "Month" },
                        { value: "longterm" as TimeHorizon, label: "Long-term" },
                      ]).map(opt => (
                        <button key={opt.value} onClick={() => setTimeHorizon(opt.value)}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                            timeHorizon === opt.value ? "border-primary/30 bg-primary/15 text-foreground" : "border-white/10 bg-white/[0.03] text-foreground/40 hover:bg-white/[0.06]"
                          }`}>{opt.label}</button>
                      ))}
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
                ✨ Generate Habit Loops
              </button>
            </div>
          )}
          {loading && (
            <div className="text-center py-10 text-foreground/50 animate-pulse">Generating habit loops...</div>
          )}
          {suggestions.map((s, i) => (
            <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm">{i === 0 ? "🌱" : i === 1 ? "🌿" : "🌳"}</span>
                <span className="font-bold text-sm text-gradient-purple">Loop {i + 1}: {s.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{s.repsRequired} reps × {s.tasks.length} tasks</span>
              </div>
              <div className="ml-8 space-y-1">
                {s.tasks.map((t, j) => (
                  <p key={j} className="text-xs text-foreground/70">• {t}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-end gap-3 bg-white/[0.03]">
          {generated && (
            <button onClick={generate} className="px-4 py-2 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">⟳ Regenerate</button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">✕ Cancel</button>
          <button onClick={handleApply} disabled={!generated || suggestions.length === 0}
            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all ${
              generated && suggestions.length > 0
                ? "border-primary/30 bg-gradient-to-r from-primary/20 to-pink-500/15 text-foreground hover:from-primary/30 hover:to-pink-500/22"
                : "opacity-45 pointer-events-none border-white/10 bg-white/5 text-foreground/50"
            }`}>
            ✓ Apply Loops
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
