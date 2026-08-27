import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLadderState } from "@/hooks/useLadderState";
import { CATEGORIES } from "@/lib/dashboard-data";
import LadderStep from "./LadderStep";
import ProgressJar from "./ProgressJar";
import AILadderModal from "./AILadderModal";
import MasteryOverlay from "./MasteryOverlay";
import { ChevronDown } from "lucide-react";

export default function LadderView() {
  const { ladders, activeId, activeLadder, loading, changeActive, createLadder, renameLadder, addTask, updateTask, deleteTask, setLevelTasks, getProgress, isLevelComplete } = useLadderState();
  const [showAI, setShowAI] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [masteryKey, setMasteryKey] = useState(0);
  const [showMastery, setShowMastery] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const prevMastered = useRef(false);

  const progress = getProgress();
  const currentLevels = activeLadder?.levels || {};

  // Cross-module: Planning Map "mention" . set active ladder by category
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.categoryId) {
        const found = ladders.find(l => l.category === detail.categoryId);
        if (found) changeActive(found.id);
      }
    };
    window.addEventListener("lov:set-ladder-category", handler as EventListener);
    return () => window.removeEventListener("lov:set-ladder-category", handler as EventListener);
  }, [changeActive, ladders]);

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
    return <div className="flex items-center justify-center py-20"><div className="text-muted-foreground animate-pulse">Loading ladders...</div></div>;
  }

  const handleCreate = () => {
    if (!newName.trim()) return;
    createLadder(newName.trim());
    setNewName("");
    setShowCreate(false);
  };

  return (
    <div>
      {/* Ladder selector */}
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {ladders.map(l => (
            <button
              key={l.id}
              onClick={() => changeActive(l.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                l.id === activeId ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/30 border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.name}
              {l.category && <span className="ml-1 opacity-50">{CATEGORIES.find(c => c.id === l.category)?.icon || ""}</span>}
            </button>
          ))}
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-lg border border-dashed border-primary/40 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all">
              + New Ladder
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} placeholder="Name..." className="px-2 py-1 rounded-lg bg-background/60 border border-white/10 text-xs text-foreground w-28 focus:outline-none focus:border-primary/40" autoFocus />
              <button onClick={handleCreate} className="text-xs text-primary font-bold">✓</button>
              <button onClick={() => { setShowCreate(false); setNewName(""); }} className="text-xs text-muted-foreground">✕</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
        {/* Category selector */}
        <div className="relative">
          <button onClick={() => setShowCatPicker(!showCatPicker)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {activeLadder?.category
              ? <>{CATEGORIES.find(c => c.id === activeLadder.category)?.icon} {CATEGORIES.find(c => c.id === activeLadder.category)?.name}</>
              : "🏷️ Category"}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showCatPicker && (
            <div className="absolute top-full mt-1 right-0 z-50 w-44 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-1 shadow-lg" onMouseLeave={() => setShowCatPicker(false)}>
              <button onClick={() => { activeLadder && renameLadder(activeLadder.id, activeLadder.name, null); setShowCatPicker(false); }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">None</button>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => { activeLadder && renameLadder(activeLadder.id, activeLadder.name, c.id); setShowCatPicker(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${activeLadder?.category === c.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                  <span>{c.icon}</span> <span>{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setShowAI(true)} className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all">
          🧠 AI Suggest
        </button>
      </div>
      </div>

      <div className="flex gap-6 items-start flex-col lg:flex-row">
        <div className="flex-1 min-w-0">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gradient-purple mb-2">🢁 Mastery Ladder</h2>
            <p className="text-muted-foreground">{activeLadder?.name || "Create your first ladder"}</p>
          </motion.div>

          <div className="relative flex flex-col gap-10 py-8">
            <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 rounded-full z-[1]" style={{ background: "linear-gradient(180deg, rgba(139,92,246,0.3) 0%, rgba(217,70,239,0.3) 25%, rgba(50,184,198,0.3) 50%, rgba(34,197,94,0.3) 75%, rgba(147,51,234,0.3) 100%)" }} />
            {[0, 1, 2, 3, 4, 5].map(level => (
              <LadderStep key={`${activeId}-${level}`} level={level} tasks={currentLevels[level] || []} isComplete={isLevelComplete(level)} isOdd={level % 2 === 0} onAddTask={() => addTask(level)} onUpdateTask={(tid, u) => updateTask(level, tid, u)} onDeleteTask={tid => deleteTask(level, tid)} />
            ))}
          </div>
        </div>
        <div className="w-full lg:w-[280px] flex-shrink-0">
          <ProgressJar total={progress.total} completed={progress.completed} percentage={progress.percentage} />
        </div>
      </div>

      <AnimatePresence>
        {showAI && activeLadder && (
          <AILadderModal categoryId={activeLadder.category || activeLadder.name} currentLadder={currentLevels} onApply={setLevelTasks} onClose={() => setShowAI(false)} projectName={activeLadder.name} />
        )}
      </AnimatePresence>
      <MasteryOverlay key={masteryKey} show={showMastery} />
    </div>
  );
}