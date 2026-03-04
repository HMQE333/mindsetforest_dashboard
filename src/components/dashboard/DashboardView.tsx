import { useState, useRef, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLadderState } from "@/hooks/useLadderState";
import { useUserProjects } from "@/hooks/useUserProjects";
import { LADDER_LEVELS, LadderTask } from "@/lib/ladder-data";
import DashboardHero from "./DashboardHero";
import CategoryGrid from "./CategoryGrid";
import MissionView from "./MissionView";
import EditMissionsModal from "./EditMissionsModal";
import AISuggestionsModal from "./AISuggestionsModal";
import LevelUpModal from "./LevelUpModal";

export default function DashboardView() {
  const { state, loading, completeMission, resetDay, saveCustomMissions, splitMission, resetCategory, getMissions, getCompletedCount } = useDashboardState();
  const { ladders, activeCategory: ladderCategory } = useLadderState();
  const { projects, getProjectFromKey } = useUserProjects();
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

  // Build ladder context for AI modal
  const ladderContext = useMemo(() => {
    const ladder = ladders[ladderCategory];
    if (!ladder?.levels) return null;
    let total = 0, completed = 0;
    const completedTasks: string[] = [];
    let currentLevel = LADDER_LEVELS[0].title;
    for (let i = 0; i < 6; i++) {
      const tasks: LadderTask[] = ladder.levels[i] || [];
      tasks.forEach(t => {
        total++;
        if (t.completed) { completed++; completedTasks.push(t.text); }
      });
      const allDone = tasks.length > 0 && tasks.every(t => t.completed);
      if (!allDone) { currentLevel = LADDER_LEVELS[i].title; }
    }
    if (total === 0) return null;
    return { activeCategory: ladderCategory, currentLevel, completedTasks: completedTasks.filter(Boolean), totalCompleted: completed, totalTasks: total };
  }, [ladders, ladderCategory]);

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
            onSplit={splitMission}
            onResetCategory={resetCategory}
            onBack={() => setSelectedCategory(null)}
            onEdit={() => setEditingCategory(selectedCategory)}
            onAI={() => setAICategory(selectedCategory)}
            projectInfo={selectedCategory.startsWith("project-") ? (() => {
              const p = getProjectFromKey(selectedCategory);
              return p ? { name: p.name, emoji: p.emoji } : null;
            })() : null}
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
              projects={projects}
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
            ladderContext={ladderContext}
            projectName={aiCategory.startsWith("project-") ? getProjectFromKey(aiCategory)?.name : undefined}
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
