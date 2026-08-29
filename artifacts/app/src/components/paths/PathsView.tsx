import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePaths } from "@/hooks/usePaths";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useDashboardState } from "@/hooks/useDashboardState";
import { stepStreak, stepIdleDays, todayKey } from "@/lib/path-data";
import { toast } from "sonner";
import PathCard from "./PathCard";
import AIPathModal from "./AIPathModal";

export default function PathsView() {
  const {
    paths, logs, loading, missingTables, engineReady, stepsByPath, revisionsOf,
    createPath, updatePath, deletePath,
    addStep, updateStep, deleteStep, moveStep, logStep, undoToday,
    recordRevision, revertTo, setDiagnosis, scoreDiagnosis, snoozeStep,
  } = usePaths();
  const { getCategories } = useUserSettings();
  const { completeExternal } = useDashboardState();
  const categories = getCategories();

  const [newName, setNewName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [aiPathId, setAIPathId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // A Planning mention opens Paths and asks for one path to be shown expanded.
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.pathId;
      if (id) setFocusedId(id);
    };
    window.addEventListener("lov:focus-path", handler as EventListener);
    return () => window.removeEventListener("lov:focus-path", handler as EventListener);
  }, []);

  const loggedTodayIds = useMemo(() => {
    const today = todayKey();
    return new Set(logs.filter(l => l.date === today).map(l => l.step_id));
  }, [logs]);

  const visible = paths.filter(p => (showArchived ? p.archived : !p.archived));
  const archivedCount = paths.filter(p => p.archived).length;
  const aiPath = paths.find(p => p.id === aiPathId) || null;

  const handleLog = async (pathId: string, pathCategoryId: string | null, stepId: string) => {
    const before = stepsByPath(pathId);
    const xp = await logStep(stepId);
    if (xp === 0) return;
    completeExternal(pathCategoryId, xp);

    // Reward the milestone, not just the finish line: a step closing out and a
    // path closing out are both worth a beat of feedback.
    const step = before.find(s => s.id === stepId);
    const target = step && step.mode === "reps" ? Math.max(1, step.reps_target) : 1;
    const stepDone = step ? step.reps_done + 1 >= target : false;
    const remaining = before.filter(s => !s.done && s.id !== stepId).length;
    if (stepDone && remaining === 0) toast.success("🏆 Path complete.");
    else if (stepDone) toast.success(`Step done · +${xp} XP`);
  };

  const handleRevert = async (revisionId: string) => {
    const result = await revertTo(revisionId);
    if (!result) return;
    const bits = [
      result.restored ? `${result.restored} restored` : "",
      result.recreated ? `${result.recreated} brought back` : "",
      result.removed ? `${result.removed} removed` : "",
    ].filter(Boolean);
    toast.success(`Plan restored${bits.length ? ` · ${bits.join(", ")}` : ""}`);
    if (result.kept > 0) {
      toast(`${result.kept} step${result.kept > 1 ? "s" : ""} kept - you had already worked on ${result.kept > 1 ? "them" : "it"}.`);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    await createPath(name);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-muted-foreground animate-pulse">Loading paths...</div></div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gradient-purple mb-2">🪜 Paths</h2>
        <p className="text-muted-foreground text-sm">
          A goal, broken into steps. The first unfinished step is what shows up on Home.
        </p>
      </motion.div>

      {missingTables ? (
        <div className="glass-card p-6 text-center">
          <p className="text-foreground font-semibold mb-2">Paths needs a database migration</p>
          <p className="text-sm text-muted-foreground">
            Run <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-xs">supabase/migrations/20260827120000_paths.sql</code> against your Supabase project, then reload.
          </p>
        </div>
      ) : (
        <>
          {!engineReady && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06]">
              <p className="text-xs text-foreground/85">
                Your paths are here, but the planning-loop migration hasn&apos;t run on this database yet.
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Diagnosis, history and the stall check are hidden until{" "}
                <code className="px-1 py-0.5 rounded bg-white/10 font-mono">20260829120000_paths_engine.sql</code> is applied.
              </p>
            </div>
          )}

          {/* Create */}
          <div className="flex items-center gap-2 mb-5">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="New path — what do you want to get good at?"
              className="flex-1 min-w-0 bg-background/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
            />
            <button
              onClick={handleCreate}
              className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all flex-shrink-0"
            >
              Create
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-sm">
                {showArchived ? "Nothing archived." : "No paths yet. Name one above — steps can come later, or from AI."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map(path => (
                <PathCard
                  key={path.id}
                  path={path}
                  steps={stepsByPath(path.id)}
                  loggedTodayIds={loggedTodayIds}
                  streakOf={(stepId) => stepStreak(logs, stepId)}
                  categories={categories}
                  onLog={(stepId) => handleLog(path.id, path.category_id, stepId)}
                  focused={focusedId === path.id}
                  revisions={revisionsOf(path.id)}
                  staleDays={(stepId) => stepIdleDays(logs, stepsByPath(path.id), stepId)}
                  onSetDiagnosis={(text) => setDiagnosis(path.id, text)}
                  onScore={(verdict, actual) => scoreDiagnosis(path.id, verdict, actual)}
                  onRevert={handleRevert}
                  onSnoozeStep={snoozeStep}
                  engineReady={engineReady}
                  onUndo={undoToday}
                  onAddStep={(title, reps) => addStep(path.id, title, reps > 1 ? { mode: "reps", repsTarget: reps } : {})}
                  onUpdateStep={updateStep}
                  onDeleteStep={deleteStep}
                  onMoveStep={moveStep}
                  onUpdatePath={(patch) => updatePath(path.id, patch)}
                  onDeletePath={() => deletePath(path.id)}
                  onAI={() => setAIPathId(path.id)}
                />
              ))}
            </div>
          )}

          {(archivedCount > 0 || showArchived) && (
            <button
              onClick={() => setShowArchived(v => !v)}
              className="mt-6 mx-auto block text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showArchived ? "← Back to active paths" : `Archived (${archivedCount})`}
            </button>
          )}
        </>
      )}

      <AnimatePresence>
        {aiPath && (
          <AIPathModal
            pathName={aiPath.name}
            categoryName={categories.find(c => c.id === aiPath.category_id)?.name}
            existingSteps={stepsByPath(aiPath.id).map(s => s.title)}
            onApply={async (drafted, diagnosis) => {
              if (stepsByPath(aiPath.id).length > 0) {
                await recordRevision(aiPath.id, "AI drafted new steps", "ai_plan");
              }
              if (diagnosis && !aiPath.diagnosis) await setDiagnosis(aiPath.id, diagnosis);
              for (const s of drafted) {
                await addStep(aiPath.id, s.title, {
                  mode: s.days > 1 ? "reps" : "once",
                  repsTarget: s.days,
                  stage: s.stage || null,
                  xp: s.xp,
                });
              }
            }}
            onClose={() => setAIPathId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
