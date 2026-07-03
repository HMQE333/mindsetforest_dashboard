import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Zap, Filter } from "lucide-react";
import { usePlanningState } from "@/hooks/usePlanningState";
import { useUserProjects } from "@/hooks/useUserProjects";
import { usePillars } from "@/hooks/usePillars";

interface Props {
  onOpenProject: (id: string) => void;
}

export default function PlanningActions({ onOpenProject }: Props) {
  const { tasks, toggleTask } = usePlanningState();
  const { projects } = useUserProjects();
  const pillars = usePillars();
  const [hideCompleted, setHideCompleted] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const actionTasks = useMemo(() => {
    let items = tasks.filter(t => t.level === "action");
    if (hideCompleted) items = items.filter(t => !t.done);
    return items;
  }, [tasks, hideCompleted]);

  const handleBatchDone = () => {
    selectedIds.forEach(id => {
      const task = tasks.find(t => t.id === id);
      if (task && !task.done) toggleTask(id);
    });
    setSelectedIds(new Set());
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Actions</h2>
          <p className="text-sm text-muted-foreground">Smallest steps across all projects</p>
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
            No actions yet. Open a project and break work down to the smallest steps.
          </p>
        ) : (
          actionTasks.map(task => {
            const project = projects.find(p => p.id === task.project_id);
            const isSelected = selectedIds.has(task.id);
            return (
              <div
                key={task.id}
                className={`flex items-center gap-3 px-4 py-3.5 transition-all group ${
                  isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-white/3 border-l-2 border-l-transparent"
                }`}
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

                {project && (
                  <button
                    onClick={() => onOpenProject(project.id)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors truncate max-w-[120px]"
                  >
                    {project.emoji} {project.name}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl glass-card border border-primary/30 glow-md">
          <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
          <button onClick={handleBatchDone} className="flex items-center gap-1.5 h-7 text-xs px-3 rounded-lg bg-primary/15 text-primary border border-primary/30">
            <Check className="h-3 w-3" /> Mark done
          </button>
        </div>
      )}
    </motion.div>
  );
}
