import { useState, useRef, useCallback, useMemo, useEffect, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDashboardState } from "@/hooks/useDashboardState";
import { usePaths } from "@/hooks/usePaths";
import { useUserProjects } from "@/hooks/useUserProjects";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useDailyCompletions } from "@/hooks/useDailyCompletions";
import { useUserSettings } from "@/hooks/useUserSettings";
import type { TodayStep } from "@/lib/path-data";
import { completedMissionDetails, taggedMissions, withVariant } from "@/lib/mission-keys";
import { todayKey } from "@/lib/today";
import PathsTodayStrip from "./PathsTodayStrip";
import { useReview } from "@/hooks/useReview";
import { lazyModule, whenIdle, useOpenedOnce } from "@/lib/lazy-module";
import MissionPresets from "./MissionPresets";
import DashboardHero from "./DashboardHero";
import CategoryGrid from "./CategoryGrid";
import MissionView from "./MissionView";
import ProjectsListView from "./ProjectsListView";
import EditMissionsModal from "./EditMissionsModal";
import LevelUpModal from "./LevelUpModal";
import CategoryCompleteEffect from "./CategoryCompleteEffect";
import ShortcutsPanel from "./ShortcutsPanel";
import DashboardStats from "./DashboardStats";
import OfflineNotice from "@/components/OfflineNotice";
import { playFanfareSound, playMissionSound } from "@/lib/ui-sounds";
import { LayoutGrid, LayoutList, Square, Timer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import MissionPrompt, { type PromptModel } from "./MissionPrompt";
import { MISSION_TIMER_STOP_EVENT, clock, requestTimerStop, useNow } from "./MissionTimerButton";
import { cancelTimer, stopTimer, suggestedMinutes, useMissionTimer } from "@/lib/mission-timer";
import { formatMinutes, minutesToMetricValue, parseAmount, plannedMinutesOf, timeUnitOf } from "@/lib/mission-amount";
import { saveMissionAmount } from "@/lib/mission-log";
import type { Mission } from "@/lib/dashboard-data";

const HOME_VIEWS = [
  { id: "grid" as const, icon: LayoutGrid, label: "Grid" },
  { id: "list" as const, icon: LayoutList, label: "List" },
];

// The review popup (with the screen-time palette it draws from) is its own
// chunk: Home fetches it on idle when a review is due, and it mounts on first open.
const ReviewModal = lazyModule(() => import("@/components/review/ReviewModal"));

export default function DashboardView() {
  const { state, loading, loadFailed, retryLoad, completeMission, completeExternal, undoExternal, resetDay, saveCustomMissions, applyMissionPreset, addMission, splitMission, rerollMission, getMissions, getCompletedCount, patchMission } = useDashboardState();
  const { user } = useAuth();
  // Quiet cards wait in line: a new one never replaces one the user has not answered
  // (a stopped timer's card holds a measured time). The first is shown.
  type Prompt = { id: number; model: PromptModel; save: (value: number, complete: boolean) => void };
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const promptId = useRef(0);
  const pushPrompt = useCallback((make: (id: number) => Omit<Prompt, "id">) => {
    const id = ++promptId.current;
    const p = { ...make(id), id };
    setPrompts((q) => [...q, p]);
  }, []);
  const closePrompt = useCallback((id: number) => setPrompts((q) => q.filter((p) => p.id !== id)), []);
  const prompt = prompts[0] ?? null;
  const dismissPrompt = useCallback(() => { if (prompt) closePrompt(prompt.id); }, [prompt, closePrompt]);
  const runningTimer = useMissionTimer();
  const timerNow = useNow(!!runningTimer);
  const { todaySteps, todayLog, logStep, undoToday } = usePaths();
  // Cards or a compact list, remembered on this device.
  const [homeView, setHomeViewState] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("mf.homeView") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });
  const setHomeView = (v: "grid" | "list") => {
    setHomeViewState(v);
    try { localStorage.setItem("mf.homeView", v); } catch { /* private mode */ }
  };
  const { projects, getProjectFromKey } = useUserProjects();
  const { history: weeklyHistory, saveDailySnapshot, fetchAllHistory } = useDailyCompletions();
  const { getCategories, preferences } = useUserSettings();
  const categories = getCategories();
  const showProjects = !preferences.enabledModules.length || preferences.enabledModules.includes("projects");

  const review = useReview();
  const reviewMounted = useOpenedOnce(review.open);
  const reviewDue = review.due.length > 0;
  useEffect(() => {
    if (!reviewDue) return;
    return whenIdle(() => {
      void ReviewModal.preload();
      void import("@/lib/review-load");
    }, 3000);
  }, [reviewDue]);
  // Hiding Paths in Settings -> Modules hides its steps on Home too.
  const showPaths = !preferences.enabledModules.length || preferences.enabledModules.includes("paths");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
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

  // Settings -> Modules -> sound on completion (on unless turned off).
  const soundOn = preferences.completionSound !== false;

  /** The mission as shown now (its rolled variant applied), by its position. */
  const shownMission = useCallback((categoryId: string, index: number): Mission | null => {
    const m = getMissions(categoryId).find((x, i) => (x.__originalIndex ?? i) === index);
    return m ? withVariant(m, state.rolledVariants[`${categoryId}-${index}`]) : null;
  }, [getMissions, state.rolledVariants]);

  /** Saves a confirmed amount where the mission is linked; a quiet toast says where it went. */
  const saveLinked = useCallback(async (m: Mission, value: number) => {
    if (!user || !m.link) return;
    const r = await saveMissionAmount(user.id, m.link, value);
    if (r.ok) toast(r.text, { duration: 2500 });
    else toast.error(r.error);
  }, [user]);

  /** After a tick on a linked mission: offer the amount from its words (never saved unasked). */
  const offerAmount = useCallback((categoryId: string, index: number) => {
    const m = shownMission(categoryId, index);
    if (!m?.link) return;
    const timeUnit = m.link.kind === "metric" ? timeUnitOf(m.link.unit) : null;
    const planned = plannedMinutesOf(m);
    const value = timeUnit ? (planned ? minutesToMetricValue(planned, m.link.kind === "metric" ? m.link.unit : "") : 0) : parseAmount(m.title) ?? 0;
    const link = m.link;
    const unit = link.kind === "book" ? "pages" : link.unit || "";
    pushPrompt((id) => ({
      model: { kind: "amount", title: m.title, target: link.label ?? (link.kind === "book" ? "book" : "Stats"), unit, value, step: timeUnit === "hours" ? 0.25 : undefined },
      save: (v) => { closePrompt(id); void saveLinked(m, v); },
    }));
  }, [shownMission, saveLinked, pushPrompt, closePrompt]);

  const handleComplete = useCallback((categoryId: string, index: number, xp: number, opts?: { quiet?: boolean }) => {
    const prevLvl = state.currentLevel;
    completeMission(categoryId, index, xp);
    if (!opts?.quiet) offerAmount(categoryId, index);
    if (soundOn) playMissionSound();

    // Floating XP
    setFloatingXP({ id: Date.now(), xp });
    setTimeout(() => setFloatingXP(null), 1500);

    // Level up check (deferred)
    setTimeout(() => {
      const newXP = state.currentXP + xp;
      const newLevel = Math.floor(newXP / 100) + 1;
      if (newLevel > prevLvl) {
        setLevelUpTrigger({ level: newLevel, key: Date.now() });
        if (soundOn) playFanfareSound(0.3);
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
        // One fanfare even when the same tick also levels up.
        const levelledUp = Math.floor((state.currentXP + xp) / 100) + 1 > prevLvl;
        if (soundOn && !levelledUp) playFanfareSound(0.25);
      }
    }, 150);
  }, [completeMission, state.currentLevel, state.currentXP, state.completedMissions, getMissions, categories, soundOn, offerAmount]);

  // Read at Save time, not when the card opened (the mission may have been ticked meanwhile).
  const completedRef = useRef(state.completedMissions);
  completedRef.current = state.completedMissions;
  const handleCompleteRef = useRef(handleComplete);
  handleCompleteRef.current = handleComplete;

  // Timer stopped (its card, the bar, or starting another): the quiet "how long?" card.
  useEffect(() => {
    const onStop = () => {
      const r = stopTimer();
      if (!r) return;
      const { categoryId, index, title } = r.timer;
      // The list may have changed while it ran (edited, reordered, a new day): only the same
      // mission gets the time, the link and the tick. Otherwise the card keeps just its title.
      const found = shownMission(categoryId, index);
      const m = found && found.title === title ? found : null;
      const planned = m ? plannedMinutesOf(m) : null;
      const s = suggestedMinutes(r.elapsedMin, r.hiddenMin, planned);
      const timeTarget = m?.link?.kind === "metric" && timeUnitOf(m.link.unit) ? m.link : null;
      const done = state.completedMissions.has(`${categoryId}-${index}`);
      const hint =
        s.reason === "hidden" ? `The app was in the background for ~${formatMinutes(r.hiddenMin)}, so this starts lower. Your call.`
        : s.reason === "plan" ? `The timer ran far past the plan, so this starts at the plan. Your call.`
        : null;
      pushPrompt((id) => ({
        model: { kind: "time", title: m?.title ?? title, target: timeTarget?.label ?? null, elapsed: Math.round(r.elapsedMin), planned, value: s.value, hint, canComplete: !!m && !done },
        save: (minutes, complete) => {
          closePrompt(id);
          if (m) patchMission(categoryId, index, (x) => (x.title === m.title || (x.variants?.some((v) => v.title === m.title) ?? false)
            ? { ...x, timeLog: [...(x.timeLog ?? []), { d: todayKey(), planned: planned ?? undefined, actual: minutes }].slice(-30) }
            : x));
          if (m && timeTarget) void saveLinked(m, minutesToMetricValue(minutes, timeTarget.unit));
          else toast(`${formatMinutes(minutes)} · ${m?.title ?? title}`, { duration: 2000 });
          // A time metric already got the minutes: the tick does not ask again.
          if (m && complete && !completedRef.current.has(`${categoryId}-${index}`)) handleCompleteRef.current(categoryId, index, m.xp, { quiet: !!timeTarget });
        },
      }));
    };
    window.addEventListener(MISSION_TIMER_STOP_EVENT, onStop);
    return () => window.removeEventListener(MISSION_TIMER_STOP_EVENT, onStop);
  }, [shownMission, state.completedMissions, patchMission, saveLinked, pushPrompt, closePrompt]);

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

  const handleLogPathStep = useCallback(async ({ path, step }: TodayStep) => {
    const xp = await logStep(step.id);
    if (xp > 0) {
      if (soundOn) playMissionSound();
      completeExternal(path.category_id, xp);
      setFloatingXP({ id: Date.now(), xp });
      setTimeout(() => setFloatingXP(null), 1500);
    }
  }, [logStep, completeExternal, soundOn]);

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

      {runningTimer && (
        <div className="mb-3 flex items-center justify-center">
          <div className="flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-foreground/70">
            <Timer className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="max-w-[14rem] truncate">{runningTimer.title}</span>
            <span className="tabular-nums font-semibold text-foreground">{clock(timerNow - runningTimer.startedAt)}</span>
            <button type="button" onClick={requestTimerStop} className="rounded-full p-0.5 hover:text-foreground" title="Stop" aria-label="Stop the timer">
              <Square className="h-3 w-3 fill-current" />
            </button>
            <button type="button" onClick={cancelTimer} className="text-[10px] text-foreground/40 hover:text-foreground" title="Discard this timer">discard</button>
          </div>
        </div>
      )}

      {prompt && <MissionPrompt key={prompt.id} model={prompt.model} onSave={prompt.save} onDismiss={dismissPrompt} />}

      {/* Weekly Progress - moved to bottom */}

      {/* Morning / monthly review */}
      {reviewMounted && (
        <Suspense fallback={null}>
          <ReviewModal review={review} />
        </Suspense>
      )}

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
            onReroll={rerollMission}
            onBack={() => setSelectedCategory(selectedCategory.startsWith("project-") ? "__projects__" : null)}
            onEdit={() => setEditingCategory(selectedCategory)}
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
            <div className="flex justify-end gap-1 mb-2 px-1" role="group" aria-label="Home view">
              {HOME_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setHomeView(v.id)}
                  title={v.label}
                  aria-pressed={homeView === v.id}
                  className={`p-1.5 rounded-md transition-all ${homeView === v.id ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}
                >
                  <v.icon size={14} />
                </button>
              ))}
            </div>
            <CategoryGrid
              view={homeView}
              isDone={(cat, i) => state.completedMissions.has(`${cat}-${i}`)}
              shownMission={(cat, m) => withVariant(m, state.rolledVariants[`${cat}-${m.__originalIndex}`])}
              onComplete={handleComplete}
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
