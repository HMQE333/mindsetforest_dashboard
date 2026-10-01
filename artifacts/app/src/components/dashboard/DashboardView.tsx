import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePaths } from "@/hooks/usePaths";
import { useUserProjects } from "@/hooks/useUserProjects";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useDailyCompletions } from "@/hooks/useDailyCompletions";
import { useUserSettings } from "@/hooks/useUserSettings";
import { pathProgress, TodayStep } from "@/lib/path-data";
import { completedMissionDetails, taggedMissions, withVariant } from "@/lib/mission-keys";
import { todayKey } from "@/lib/today";
import PathsTodayStrip from "./PathsTodayStrip";
import ReviewModal from "@/components/review/ReviewModal";
import { useReview } from "@/hooks/useReview";
import MissionPresets from "./MissionPresets";
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
import OfflineNotice from "@/components/OfflineNotice";

export default function DashboardView() {
  const { state, loading, loadFailed, retryLoad, completeMission, completeExternal, undoExternal, resetDay, saveCustomMissions, applyMissionPreset, addMission, splitMission, resetCategory, rerollMission, getMissions, getCompletedCount } = useDashboardState();
  const { todaySteps, todayLog, stepsByPath, logStep, undoToday } = usePaths();
  const { projects, getProjectFromKey } = useUserProjects();
  const { history: weeklyHistory, saveDailySnapshot, fetchAllHistory } = useDailyCompletions();
  const { getCategories, preferences } = useUserSettings();
  const categories = getCategories();
  const showProjects = !preferences.enabledModules.length || preferences.enabledModules.includes("projects");

  const review = useReview();
  // Hiding Paths in Settings -> Modules hides its steps on Home too.
  const showPaths = !preferences.enabledModules.length || preferences.enabledModules.includes("paths");
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
  // Titles and XP are read back from the ticks: the full list at the tick's
  // index (keys index every weekday, not today's filtered view) with the rolled
  // variant, as the card shows it. Recording {title, xp} at completion time
  // would also survive a preset load or Reset Day clearing the ticks mid-day,
  // but dashboard_state has nowhere to keep it across reloads without a
  // migration, so that part is left to an owner decision.
  useEffect(() => {
    // Only while the state is today's: before the 04:00 rollover reaches it
    // these are yesterday's counts, which must not be filed under today.
    if (loading || !state.dayKey || state.dayKey !== todayKey()) return;
    if (state.missionsCompleted > 0) {
      const done = completedMissionDetails(state.completedMissions, state.customMissions, state.rolledVariants);
      const titles = [...todayLog.map(l => l.title), ...done.map(d => d.title)];
      const todayXP = todayLog.reduce((sum, l) => sum + l.xp, 0) + done.reduce((sum, d) => sum + d.xp, 0);
      saveDailySnapshot(
        state.missionsCompleted,
        todayXP,
        Array.from(state.categoriesEngaged),
        titles,
        state.dayKey,
      );
    }
  }, [loading, state.dayKey, state.missionsCompleted, state.completedMissions, todayLog]);

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

  // The edit and AI modals save the whole category list back, so they get the
  // full list (every weekday, tagged with each mission's index), not today's
  // filtered view. Memoised so the edit modal's buffer isn't reset on every render.
  const editingMissions = useMemo(
    () => (editingCategory ? taggedMissions(state.customMissions, editingCategory) : []),
    [editingCategory, state.customMissions],
  );
  const aiMissions = useMemo(
    () => (aiCategory ? taggedMissions(state.customMissions, aiCategory) : []),
    [aiCategory, state.customMissions],
  );

  useKeyboardShortcuts({
    context: shortcutContext,
    selectCategory: setSelectedCategory,
    completeMission: shortcutContext === "mission" && selectedCategory ? (index: number) => {
      // `index` is the position on screen; ticks are keyed by the full list's
      // index, and the XP is the rolled variant's, as on the card.
      const m = missions[index];
      if (!m) return;
      const original = m.__originalIndex ?? index;
      const key = `${selectedCategory}-${original}`;
      if (!state.completedMissions.has(key)) {
        handleComplete(selectedCategory, original, withVariant(m, state.rolledVariants[key]).xp);
      }
    } : undefined,
    editTasks: selectedCategory && selectedCategory !== "__projects__" ? () => setEditingCategory(selectedCategory) : undefined,
    aiSuggestions: selectedCategory && selectedCategory !== "__projects__" ? () => setAICategory(selectedCategory) : undefined,
    // Like the "Reset defaults" button: only when there is a custom list to drop.
    resetDefaults: selectedCategory && selectedCategory !== "__projects__" && state.customMissions[selectedCategory]?.length
      ? () => resetCategory(selectedCategory)
      : undefined,
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
    if (!showPaths || todaySteps.length === 0) return null;
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
  }, [showPaths, todaySteps, stepsByPath]);

  const handleLogPathStep = useCallback(async ({ path, step }: TodayStep) => {
    const xp = await logStep(step.id);
    if (xp > 0) {
      completeExternal(path.category_id, xp);
      setFloatingXP({ id: Date.now(), xp });
      setTimeout(() => setFloatingXP(null), 1500);
    }
  }, [logStep, completeExternal]);

  const handleUndoPathStep = useCallback(async (stepId: string) => {
    const xp = await undoToday(stepId);
    if (xp > 0) {
      const categoryId = todaySteps.find(s => s.step.id === stepId)?.path.category_id ?? null;
      undoExternal(categoryId, xp);
    }
  }, [undoToday, undoExternal, todaySteps]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  // Never show default missions in place of the real ones that could not load.
  if (loadFailed) return <OfflineNotice onRetry={retryLoad} what="your missions" />;

  return (
    <div className="relative">
      <DashboardHero
        state={state}
        heroLayout={preferences.heroLayout}
      />

      {/* Weekly Progress - moved to bottom */}

      {/* Morning / monthly review */}
      <ReviewModal review={review} />

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
            {showPaths && (
              <PathsTodayStrip
                steps={todaySteps}
                categories={categories}
                onLog={handleLogPathStep}
                onUndo={handleUndoPathStep}
                onOpenPaths={() => window.dispatchEvent(new CustomEvent("lov:navigate-module", { detail: { module: "paths" } }))}
              />
            )}
            <CategoryGrid
              getMissions={getMissions}
              getCompletedCount={getCompletedCount}
              onSelectCategory={setSelectedCategory}
              projectCount={showProjects ? projects.length : 0}
              categories={categories}
              showCompletionBadge={preferences.showCompletionBadge !== false}
            />
            <div className="flex justify-end mt-2 px-1">
              <MissionPresets variant="link" customMissions={state.customMissions} onApply={applyMissionPreset} />
            </div>
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
            missions={editingMissions}
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
            currentMissions={aiMissions}
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
