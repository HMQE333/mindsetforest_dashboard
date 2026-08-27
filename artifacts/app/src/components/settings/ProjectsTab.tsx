import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { useUserProjects, UserProject } from "@/hooks/useUserProjects";
import { useUserSettings } from "@/hooks/useUserSettings";
import PillarIcon from "@/components/shared/PillarIcon";

const COLOR_PRESETS = [
  { var: "cat-mind", label: "Purple", hex: "#8B5CF6" },
  { var: "cat-body", label: "Red", hex: "#EF4444" },
  { var: "cat-craft", label: "Orange", hex: "#F97316" },
  { var: "cat-soul", label: "Cyan", hex: "#06B6D4" },
  { var: "cat-social", label: "Gold", hex: "#FBBF24" },
  { var: "cat-fun", label: "Indigo", hex: "#6366F1" },
  { var: "cat-wealth", label: "Green", hex: "#10B981" },
  { var: "cat-world", label: "Rose", hex: "#EC4899" },
];

interface EditingProject {
  id: string;
  name: string;
  emoji: string;
  parent_category: string | null;
  color_var: string;
}

export default function ProjectsTab() {
  const { projects, addProject, deleteProject, renameProject } = useUserProjects();
  const { getCategories } = useUserSettings();
  const categories = getCategories();

  const [editingList, setEditingList] = useState<EditingProject[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📁");
  const [showNew, setShowNew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setEditingList(projects.map(p => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      parent_category: p.parent_category,
      color_var: (p as any).color_var || "cat-mind",
    })));
  }, [projects]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addProject(newName.trim(), newEmoji);
    setNewName("");
    setNewEmoji("📁");
    setShowNew(false);
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setEditingList(prev => prev.filter(p => p.id !== id));
  };

  const handleSaveProject = useCallback(async (proj: EditingProject) => {
    await renameProject(proj.id, proj.name, proj.emoji);
    const { supabase } = await import("@/integrations/supabase/client");
    await (supabase.from("user_projects" as any) as any)
      .update({ parent_category: proj.parent_category, color_var: proj.color_var })
      .eq("id", proj.id);
  }, [renameProject]);

  const updateField = (id: string, field: keyof EditingProject, value: string | null) => {
    setEditingList(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-muted-foreground">Manage your projects. Set parent category, color & emoji</p>
        <button onClick={() => setShowNew(!showNew)} className="text-xs text-primary hover:text-primary/80 font-semibold transition-colors flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> New
        </button>
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="glass-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={newEmoji}
                  onChange={e => setNewEmoji(e.target.value)}
                  className="w-10 h-10 text-center text-xl bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-primary/50"
                  maxLength={4}
                />
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Project name..."
                  className="flex-1 bg-transparent text-sm font-bold text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  maxLength={40}
                  onKeyDown={e => e.key === "Enter" && handleAdd()}
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
                className="w-full py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-xs glow-sm hover:opacity-90 transition-all disabled:opacity-40"
              >
                Create Project
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {editingList.length === 0 && !showNew && (
          <div className="text-center py-8 text-muted-foreground text-sm">No projects yet. Click + New to create one.</div>
        )}
        {editingList.map((proj, i) => {
          const isExpanded = expandedId === proj.id;
          const parentCat = categories.find(c => c.id === proj.parent_category);
          return (
            <motion.div
              key={proj.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass-card overflow-hidden"
            >
              <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : proj.id)}
              >
                <span className="text-xl">{proj.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{proj.name}</div>
                  {parentCat && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      under <PillarIcon icon={parentCat.icon} iconUrl={parentCat.iconUrl} size={12} className="inline-block" /> {parentCat.name}
                    </div>
                  )}
                </div>
                <div
                  className="w-4 h-4 rounded-full border border-white/20"
                  style={{ backgroundColor: `hsl(var(--${proj.color_var}))` }}
                />
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={proj.emoji}
                          onChange={e => updateField(proj.id, "emoji", e.target.value)}
                          className="w-10 h-10 text-center text-xl bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-primary/50"
                          maxLength={4}
                        />
                        <input
                          value={proj.name}
                          onChange={e => updateField(proj.id, "name", e.target.value)}
                          className="flex-1 bg-transparent text-sm font-bold text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                          maxLength={40}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Parent Category</label>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={() => updateField(proj.id, "parent_category", null)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                              !proj.parent_category ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:bg-white/5 border border-white/5"
                            }`}
                          >
                            None
                          </button>
                          {categories.map(cat => (
                            <button
                              key={cat.id}
                              onClick={() => updateField(proj.id, "parent_category", cat.id)}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                                proj.parent_category === cat.id
                                  ? "bg-primary/20 text-primary border border-primary/30"
                                  : "text-muted-foreground hover:bg-white/5 border border-white/5"
                              }`}
                            >
                              <PillarIcon icon={cat.icon} iconUrl={cat.iconUrl} size={14} className="inline-block" /> {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 block">Color</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {COLOR_PRESETS.map(cp => (
                            <button
                              key={cp.var}
                              onClick={() => updateField(proj.id, "color_var", cp.var)}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${
                                proj.color_var === cp.var ? "border-foreground scale-125" : "border-transparent"
                              }`}
                              style={{ backgroundColor: cp.hex }}
                              title={cp.label}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await handleSaveProject(proj);
                          }}
                          className="flex-1 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-xs glow-sm hover:opacity-90 transition-all"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => handleDelete(proj.id)}
                          className="p-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
