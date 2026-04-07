import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, ChevronRight, FolderOpen } from "lucide-react";
import { useUserProjects, UserProject } from "@/hooks/useUserProjects";
import { usePlanningState } from "@/hooks/usePlanningState";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";

interface Props {
  onOpenProject: (id: string) => void;
}

export default function PlanningPortfolio({ onOpenProject }: Props) {
  const { projects, addProject } = useUserProjects();
  const { tasks } = usePlanningState();
  const pillars = usePillars();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPillar, setNewPillar] = useState("");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addProject(newName.trim(), "📂", newPillar || undefined);
    setNewName("");
    setNewPillar("");
    setShowAdd(false);
  };

  // Group projects by parent_category (pillar)
  const grouped = new Map<string, UserProject[]>();
  for (const p of projects) {
    const key = p.parent_category || "uncategorized";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Portfolio</h2>
          <p className="text-sm text-muted-foreground">All projects across your pillars</p>
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
          <div key={pillar.id} className="glass-card p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <PillarIcon icon={pillar.icon} iconUrl={pillar.iconUrl} size={20} />
              <h3 className="text-sm font-semibold text-foreground">{pillar.name}</h3>
              <span className="text-xs text-muted-foreground ml-auto px-2 py-0.5 rounded-full bg-muted/30">
                {pillarProjects.length}
              </span>
            </div>
            {pillarProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground pl-7">No projects yet</p>
            ) : (
              <div className="space-y-1">
                {pillarProjects.map(project => {
                  const projectTasks = tasks.filter(t => t.project_id === project.id);
                  const done = projectTasks.filter(t => t.done).length;
                  const total = projectTasks.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <button
                      key={project.id}
                      onClick={() => onOpenProject(project.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 transition-all group text-left"
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {project.emoji} {project.name}
                        </p>
                      </div>
                      {total > 0 && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div
                              className="h-full rounded-full gradient-purple transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right font-mono">{pct}%</span>
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Uncategorized */}
      {(grouped.get("uncategorized") || []).length > 0 && (
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📁</span>
            <h3 className="text-sm font-semibold text-foreground">Uncategorized</h3>
          </div>
          <div className="space-y-1">
            {(grouped.get("uncategorized") || []).map(project => {
              const projectTasks = tasks.filter(t => t.project_id === project.id);
              const done = projectTasks.filter(t => t.done).length;
              const total = projectTasks.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <button
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 transition-all group text-left"
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
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
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
