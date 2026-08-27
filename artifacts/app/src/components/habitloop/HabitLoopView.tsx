import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useHabitLoopState } from "@/hooks/useHabitLoopState";
import { CATEGORIES } from "@/lib/dashboard-data";
import { isLoopComplete } from "@/lib/habit-loop-data";
import HabitLoopCard from "./HabitLoopCard";
import AIHabitLoopModal from "./AIHabitLoopModal";
import ManualHabitLoopModal from "./ManualHabitLoopModal";
import MasteryOverlay from "@/components/ladder/MasteryOverlay";
import { ChevronDown } from "lucide-react";

export default function HabitLoopView() {
  const { projects, activeId, activeProject, currentState, loading, changeActive, createProject, renameProject, logRep, addTask, deleteTask, setLoops, addLoops, resetLoop } = useHabitLoopState();
  const [showAI, setShowAI] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [showMastery, setShowMastery] = useState(false);
  const [masteryKey, setMasteryKey] = useState(0);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const prevAllComplete = useRef(false);

  const loops = currentState.loops;
  const currentLoop = currentState.currentLoop;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.categoryId) {
        const found = projects.find(p => p.category === detail.categoryId);
        if (found) changeActive(found.id);
      }
    };
    window.addEventListener("lov:set-loop-category", handler as EventListener);
    return () => window.removeEventListener("lov:set-loop-category", handler as EventListener);
  }, [changeActive, projects]);

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
    return <div className="flex items-center justify-center py-20"><div className="text-muted-foreground animate-pulse">Loading habit loops...</div></div>;
  }

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProject(newName.trim());
    setNewName("");
    setShowCreate(false);
  };

  return (
    <div>
      {/* Project selector */}
      <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {projects.map(p => (
            <button key={p.id} onClick={() => changeActive(p.id)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${p.id === activeId ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/30 border border-border text-muted-foreground hover:text-foreground"}`}>
              {p.name}
              {p.category && <span className="ml-1 opacity-50">{CATEGORIES.find(c => c.id === p.category)?.icon || ""}</span>}
            </button>
          ))}
          {!showCreate ? (
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-lg border border-dashed border-primary/40 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-all">
              + New Loop
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} placeholder="Name..." className="px-2 py-1 rounded-lg bg-background/60 border border-white/10 text-xs text-foreground w-28 focus:outline-none focus:border-primary/40" autoFocus />
              <button onClick={handleCreate} className="text-xs text-primary font-bold">✓</button>
              <button onClick={() => { setShowCreate(false); setNewName(""); }} className="text-xs text-muted-foreground">✕</button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {loops.length > 0 && (<button onClick={resetLoop} className="px-4 py-2.5 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">↺ Reset</button>)}
          <button onClick={() => setShowManual(true)} className="px-4 py-2.5 rounded-xl border border-white/14 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all">➕ Create</button>
          {/* Category selector */}
          <div className="relative">
            <button onClick={() => setShowCatPicker(!showCatPicker)} className="flex items-center gap-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {activeProject?.category
                ? <>{CATEGORIES.find(c => c.id === activeProject.category)?.icon} {CATEGORIES.find(c => c.id === activeProject.category)?.name}</>
                : "🏷️ Category"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showCatPicker && (
              <div className="absolute top-full mt-1 right-0 z-50 w-44 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-1 shadow-lg" onMouseLeave={() => setShowCatPicker(false)}>
                <button onClick={() => { activeProject && renameProject(activeProject.id, activeProject.name, null); setShowCatPicker(false); }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">None</button>
                {CATEGORIES.map(c => (
                  <button key={c.id} onClick={() => { activeProject && renameProject(activeProject.id, activeProject.name, c.id); setShowCatPicker(false); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${activeProject?.category === c.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                    <span>{c.icon}</span> <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowAI(true)} className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all">🧠 AI Generate</button>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
        <h2 className="text-3xl font-bold text-gradient-purple mb-2">🔄 Habit Loop</h2>
        <p className="text-muted-foreground">{activeProject?.name || "Create your first habit loop"}</p>
      </motion.div>

      {loops.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
          <p className="text-muted-foreground mb-4">No habit loops yet. Generate with AI or add manually.</p>
          <button onClick={() => setShowAI(true)} className="px-6 py-3 rounded-xl gradient-purple text-primary-foreground font-bold glow-md hover:-translate-y-0.5 transition-all">✨ Generate Habit Loops</button>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {loops.map((loop, i) => (
            <HabitLoopCard key={i} loop={loop} loopIndex={i} isActive={i === currentLoop} isCompleted={i < currentLoop || isLoopComplete(loop)} onLogRep={logRep} onAddTask={addTask} onDeleteTask={deleteTask} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAI && activeProject && (
          <AIHabitLoopModal categoryId={activeProject.category || activeProject.name} onApply={setLoops} onClose={() => setShowAI(false)} projectName={activeProject.name} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showManual && (<ManualHabitLoopModal onApply={addLoops} onClose={() => setShowManual(false)} />)}
      </AnimatePresence>
      <MasteryOverlay key={masteryKey} show={showMastery} />
    </div>
  );
}