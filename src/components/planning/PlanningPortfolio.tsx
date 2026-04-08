import { useState, useCallback, DragEvent } from "react";
import { motion } from "framer-motion";
import { Plus, ChevronRight, FolderOpen, Trash2, GripVertical } from "lucide-react";
import { useUserProjects, UserProject } from "@/hooks/useUserProjects";
import { usePlanningState } from "@/hooks/usePlanningState";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";

interface Props {
  onOpenProject: (id: string) => void;
}

function ProjectRow({
  project,
  tasks,
  onOpen,
  onDelete,
}: {
  project: UserProject;
  tasks: any[];
  onOpen: () => void;
  onDelete: () => void;
}) {
  const projectTasks = tasks.filter((t: any) => t.project_id === project.id && t.level !== "link");
  const done = projectTasks.filter((t: any) => t.done).length;
  const total = projectTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-project-id", project.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 transition-all group text-left cursor-grab active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
      <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {project.emoji} {project.name}
        </p>
      </div>
      {total > 0 && (
        <div className="flex items-center gap-2.5">
          <div className="w-20 h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <div className="h-full rounded-full gradient-purple transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground w-8 text-right font-mono">{pct}%</span>
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${project.name}"?`)) onDelete(); }}
        className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
    </div>
  );
}

export default function PlanningPortfolio({ onOpenProject }: Props) {
  const { projects, addProject, deleteProject, moveProject } = useUserProjects();
  const { tasks } = usePlanningState();
  const pillars = usePillars();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPillar, setNewPillar] = useState("");
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addProject(newName.trim(), "📂", newPillar || undefined);
    setNewName("");
    setNewPillar("");
    setShowAdd(false);
  };

  const handleDragOver = useCallback((e: DragEvent, categoryId: string) => {
    if (!e.dataTransfer.types.includes("application/x-project-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCategory(categoryId);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent, categoryId: string) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (relatedTarget && currentTarget.contains(relatedTarget)) return;
    setDragOverCategory(prev => prev === categoryId ? null : prev);
  }, []);

  const handleDrop = useCallback((e: DragEvent, categoryId: string | null) => {
    e.preventDefault();
    setDragOverCategory(null);
    const projectId = e.dataTransfer.getData("application/x-project-id");
    if (!projectId) return;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const currentCategory = project.parent_category || "uncategorized";
    const targetCategory = categoryId || "uncategorized";
    if (currentCategory === targetCategory) return;
    moveProject(projectId, categoryId);
  }, [projects, moveProject]);

  // Group projects by parent_category (pillar)
  const grouped = new Map<string, UserProject[]>();
  for (const p of projects) {
    const key = p.parent_category || "uncategorized";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const dropZoneClass = (categoryId: string) =>
    dragOverCategory === categoryId
      ? "ring-2 ring-primary/50 bg-primary/5 scale-[1.01]"
      : "";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Portfolio</h2>
          <p className="text-sm text-muted-foreground">Drag projects between categories to reorganize</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 space-y-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
            placeholder="Project name..."
            className="w-full bg-muted/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
            autoFocus
          />
          <select
            value={newPillar}
            onChange={e => setNewPillar(e.target.value)}
            className="w-full bg-muted/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-foreground outline-none focus:border-primary/50 [&>option]:bg-card [&>option]:text-foreground"
          >
            <option value="" className="bg-card text-foreground">No category (Uncategorized)</option>
            {pillars.map(p => (
              <option key={p.id} value={p.id} className="bg-card text-foreground">{p.icon} {p.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-xs">Create</button>
            <button onClick={() => { setShowAdd(false); setNewPillar(""); }} className="px-4 py-2 rounded-xl bg-muted/30 text-muted-foreground text-xs">Cancel</button>
          </div>
        </motion.div>
      )}

      {/* Grouped by pillar */}
      {pillars.map(pillar => {
        const pillarProjects = grouped.get(pillar.id) || [];
        return (
          <div
            key={pillar.id}
            className={`glass-card p-5 space-y-3 transition-all duration-200 ${dropZoneClass(pillar.id)}`}
            onDragOver={e => handleDragOver(e, pillar.id)}
            onDragLeave={e => handleDragLeave(e, pillar.id)}
            onDrop={e => handleDrop(e, pillar.id)}
          >
            <div className="flex items-center gap-2.5">
              <PillarIcon icon={pillar.icon} iconUrl={pillar.iconUrl} size={20} />
              <h3 className="text-sm font-semibold text-foreground">{pillar.name}</h3>
              <span className="text-xs text-muted-foreground ml-auto px-2 py-0.5 rounded-full bg-muted/30">
                {pillarProjects.length}
              </span>
            </div>
            {pillarProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-7">
                {dragOverCategory === pillar.id ? "Drop here to move project" : "No projects yet"}
              </p>
            ) : (
              <div className="space-y-1">
                {pillarProjects.map(project => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    tasks={tasks}
                    onOpen={() => onOpenProject(project.id)}
                    onDelete={() => deleteProject(project.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Uncategorized */}
      <div
        className={`glass-card p-5 space-y-3 transition-all duration-200 ${dropZoneClass("uncategorized")}`}
        onDragOver={e => handleDragOver(e, "uncategorized")}
        onDragLeave={e => handleDragLeave(e, "uncategorized")}
        onDrop={e => handleDrop(e, null)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📁</span>
          <h3 className="text-sm font-semibold text-foreground">Uncategorized</h3>
          <span className="text-xs text-muted-foreground ml-auto px-2 py-0.5 rounded-full bg-muted/30">
            {(grouped.get("uncategorized") || []).length}
          </span>
        </div>
        {(grouped.get("uncategorized") || []).length === 0 ? (
          <p className="text-xs text-muted-foreground pl-7">
            {dragOverCategory === "uncategorized" ? "Drop here to uncategorize" : "No uncategorized projects"}
          </p>
        ) : (
          <div className="space-y-1">
            {(grouped.get("uncategorized") || []).map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                tasks={tasks}
                onOpen={() => onOpenProject(project.id)}
                onDelete={() => deleteProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
