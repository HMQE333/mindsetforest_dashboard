import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, ChevronRight, ChevronDown, Check, Trash2, Target, Flag, ListChecks, Zap } from "lucide-react";
import { usePlanningState, PlanningTask, TaskLevel } from "@/hooks/usePlanningState";
import { useBoards } from "@/hooks/useBoards";
import { useUserProjects } from "@/hooks/useUserProjects";
import BoardProjectLinker from "./BoardProjectLinker";

const levelConfig: Record<TaskLevel, { label: string; icon: React.ComponentType<{ className?: string }>; indent: number; gradient: string }> = {
  goal: { label: "Goal", icon: Target, indent: 0, gradient: "from-purple-500 to-pink-500" },
  phase: { label: "Phase", icon: Flag, indent: 1, gradient: "from-blue-500 to-purple-500" },
  task: { label: "Task", icon: ListChecks, indent: 2, gradient: "from-cyan-500 to-blue-500" },
  action: { label: "Action", icon: Zap, indent: 3, gradient: "from-green-500 to-cyan-500" },
  link: { label: "Link", icon: Zap, indent: 3, gradient: "from-orange-500 to-yellow-500" },
};

const nextLevel: Record<TaskLevel, TaskLevel | null> = {
  goal: "phase",
  phase: "task",
  task: "action",
  action: null,
  link: null,
};

interface Props {
  boardId: string;
  onBack: () => void;
}

export default function PlanningStack({ boardId, onBack }: Props) {
  const { boards, getLinkedProjectIds, linkProject, unlinkProject } = useBoards();
  const { projects } = useUserProjects();
  const board = boards.find(b => b.id === boardId);
  const linkedProjectIds = getLinkedProjectIds(boardId);
  const { tasks, addTask, toggleTask, deleteTask } = usePlanningState(undefined, { boardId, linkedProjectIds });
  const boardTasks = tasks.filter(t => t.level !== "link");
  const rootTasks = boardTasks.filter(t => t.parent_id === null);

  const [addingTo, setAddingTo] = useState<{ parentId: string | null; level: TaskLevel } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (!board) return null;

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAdd = (parentId: string | null, level: TaskLevel) => {
    setAddingTo({ parentId, level });
    setNewTitle("");
  };

  const submitAdd = async () => {
    if (!newTitle.trim() || !addingTo) return;
    // Root goals are board-level (no project). Children inherit their parent's
    // container so project tasks stay with their project.
    let project_id: string | null = null;
    let board_id: string | null = boardId;
    if (addingTo.parentId) {
      const parent = boardTasks.find(t => t.id === addingTo.parentId);
      project_id = parent?.project_id ?? null;
      board_id = parent?.board_id ?? (project_id ? null : boardId);
    }
    await addTask({
      project_id,
      board_id,
      parent_id: addingTo.parentId,
      level: addingTo.level,
      title: newTitle.trim(),
      done: false,
      deadline: null,
      leverage: null,
      energy: null,
      time_minutes: null,
      url: null,
      icon: null,
      notes: "",
    });
    setAddingTo(null);
    setNewTitle("");
  };

  const sourceLabel = (task: PlanningTask): string | null => {
    if (task.project_id) {
      const p = projects.find(pr => pr.id === task.project_id);
      return p ? `${p.emoji} ${p.name}` : null;
    }
    return null;
  };

  const renderTask = (task: PlanningTask) => {
    const children = boardTasks.filter(t => t.parent_id === task.id);
    const config = levelConfig[task.level];
    const Icon = config.icon;
    const isCollapsed = collapsed.has(task.id);
    const hasChildren = children.length > 0;
    const next = nextLevel[task.level];
    const doneChildren = children.filter(c => c.done).length;
    const src = task.parent_id === null ? sourceLabel(task) : null;

    return (
      <div key={task.id} style={{ paddingLeft: `${config.indent * 24}px` }}>
        <div className="group flex items-center gap-2.5 py-2 px-3 rounded-xl hover:bg-white/5 transition-all">
          {hasChildren ? (
            <button onClick={() => toggleCollapse(task.id)} className="p-0.5 text-muted-foreground hover:text-primary transition-colors">
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-[18px]" />
          )}

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

          <div className={`w-5 h-5 rounded bg-gradient-to-br ${config.gradient} flex items-center justify-center`}>
            <Icon className="h-3 w-3 text-white" />
          </div>

          <span className={`text-sm flex-1 ${task.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </span>

          {src && (
            <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40 truncate max-w-[140px]">{src}</span>
          )}

          {hasChildren && (
            <span className="text-xs text-muted-foreground font-mono">{doneChildren}/{children.length}</span>
          )}

          {next && (
            <button
              onClick={() => handleAdd(task.id, next)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            onClick={() => deleteTask(task.id)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {addingTo?.parentId === task.id && (
          <div className="flex items-center gap-2 py-1.5 px-3" style={{ paddingLeft: `${(config.indent + 1) * 24 + 8}px` }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") setAddingTo(null); }}
              placeholder={`New ${levelConfig[addingTo.level].label.toLowerCase()}...`}
              className="flex-1 h-8 text-sm bg-muted/30 border border-white/10 rounded-lg px-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              autoFocus
            />
            <button onClick={submitAdd} className="h-8 px-3 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-all">Add</button>
          </div>
        )}

        {!isCollapsed && children.map(child => renderTask(child))}
      </div>
    );
  };

  const totalTasks = boardTasks.length;
  const doneTasks = boardTasks.filter(t => t.done).length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-primary transition-all">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{board.emoji} {board.name}</h2>
        </div>
        <BoardProjectLinker
          projects={projects}
          linkedIds={linkedProjectIds}
          onLink={(pid) => linkProject(boardId, pid)}
          onUnlink={(pid) => unlinkProject(boardId, pid)}
        />
        {totalTasks > 0 && (
          <span className="text-sm text-muted-foreground font-mono">{doneTasks}/{totalTasks} done</span>
        )}
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground">Decomposition Ladder</h3>
          <button onClick={() => handleAdd(null, "goal")} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all">
            <Plus className="h-3.5 w-3.5" /> Add Goal
          </button>
        </div>

        {rootTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {linkedProjectIds.length === 0
              ? "This board is empty. Add a goal directly, or link an existing project to pull in its planning."
              : "Start by adding a goal, then break it down into phases, tasks, and actions."}
          </p>
        ) : (
          <div className="space-y-0.5">{rootTasks.map(task => renderTask(task))}</div>
        )}

        {addingTo?.parentId === null && (
          <div className="flex items-center gap-2 mt-3 px-3">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") setAddingTo(null); }}
              placeholder="Goal or top-level outcome..."
              className="flex-1 h-8 text-sm bg-muted/30 border border-white/10 rounded-lg px-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              autoFocus
            />
            <button onClick={submitAdd} className="h-8 px-3 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-all">Add</button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
