import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLadderState } from "@/hooks/useLadderState";
import { CATEGORIES } from "@/lib/dashboard-data";
import LadderStep from "./LadderStep";
import ProgressJar from "./ProgressJar";
import AILadderModal from "./AILadderModal";
import MasteryOverlay from "./MasteryOverlay";

export default function LadderView() {
  const { ladders, activeCategory, loading, changeCategory, addTask, updateTask, deleteTask, setLevelTasks, getProgress, isLevelComplete } = useLadderState();
  const [showAI, setShowAI] = useState(false);
  const [masteryKey, setMasteryKey] = useState(0);
  const [showMastery, setShowMastery] = useState(false);
  const prevMastered = useRef(false);

  const progress = getProgress();
  const currentLadder = ladders[activeCategory]?.levels || {};

  // Check for mastery
  useEffect(() => {
    const isMastered = progress.total > 0 && progress.completed === progress.total;
    if (isMastered && !prevMastered.current) {
      setMasteryKey(k => k + 1);
      setShowMastery(true);
      setTimeout(() => setShowMastery(false), 4000);
    }
    prevMastered.current = isMastered;
  }, [progress.total, progress.completed]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground animate-pulse">Loading ladder...</div>
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
        <button
          onClick={() => setShowAI(true)}
          className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all"
        >
          🧠 AI Suggest
        </button>
      </div>

      <div className="flex gap-6 items-start flex-col lg:flex-row">
        {/* Main ladder */}
        <div className="flex-1 min-w-0">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gradient-purple mb-2">🢁 Mastery Ladder</h2>
            <p className="text-muted-foreground">Climb your way to greatness, one step at a time</p>
          </motion.div>

          {/* Ladder */}
          <div className="relative flex flex-col gap-10 py-8">
            {/* Center line */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 rounded-full z-[1]"
              style={{ background: "linear-gradient(180deg, rgba(139,92,246,0.3) 0%, rgba(217,70,239,0.3) 25%, rgba(50,184,198,0.3) 50%, rgba(34,197,94,0.3) 75%, rgba(147,51,234,0.3) 100%)" }} />

            {[0, 1, 2, 3, 4, 5].map(level => (
              <LadderStep
                key={`${activeCategory}-${level}`}
                level={level}
                tasks={currentLadder[level] || []}
                isComplete={isLevelComplete(level)}
                isOdd={level % 2 === 0}
                onAddTask={() => addTask(level)}
                onUpdateTask={(taskId, updates) => updateTask(level, taskId, updates)}
                onDeleteTask={(taskId) => deleteTask(level, taskId)}
              />
            ))}
          </div>

          <div className="text-center mt-10 pt-6 border-t border-white/10 text-xs text-muted-foreground">
            💾 Your progress is automatically saved
          </div>
        </div>

        {/* Progress Jar sidebar */}
        <div className="w-full lg:w-[280px] flex-shrink-0">
          <ProgressJar total={progress.total} completed={progress.completed} percentage={progress.percentage} />
        </div>
      </div>

      {/* AI Modal */}
      <AnimatePresence>
        {showAI && (
          <AILadderModal
            categoryId={activeCategory}
            currentLadder={currentLadder}
            onApply={setLevelTasks}
            onClose={() => setShowAI(false)}
          />
        )}
      </AnimatePresence>

      {/* Mastery overlay */}
      <MasteryOverlay key={masteryKey} show={showMastery} />
    </div>
  );
}
