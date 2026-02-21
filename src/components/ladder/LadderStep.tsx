import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LADDER_LEVELS, LadderTask } from "@/lib/ladder-data";

interface LadderStepProps {
  level: number;
  tasks: LadderTask[];
  isComplete: boolean;
  isOdd: boolean;
  onAddTask: () => void;
  onUpdateTask: (taskId: string, updates: Partial<LadderTask>) => void;
  onDeleteTask: (taskId: string) => void;
}

export default function LadderStep({ level, tasks, isComplete, isOdd, onAddTask, onUpdateTask, onDeleteTask }: LadderStepProps) {
  const levelInfo = LADDER_LEVELS[level];
  const [newTaskId, setNewTaskId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (newTaskId && inputRef.current) {
      inputRef.current.focus();
      setNewTaskId(null);
    }
  }, [newTaskId, tasks]);

  const handleAdd = () => {
    onAddTask();
    // The latest task will be the new one
    setTimeout(() => {
      const lastTask = tasks[tasks.length - 1];
      if (lastTask) setNewTaskId(lastTask.id);
    }, 50);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: level * 0.1 }}
      className={`flex items-start gap-6 relative z-[2] ${isOdd ? "flex-row" : "flex-row-reverse"}`}
    >
      {/* Node */}
      <div className={`flex-shrink-0 w-[70px] h-[70px] flex items-center justify-center rounded-full text-2xl font-bold border-2 ${levelInfo.colors.border} backdrop-blur-lg transition-all duration-300 hover:scale-110`}
        style={{
          background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.2)`,
        }}
      >
        <div className={`bg-gradient-to-br ${levelInfo.colors.bg} w-full h-full rounded-full flex items-center justify-center`}>
          {levelInfo.emoji}
        </div>
      </div>

      {/* Card */}
      <div className={`flex-1 min-w-0 max-w-[420px] glass-card p-5 relative transition-all duration-300 hover:border-white/20 ${isComplete ? "ring-1 ring-green-500/30" : ""}`}>
        {/* Completion seal */}
        <AnimatePresence>
          {isComplete && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              className="absolute top-[22%] left-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase z-10 pointer-events-none"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              Completed
            </motion.div>
          )}
        </AnimatePresence>

        <h3 className="text-lg font-bold text-gradient-purple mb-4">{levelInfo.title}</h3>

        <div className="space-y-3">
          {tasks.map((task, i) => (
            <div key={task.id} className="flex gap-2 items-center group">
              <input
                type="checkbox"
                checked={task.completed}
                onChange={e => onUpdateTask(task.id, { completed: e.target.checked })}
                className="w-5 h-5 rounded-md border-2 border-white/20 bg-transparent cursor-pointer accent-primary flex-shrink-0 transition-all hover:border-primary"
              />
              <input
                ref={i === tasks.length - 1 ? inputRef : undefined}
                type="text"
                value={task.text}
                placeholder="Enter task..."
                onChange={e => onUpdateTask(task.id, { text: e.target.value })}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
                className={`flex-1 bg-transparent border-b-2 border-white/10 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/60 transition-colors ${task.completed ? "opacity-50 line-through" : ""}`}
              />
              <button
                onClick={() => onDeleteTask(task.id)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 transition-all flex-shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleAdd}
          className="w-full mt-3 py-3 px-4 rounded-lg border-2 border-dashed border-white/10 text-sm text-muted-foreground text-left hover:border-primary/40 hover:text-primary transition-all"
        >
          + Add task
        </button>
      </div>
    </motion.div>
  );
}
