import { motion } from "framer-motion";
import { HabitLoop, HabitTask, getLoopProgress } from "@/lib/habit-loop-data";

interface HabitLoopCardProps {
  loop: HabitLoop;
  loopIndex: number;
  isActive: boolean;
  isCompleted: boolean;
  onLogRep: (loopIndex: number, taskId: string) => void;
  onAddTask: (loopIndex: number, text: string) => void;
  onDeleteTask: (loopIndex: number, taskId: string) => void;
}

export default function HabitLoopCard({ loop, loopIndex, isActive, isCompleted, onLogRep, onAddTask, onDeleteTask }: HabitLoopCardProps) {
  const progress = getLoopProgress(loop);

  const handleAddTask = () => {
    const text = prompt("New habit:");
    if (text?.trim()) onAddTask(loopIndex, text.trim());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: loopIndex * 0.1 }}
      className={`rounded-2xl border p-5 transition-all ${
        isActive
          ? "border-primary/30 bg-gradient-to-br from-primary/10 to-transparent"
          : isCompleted
          ? "border-green-500/25 bg-green-500/5 opacity-70"
          : "border-white/8 bg-white/[0.02] opacity-40"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-lg">
            {isCompleted ? "✅" : isActive ? "🔄" : "🔒"}
          </span>
          <div>
            <h3 className="font-bold text-foreground text-sm">
              Loop {loopIndex + 1}: {loop.name}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isCompleted ? "Completed!" : isActive ? `${loop.repsRequired} reps to advance` : "Locked"}
            </p>
          </div>
        </div>
        {isActive && (
          <span className="text-xs font-bold text-primary bg-primary/15 px-2.5 py-1 rounded-lg">
            {progress.percentage}%
          </span>
        )}
      </div>

      {/* Tasks */}
      <div className="space-y-2.5">
        {loop.tasks.map((task: HabitTask) => {
          const done = task.completedReps >= loop.repsRequired;
          const pct = Math.min((task.completedReps / loop.repsRequired) * 100, 100);
          return (
            <div key={task.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              done ? "border-green-500/20 bg-green-500/5" : "border-white/8 bg-white/[0.03]"
            }`}>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${done ? "text-green-400 line-through" : "text-foreground"}`}>
                  {task.text}
                </p>
                {/* Progress bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${done ? "bg-green-500" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-muted-foreground whitespace-nowrap">
                    {task.completedReps}/{loop.repsRequired}
                  </span>
                </div>
              </div>

              {isActive && !done && (
                <button
                  onClick={() => onLogRep(loopIndex, task.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground glow-sm hover:-translate-y-0.5 transition-all flex-shrink-0"
                >
                  +1 Rep
                </button>
              )}

              {isActive && (
                <button
                  onClick={() => onDeleteTask(loopIndex, task.id)}
                  className="text-foreground/30 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add task + overall progress */}
      {isActive && (
        <div className="mt-4 flex items-center justify-between">
          <button onClick={handleAddTask} className="text-xs text-primary/80 hover:text-primary transition-colors font-bold">
            + Add Habit
          </button>
          <span className="text-[11px] text-muted-foreground">
            Overall: {progress.completed}/{progress.total} reps
          </span>
        </div>
      )}
    </motion.div>
  );
}
