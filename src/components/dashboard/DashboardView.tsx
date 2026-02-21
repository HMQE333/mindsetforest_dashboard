import { useState, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardState } from "@/hooks/useDashboardState";
import DashboardHero from "./DashboardHero";
import CategoryGrid from "./CategoryGrid";
import MissionView from "./MissionView";
import EditMissionsModal from "./EditMissionsModal";
import AISuggestionsModal from "./AISuggestionsModal";
import LevelUpModal from "./LevelUpModal";

export default function DashboardView() {
  const { state, loading, completeMission, resetDay, saveCustomMissions, getMissions, getCompletedCount } = useDashboardState();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [aiCategory, setAICategory] = useState<string | null>(null);
  const [levelUpTrigger, setLevelUpTrigger] = useState<{ level: number; key: number } | null>(null);
  const [floatingXP, setFloatingXP] = useState<{ id: number; xp: number } | null>(null);
  const prevLevel = useRef(state.currentLevel);

  const handleComplete = useCallback((categoryId: string, index: number, xp: number) => {
    const prevLvl = state.currentLevel;
    completeMission(categoryId, index, xp);

    // Floating XP
    setFloatingXP({ id: Date.now(), xp });
    setTimeout(() => setFloatingXP(null), 1500);

    // Level up check (deferred)
    setTimeout(() => {
      const newXP = state.currentXP + xp;
      const newLevel = Math.floor(newXP / 100) + 1;
      if (newLevel > prevLvl) {
        setLevelUpTrigger({ level: newLevel, key: Date.now() });
      }
    }, 100);
  }, [completeMission, state.currentLevel, state.currentXP]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="relative">
      <DashboardHero state={state} onResetDay={resetDay} />

      <AnimatePresence mode="wait">
        {selectedCategory ? (
          <MissionView
            key={selectedCategory}
            categoryId={selectedCategory}
            state={state}
            getMissions={getMissions}
            onComplete={handleComplete}
            onBack={() => setSelectedCategory(null)}
            onEdit={() => setEditingCategory(selectedCategory)}
            onAI={() => setAICategory(selectedCategory)}
          />
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <CategoryGrid
              getMissions={getMissions}
              getCompletedCount={getCompletedCount}
              onSelectCategory={setSelectedCategory}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingCategory && (
          <EditMissionsModal
            categoryId={editingCategory}
            missions={getMissions(editingCategory)}
            onSave={saveCustomMissions}
            onClose={() => setEditingCategory(null)}
          />
        )}
      </AnimatePresence>

      {/* AI Modal */}
      <AnimatePresence>
        {aiCategory && (
          <AISuggestionsModal
            categoryId={aiCategory}
            currentMissions={getMissions(aiCategory)}
            onApply={saveCustomMissions}
            onClose={() => setAICategory(null)}
          />
        )}
      </AnimatePresence>

      {/* Level Up */}
      {levelUpTrigger && (
        <LevelUpModal
          level={levelUpTrigger.level}
          show={true}
          key={levelUpTrigger.key}
        />
      )}

      {/* Floating XP */}
      <AnimatePresence>
        {floatingXP && (
          <motion.div
            key={floatingXP.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -100, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="fixed pointer-events-none z-[100] text-3xl font-bold text-stat-value"
            style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
          >
            +{floatingXP.xp} XP ⭐
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
