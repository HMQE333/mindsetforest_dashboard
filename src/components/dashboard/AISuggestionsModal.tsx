import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CATEGORIES, Mission } from "@/lib/dashboard-data";
import { supabase } from "@/integrations/supabase/client";

interface LadderContext {
  activeCategory: string;
  currentLevel: string;
  completedTasks: string[];
  totalCompleted: number;
  totalTasks: number;
}

interface AISuggestionsModalProps {
  categoryId: string;
  currentMissions: Mission[];
  onApply: (categoryId: string, missions: Mission[]) => void;
  onClose: () => void;
  ladderContext?: LadderContext | null;
}

interface Suggestion extends Mission {
  selected: boolean;
  reason?: string;
}

type ApplyMode = "replace" | "add" | "append";
type AIMode = "focused" | "strategic" | "recovery";

export default function AISuggestionsModal({ categoryId, currentMissions, onApply, onClose, ladderContext }: AISuggestionsModalProps) {
  const category = CATEGORIES.find(c => c.id === categoryId)!;
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyMode, setApplyMode] = useState<ApplyMode>("replace");
  const [aiMode, setAIMode] = useState<AIMode>("focused");
  const [useLadder, setUseLadder] = useState(false);
  const [generated, setGenerated] = useState(false);

  const selectedCount = suggestions.filter(s => s.selected).length;

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        categoryId: category.id,
        categoryName: category.name,
        categoryTagline: category.tagline,
        currentMissions: currentMissions.map(m => m.title),
        aiMode,
      };
      if (useLadder && ladderContext) {
        body.ladderContext = ladderContext;
      }
      const { data, error } = await supabase.functions.invoke("ai-mission-suggest", { body });

      if (error) throw error;
      const items = (data?.suggestions || []) as Array<{ title: string; description: string; duration: string; xp: number; reason?: string }>;
      setSuggestions(items.map(s => ({ ...s, selected: false })));
      setGenerated(true);
    } catch (e) {
      console.error("AI suggestion failed:", e);
    } finally {
      setLoading(false);
    }
  }, [category, currentMissions, aiMode, useLadder, ladderContext]);

  const toggleSuggestion = (index: number) => {
    setSuggestions(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const handleApply = () => {
    const selected = suggestions.filter(s => s.selected).map(({ selected, reason, ...m }) => m);
    if (selected.length === 0) return;

    let result: Mission[];
    if (applyMode === "replace") {
      result = selected;
    } else if (applyMode === "add") {
      result = [...currentMissions, ...selected];
    } else {
      result = [...currentMissions, ...selected];
    }

    onApply(categoryId, result);
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
        className="w-full max-w-[980px] rounded-2xl border border-white/14 overflow-hidden"
        style={{
          background: "rgba(16,16,24,0.72)",
          backdropFilter: "blur(18px)",
          boxShadow: "0 24px 90px rgba(0,0,0,0.55)",
        }}
      >
        {/* Top */}
        <div className="p-4 flex items-start justify-between gap-3 border-b border-white/10"
          style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.12), transparent 55%), linear-gradient(225deg, rgba(45,212,191,0.08), transparent 55%)" }}>
          <div className="flex gap-3 items-start min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/15 border border-primary/25 text-lg" style={{ filter: "drop-shadow(0 0 14px rgba(168,85,247,0.35))" }}>
              🧠
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-foreground">AI Suggestions · {category.name}</h2>
              <p className="text-xs text-foreground/60 truncate">Generated for today · {category.tagline}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-9 rounded-xl border border-white/12 bg-white/5 text-foreground/80 hover:bg-white/12 transition-colors">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-4">
          {/* Left: Suggestions */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
            <div className="p-3 border-b border-white/[0.08] flex justify-between items-center">
              <span className="font-extrabold text-xs uppercase tracking-wider text-foreground/80">Suggestions</span>
              <span className="text-xs text-foreground/50">
                {generated ? `${selectedCount} selected` : "Click generate to start"}
              </span>
            </div>
            <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto">
              {!generated && !loading && (
                <div className="text-center py-10">
                  <button
                    onClick={generate}
                    className="px-6 py-3 rounded-xl gradient-purple text-primary-foreground font-bold glow-md hover:-translate-y-0.5 transition-all"
                  >
                    ✨ Generate Suggestions
                  </button>
                </div>
              )}
              {loading && (
                <div className="text-center py-10 text-foreground/50 animate-pulse">
                  Generating suggestions...
                </div>
              )}
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={`flex gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                    s.selected ? "border-green-500/30 bg-green-500/5" : "border-white/10 bg-white/[0.035] hover:border-white/18 hover:bg-white/[0.06]"
                  }`}
                  onClick={() => toggleSuggestion(i)}
                >
                  <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                    s.selected ? "border-green-500/45 bg-green-500/20" : "border-white/20 bg-black/10"
                  }`}>
                    {s.selected && <span className="text-xs font-black text-foreground">✓</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm text-foreground">{s.title}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                      <span className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-foreground/70">
                        ⏱ {s.duration}
                      </span>
                      <span className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-foreground/70">
                        ⭐ {s.xp} XP
                      </span>
                    </div>
                    {s.reason && (
                      <p className="mt-2 text-xs text-foreground/50 p-2 rounded-xl border border-dashed border-white/15 bg-black/10 leading-relaxed">
                        {s.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Controls */}
          <div className="space-y-3">
            <div className="p-3 rounded-2xl border border-white/10 bg-white/[0.04]">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80 mb-2">Apply mode</h3>
              <p className="text-xs text-foreground/50 mb-3">How selected suggestions affect your tasks.</p>
              <div className="space-y-2">
                {([
                  { value: "replace" as ApplyMode, label: "Replace current tasks", desc: "Clean slate. Recommended." },
                  { value: "add" as ApplyMode, label: "Add as new tasks", desc: "Keep existing, append selected." },
                  { value: "append" as ApplyMode, label: "Append to bottom", desc: "Preserve order, add as optional." },
                ]).map(opt => (
                  <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    applyMode === opt.value ? "border-primary/30 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/18"
                  }`}>
                    <input type="radio" name="applyMode" value={opt.value} checked={applyMode === opt.value}
                      onChange={() => setApplyMode(opt.value)} className="mt-0.5 accent-primary" />
                    <div>
                      <strong className="text-sm text-foreground block">{opt.label}</strong>
                      <small className="text-xs text-foreground/50">{opt.desc}</small>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Ladder toggle */}
            {ladderContext && (
              <div className="p-3 rounded-2xl border border-white/10 bg-white/[0.04]">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80 mb-2">Ladder Context</h3>
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  useLadder ? "border-primary/30 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/18"
                }`}>
                  <input type="checkbox" checked={useLadder} onChange={e => setUseLadder(e.target.checked)} className="accent-primary" />
                  <div>
                    <strong className="text-sm text-foreground block">🪜 Generate from Ladder</strong>
                    <small className="text-xs text-foreground/50">
                      Use your {ladderContext.activeCategory} ladder progress ({ladderContext.totalCompleted}/{ladderContext.totalTasks} tasks) to generate smarter missions
                    </small>
                  </div>
                </label>
              </div>
            )}

            <div className="p-3 rounded-2xl border border-white/10 bg-white/[0.04]">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground/80 mb-2">AI mode</h3>
              <div className="flex gap-2 flex-wrap mt-2">
                {([
                  { value: "focused" as AIMode, label: "Focused", desc: "Concrete, execution-first" },
                  { value: "strategic" as AIMode, label: "Strategic", desc: "Bottlenecks & unlocks" },
                  { value: "recovery" as AIMode, label: "Recovery", desc: "Low energy, low friction" },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAIMode(opt.value)}
                    className={`flex-1 min-w-[110px] p-3 rounded-xl border text-left transition-all ${
                      aiMode === opt.value
                        ? "border-primary/30 bg-gradient-to-br from-primary/20 to-green-500/10 shadow-[0_0_0_3px_rgba(168,85,247,0.10)]"
                        : "border-white/12 bg-white/[0.04] hover:bg-white/[0.08]"
                    }`}
                  >
                    <span className="font-black text-sm text-foreground block">{opt.label}</span>
                    <span className="text-[11px] text-foreground/50">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between gap-3 bg-white/[0.03]">
          <div className="flex items-center gap-3 text-xs text-foreground/50 min-w-0">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.12)] flex-shrink-0" />
            <span className="truncate">Ready</span>
          </div>
          <div className="flex gap-3 flex-wrap justify-end">
            {generated && (
              <button onClick={generate} className="px-4 py-2 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all flex items-center gap-2">
                ⟳ Regenerate
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">
              ✕ Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={selectedCount === 0}
              className={`px-4 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all ${
                selectedCount > 0
                  ? "border-primary/30 bg-gradient-to-r from-primary/20 to-pink-500/15 text-foreground hover:from-primary/30 hover:to-pink-500/22 hover:border-primary/45"
                  : "opacity-45 pointer-events-none border-white/10 bg-white/5 text-foreground/50"
              }`}
            >
              ✓ Apply selected ({selectedCount})
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
