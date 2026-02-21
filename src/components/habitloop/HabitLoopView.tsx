import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useHabitLoopState } from "@/hooks/useHabitLoopState";
import { CATEGORIES } from "@/lib/dashboard-data";
import { isLoopComplete } from "@/lib/habit-loop-data";
import HabitLoopCard from "./HabitLoopCard";
import AIHabitLoopModal from "./AIHabitLoopModal";
import MasteryOverlay from "@/components/ladder/MasteryOverlay";

export default function HabitLoopView() {
  const { currentState, activeCategory, loading, changeCategory, logRep, addTask, deleteTask, setLoops, resetLoop } = useHabitLoopState();
  const [showAI, setShowAI] = useState(false);
  const [showMastery, setShowMastery] = useState(false);
  const [masteryKey, setMasteryKey] = useState(0);
  const prevAllComplete = useRef(false);

  const loops = currentState.loops;
  const currentLoop = currentState.currentLoop;

  // Detect when a loop completes
  useEffect(() => {
    const allComplete = loops.length > 0 && loops.every(l => isLoopComplete(l));
    if (allComplete && !prevAllComplete.current) {
      setMasteryKey(k => k + 1);
      setShowMastery(true);
      setTimeout(() => setShowMastery(false), 4000);
    }
    prevAllComplete.current = allComplete;
  }, [loops]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground animate-pulse">Loading habit loops...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Category selector + AI button */}
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Category</label>
          <select
            value={activeCategory}
            onChange={e => changeCategory(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 backdrop-blur-lg text-foreground text-sm outline-none cursor-pointer"
          >
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id} className="bg-background text-foreground">{c.icon} {c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          {loops.length > 0 && (
            <button onClick={resetLoop} className="px-4 py-2.5 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">
              ↺ Reset
            </button>
          )}
          <button
            onClick={() => setShowAI(true)}
            className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all"
          >
            🧠 AI Generate
          </button>
        </div>
      </div>

      {/* Title */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
        <h2 className="text-3xl font-bold text-gradient-purple mb-2">🔄 Habit Loop</h2>
        <p className="text-muted-foreground">Build habits through repetition. Complete reps to advance.</p>
      </motion.div>

      {/* Loops */}
      {loops.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <p className="text-muted-foreground mb-4">No habit loops yet. Generate some with AI or add manually.</p>
          <button onClick={() => setShowAI(true)} className="px-6 py-3 rounded-xl gradient-purple text-primary-foreground font-bold glow-md hover:-translate-y-0.5 transition-all">
            ✨ Generate Habit Loops
          </button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {loops.map((loop, i) => (
            <HabitLoopCard
              key={i}
              loop={loop}
              loopIndex={i}
              isActive={i === currentLoop}
              isCompleted={i < currentLoop || isLoopComplete(loop)}
              onLogRep={logRep}
              onAddTask={addTask}
              onDeleteTask={deleteTask}
            />
          ))}
        </div>
      )}

      <div className="text-center mt-10 pt-6 border-t border-white/10 text-xs text-muted-foreground">
        💾 Your progress is automatically saved
      </div>

      {/* AI Modal */}
      <AnimatePresence>
        {showAI && (
          <AIHabitLoopModal
            categoryId={activeCategory}
            onApply={setLoops}
            onClose={() => setShowAI(false)}
          />
        )}
      </AnimatePresence>

      <MasteryOverlay key={masteryKey} show={showMastery} />
    </div>
  );
}
