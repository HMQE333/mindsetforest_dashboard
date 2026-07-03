import { useState } from "react";
import { motion } from "framer-motion";
import { HabitLoop } from "@/lib/habit-loop-data";
import { X, Plus, Trash2 } from "lucide-react";

interface ManualHabitLoopModalProps {
  onApply: (loops: HabitLoop[]) => void;
  onClose: () => void;
}

interface DraftLoop {
  name: string;
  repsRequired: number;
  tasks: string[];
}

export default function ManualHabitLoopModal({ onApply, onClose }: ManualHabitLoopModalProps) {
  const [loops, setLoops] = useState<DraftLoop[]>([]);
  const [name, setName] = useState("");
  const [reps, setReps] = useState(3);
  const [tasks, setTasks] = useState<string[]>([""]);

  const addTaskField = () => setTasks(prev => [...prev, ""]);

  const updateTask = (idx: number, val: string) => {
    setTasks(prev => prev.map((t, i) => i === idx ? val : t));
  };

  const removeTask = (idx: number) => {
    if (tasks.length <= 1) return;
    setTasks(prev => prev.filter((_, i) => i !== idx));
  };

  const addLoop = () => {
    const validTasks = tasks.filter(t => t.trim());
    if (!name.trim() || validTasks.length === 0 || reps < 1) return;
    setLoops(prev => [...prev, { name: name.trim(), repsRequired: reps, tasks: validTasks }]);
    setName("");
    setReps(3);
    setTasks([""]);
  };

  const removeLoop = (idx: number) => setLoops(prev => prev.filter((_, i) => i !== idx));

  const apply = () => {
    const formatted: HabitLoop[] = loops.map(l => ({
      name: l.name,
      repsRequired: l.repsRequired,
      tasks: l.tasks.map(t => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        text: t,
        completedReps: 0,
      })),
    }));
    onApply(formatted);
    onClose();
  };

  const canAddLoop = name.trim() && tasks.some(t => t.trim()) && reps >= 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-card rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-foreground">➕ Create Habit Loops</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Loop Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Morning Routine"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Reps Required</label>
            <input
              type="number"
              min={1}
              max={100}
              value={reps}
              onChange={e => setReps(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-foreground focus:outline-none focus:border-primary/50 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Tasks</label>
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={task}
                    onChange={e => updateTask(i, e.target.value)}
                    placeholder={`Task ${i + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 text-sm"
                  />
                  {tasks.length > 1 && (
                    <button onClick={() => removeTask(i)} className="p-2 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addTaskField} className="mt-2 text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
              <Plus className="w-3 h-3" /> Add task
            </button>
          </div>
          <button
            onClick={addLoop}
            disabled={!canAddLoop}
            className="w-full py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            + Add Loop to List
          </button>
        </div>

        {/* Preview */}
        {loops.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-muted-foreground mb-3">Loops to create ({loops.length})</h4>
            <div className="space-y-2">
              {loops.map((loop, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                  <div>
                    <span className="text-sm font-medium text-foreground">{loop.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {loop.tasks.length} tasks · {loop.repsRequired} reps
                    </span>
                  </div>
                  <button onClick={() => removeLoop(i)} className="p-1 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={apply}
          disabled={loops.length === 0}
          className="w-full py-3 rounded-xl gradient-purple text-primary-foreground font-bold glow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:-translate-y-0.5 transition-all"
        >
          ✅ Apply {loops.length} Loop{loops.length !== 1 ? "s" : ""}
        </button>
      </motion.div>
    </motion.div>
  );
}
