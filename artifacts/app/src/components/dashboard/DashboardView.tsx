import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePaths } from "@/hooks/usePaths";
import { useUserProjects } from "@/hooks/useUserProjects";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useDailyCompletions } from "@/hooks/useDailyCompletions";
import { useUserSettings } from "@/hooks/useUserSettings";
import { pathProgress, TodayStep } from "@/lib/path-data";
import PathsTodayStrip from "./PathsTodayStrip";
import DashboardHero from "./DashboardHero";
import CategoryGrid from "./CategoryGrid";
import MissionView from "./MissionView";
import ProjectsListView from "./ProjectsListView";
import EditMissionsModal from "./EditMissionsModal";
import AISuggestionsModal from "./AISuggestionsModal";
import LevelUpModal from "./LevelUpModal";
import CategoryCompleteEffect from "./CategoryCompleteEffect";
import ShortcutsPanel from "./ShortcutsPanel";
import DashboardStats from "./DashboardStats";
import MonthlyFocusBanner from "./MonthlyFocusBanner";

export default function DashboardView() {
  const { state, loading, completeMission, completeExternal, resetDay, saveCustomMissions, addMission, splitMission, resetCategory, rerollMission, getMissions, getCompletedCount } = useDashboardState();
  const { todaySteps, todayLog, stepsByPath, logStep, undoToday } = usePaths();
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

  // Save daily snapshot whenever missions are completed. Path steps logged
  // today are folded in so the snapshot matches the XP actually awarded.
  useEffect(() => {
    if (state.missionsCompleted > 0) {
      // Collect completed mission titles and compute today's XP
      const titles: string[] = todayLog.map(l => l.title);
      let todayXP = todayLog.reduce((sum, l) => sum + l.xp, 0);
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
  }, [state.missionsCompleted, state.completedMissions, todayLog]);

  // Listen for friend-suggestion accepts → add as a persistent mission to chosen category
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.categoryId || !detail?.mission) return;
      addMission(detail.categoryId, detail.mission);
    };
    window.addEventListener("lov:add-friend-mission", handler as EventListener);
    return () => window.removeEventListener("lov:add-friend-mission", handler as EventListener);
  }, [addMission]);

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

    // Category complete check (deferred)
    setTimeout(() => {
      const missions = getMissions(categoryId);
      const completedCount = state.completedMissions.size; // before this tick resolves
      // count how many from this category are already done (excluding current)
      const alreadyDone = Array.from(state.completedMissions).filter(id =>
        id.startsWith(categoryId + "-")
      ).length;
      if (alreadyDone + 1 === missions.length && missions.length > 0) {
        const cat = categories.find(c => c.id === categoryId);
        setCategoryComplete({ categoryId, color: cat?.color || "hsl(var(--primary))", key: Date.now() });
      }
    }, 150);
  }, [completeMission, state.currentLevel, state.currentXP, state.completedMissions, getMissions, categories]);

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

  // What the AI mission planner is told about the user's paths.
  const pathContext = useMemo(() => {
    if (todaySteps.length === 0) return null;
    return {
      paths: todaySteps.map(({ path, step }) => {
        const progress = pathProgress(stepsByPath(path.id));
        return {
          name: path.name,
          categoryId: path.category_id,
          activeStep: step.title,
          progress: `${progress.done}/${progress.total}`,
        };
      }),
    };
  }, [todaySteps, stepsByPath]);

  const handleLogPathStep = useCallback(async ({ path, step }: TodayStep) => {
    const xp = await logStep(step.id);
    if (xp > 0) {
      completeExternal(path.category_id, xp);
      setFloatingXP({ id: Date.now(), xp });
      setTimeout(() => setFloatingXP(null), 1500);
    }
  }, [logStep, completeExternal]);

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
            onReroll={rerollMission}
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
            <PathsTodayStrip
              steps={todaySteps}
              categories={categories}
              onLog={handleLogPathStep}
              onUndo={undoToday}
              onOpenPaths={() => window.dispatchEvent(new CustomEvent("lov:navigate-module", { detail: { module: "paths" } }))}
            />
            <CategoryGrid
              getMissions={getMissions}
              getCompletedCount={getCompletedCount}
              onSelectCategory={setSelectedCategory}
              projectCount={showProjects ? projects.length : 0}
              categories={categories}
              showCompletionBadge={preferences.showCompletionBadge !== false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress. Precise stats across week / month / year / all-time */}
      <DashboardStats
        history={weeklyHistory}
        fetchAllHistory={fetchAllHistory}
        categories={categories}
        dashboardState={{
          currentXP: state.currentXP,
          currentLevel: state.currentLevel,
          streakDays: state.streakDays,
          missionsCompleted: state.missionsCompleted,
        }}
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
            pathContext={pathContext}
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

      {/* Category Complete Effect */}
      {categoryComplete && (
        <CategoryCompleteEffect
          key={categoryComplete.key}
          style={preferences.completionEffect || "burst"}
          color={categoryComplete.color}
          onDone={() => setCategoryComplete(null)}
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
