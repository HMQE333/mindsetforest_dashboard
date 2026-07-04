import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Zap } from "lucide-react";
import { usePlanningState } from "@/hooks/usePlanningState";
import { useBoards } from "@/hooks/useBoards";
import { useUserProjects } from "@/hooks/useUserProjects";

interface Props {
  boardId: string | null;
  onBack: () => void;
}

export default function PlanningActions({ boardId, onBack }: Props) {
  const { boards, getLinkedProjectIds } = useBoards();
  const { projects } = useUserProjects();
  const board = boards.find(b => b.id === boardId);
  const linkedProjectIds = boardId ? getLinkedProjectIds(boardId) : [];
  const { tasks, toggleTask } = usePlanningState(undefined, boardId ? { boardId, linkedProjectIds } : undefined);
  const [hideCompleted, setHideCompleted] = useState(true);

  const actionTasks = useMemo(() => {
    let items = tasks.filter(t => t.level === "action");
    if (hideCompleted) items = items.filter(t => !t.done);
    return items;
  }, [tasks, hideCompleted]);

  if (!boardId || !board) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16 text-muted-foreground text-sm">
        Open a board to see its actions.
        <div className="mt-3">
          <button onClick={onBack} className="text-primary text-xs font-bold hover:underline">Go to Boards</button>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{board.emoji} {board.name} · Actions</h2>
          <p className="text-sm text-muted-foreground">Smallest steps across this board</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded-xl bg-muted/30 border border-white/10">
            <Zap className="h-3.5 w-3.5 text-primary" />
            {actionTasks.length} tasks
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className={`text-xs px-3 py-1.5 rounded-xl transition-all ${
            hideCompleted
              ? "bg-primary/15 text-primary glow-sm"
              : "text-muted-foreground hover:bg-white/5"
          }`}
        >
          {hideCompleted ? "Hiding done" : "Showing all"}
        </button>
      </div>

      <div className="glass-card divide-y divide-white/5">
        {actionTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-14 text-center">
            No actions yet. Open Stack and break work down to the smallest steps.
          </p>
        ) : (
          actionTasks.map(task => {
            const project = task.project_id ? projects.find(p => p.id === task.project_id) : null;
            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-4 py-3.5 transition-all group hover:bg-white/3 border-l-2 border-l-transparent"
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`flex-shrink-0 h-5 w-5 rounded-md border transition-all ${
                    task.done
                      ? "gradient-purple border-transparent glow-sm"
                      : "border-muted-foreground/30 hover:border-primary"
                  } flex items-center justify-center`}
                >
                  {task.done && <Check className="h-3 w-3 text-primary-foreground" />}
                </button>

                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {task.title}
                  </span>
                </div>

                <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                  {project ? `${project.emoji} ${project.name}` : "🗂️ Board"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
