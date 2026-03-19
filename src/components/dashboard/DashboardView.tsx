import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useLadderState } from "@/hooks/useLadderState";
import { useUserProjects } from "@/hooks/useUserProjects";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useDailyCompletions } from "@/hooks/useDailyCompletions";
import { useUserSettings } from "@/hooks/useUserSettings";
import { LADDER_LEVELS, LadderTask } from "@/lib/ladder-data";
import DashboardHero from "./DashboardHero";
import CategoryGrid from "./CategoryGrid";
import MissionView from "./MissionView";
import ProjectsListView from "./ProjectsListView";
import EditMissionsModal from "./EditMissionsModal";
import AISuggestionsModal from "./AISuggestionsModal";
import LevelUpModal from "./LevelUpModal";
import CategoryCompleteEffect from "./CategoryCompleteEffect";
import ShortcutsPanel from "./ShortcutsPanel";
import WeeklyProgress from "./WeeklyProgress";
import MonthlyFocusBanner from "./MonthlyFocusBanner";

export default function DashboardView() {
  const { state, loading, completeMission, resetDay, saveCustomMissions, splitMission, resetCategory, getMissions, getCompletedCount } = useDashboardState();
  const { ladders, activeCategory: ladderCategory } = useLadderState();
  const { projects, getProjectFromKey } = useUserProjects();
  const { history: weeklyHistory, saveDailySnapshot, fetchAllHistory } = useDailyCompletions();
  const { getCategories, preferences } = useUserSettings();
  const categories = getCategories();
  const showProjects = !preferences.enabledModules.length || preferences.enabledModules.includes("projects");
  const showMonthlyFocus = !preferences.enabledModules.length || preferences.enabledModules.includes("monthly-focus");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [aiCategory, setAICategory] = useState<string | null>(null);
  const [levelUpTrigger, setLevelUpTrigger] = useState<{ level: number; key: number } | null>(null);
  const [floatingXP, setFloatingXP] = useState<{ id: number; xp: number } | null>(null);
  const [categoryComplete, setCategoryComplete] = useState<{ categoryId: string; color: string; key: number } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const prevLevel = useRef(state.currentLevel);

  // Save daily snapshot whenever missions are completed
  useEffect(() => {
    if (state.missionsCompleted > 0) {
      // Collect completed mission titles and compute today's XP
      const titles: string[] = [];
      let todayXP = 0;
      for (const missionId of state.completedMissions) {
        const [catId, idxStr] = [missionId.substring(0, missionId.lastIndexOf("-")), missionId.substring(missionId.lastIndexOf("-") + 1)];
        const missions = getMissions(catId);
        const idx = parseInt(idxStr);
        if (missions[idx]) {
          titles.push(missions[idx].title);
          todayXP += missions[idx].xp;
        }
      }
      saveDailySnapshot(
        state.missionsCompleted,
        todayXP,
        Array.from(state.categoriesEngaged),
        titles,
      );
    }
  }, [state.missionsCompleted, state.completedMissions]);

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

  // Keyboard shortcuts
  const shortcutContext = selectedCategory === null ? "grid" as const
    : selectedCategory === "__projects__" ? "projects" as const
    : "mission" as const;

  const missions = selectedCategory && selectedCategory !== "__projects__" ? getMissions(selectedCategory) : [];

  useKeyboardShortcuts({
    context: shortcutContext,
    selectCategory: setSelectedCategory,
    completeMission: shortcutContext === "mission" && selectedCategory ? (index: number) => {
      const m = missions[index];
      if (m && !state.completedMissions.has(`${selectedCategory}-${index}`)) {
        handleComplete(selectedCategory, index, m.xp);
      }
    } : undefined,
    editTasks: selectedCategory && selectedCategory !== "__projects__" ? () => setEditingCategory(selectedCategory) : undefined,
    aiSuggestions: selectedCategory && selectedCategory !== "__projects__" ? () => setAICategory(selectedCategory) : undefined,
    resetDefaults: selectedCategory && selectedCategory !== "__projects__" ? () => resetCategory(selectedCategory) : undefined,
    resetDay: resetDay,
    goBack: selectedCategory ? () => setSelectedCategory(selectedCategory === "__projects__" ? null : selectedCategory.startsWith("project-") ? "__projects__" : null) : undefined,
    selectProject: shortcutContext === "projects" ? (index: number) => {
      if (index < projects.length) {
        setSelectedCategory(`project-${projects[index].id}`);
      }
    } : undefined,
    toggleShortcutsPanel: () => setShowShortcuts(prev => !prev),
    missionCount: missions.length,
    projectCount: projects.length,
    customKeybinds: preferences.customKeybinds,
  });

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
      <DashboardHero
        state={state}
        onResetDay={resetDay}
        onShowShortcuts={() => setShowShortcuts(true)}
        heroLayout={preferences.heroLayout}
        extraActions={showMonthlyFocus ? <MonthlyFocusBanner pulseStyle={preferences.focusPulseStyle || "glow"} /> : undefined}
      />

      {/* Weekly Progress - moved to bottom */}

      {/* Shortcuts Panel */}
      <AnimatePresence>
        {showShortcuts && (
          <ShortcutsPanel context={shortcutContext} onClose={() => setShowShortcuts(false)} customKeybinds={preferences.customKeybinds} />
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {selectedCategory === "__projects__" ? (
          <ProjectsListView
            key="projects-list"
            projects={projects}
            getMissions={getMissions}
            getCompletedCount={getCompletedCount}
            onSelectProject={setSelectedCategory}
            onBack={() => setSelectedCategory(null)}
          />
        ) : selectedCategory ? (
          <MissionView
            key={selectedCategory}
            categoryId={selectedCategory}
            state={state}
            getMissions={getMissions}
            onComplete={handleComplete}
            onSplit={splitMission}
            onResetCategory={resetCategory}
            onBack={() => setSelectedCategory(selectedCategory.startsWith("project-") ? "__projects__" : null)}
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
              projectCount={showProjects ? projects.length : 0}
              categories={categories}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weekly Progress */}
      <WeeklyProgress
        history={weeklyHistory}
        dashboardState={{
          currentXP: state.currentXP,
          currentLevel: state.currentLevel,
          streakDays: state.streakDays,
          missionsCompleted: state.missionsCompleted,
        }}
        onExportAll={fetchAllHistory}
      />

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
