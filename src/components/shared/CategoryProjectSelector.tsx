import { useState } from "react";
import { CATEGORIES } from "@/lib/dashboard-data";
import { UserProject, useUserProjects } from "@/hooks/useUserProjects";

interface CategoryProjectSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const EMOJI_OPTIONS = ["📁", "🦀", "🚀", "🎹", "📚", "💻", "🎯", "🧪", "🎨", "📈", "🏋️", "🌱", "⚡", "🔧", "🧠"];

export default function CategoryProjectSelector({ value, onChange }: CategoryProjectSelectorProps) {
  const { projects, addProject, deleteProject, renameProject, projectKey, isProjectKey } = useUserProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📁");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const p = await addProject(newName.trim(), newEmoji);
    if (p) {
      onChange(projectKey(p.id));
      setShowCreate(false);
      setNewName("");
      setNewEmoji("📁");
    }
  };

  const handleDelete = async (p: UserProject) => {
    await deleteProject(p.id);
    if (value === projectKey(p.id)) onChange("mind");
  };

  const handleRename = async (p: UserProject) => {
    if (!editName.trim()) return;
    await renameProject(p.id, editName.trim(), editEmoji);
    setEditingId(null);
  };

  const startEdit = (p: UserProject) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditEmoji(p.emoji);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="text-sm text-muted-foreground">Scope</label>

      {/* Dropdown */}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 backdrop-blur-lg text-foreground text-sm outline-none cursor-pointer"
      >
        <optgroup label="Categories">
          {CATEGORIES.map(c => (
            <option key={c.id} value={c.id} className="bg-background text-foreground">{c.icon} {c.name}</option>
          ))}
        </optgroup>
        {projects.length > 0 && (
          <optgroup label="Projects">
            {projects.map(p => (
              <option key={p.id} value={projectKey(p.id)} className="bg-background text-foreground">{p.emoji} {p.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      {/* + New Project button */}
      <button
        onClick={() => setShowCreate(true)}
        className="px-3 py-2.5 rounded-xl border border-white/15 bg-white/5 text-foreground text-sm hover:bg-white/10 transition-all"
      >
        + Project
      </button>

      {/* Project context menu (edit/delete) */}
      {isProjectKey(value) && (
        <div className="flex gap-1">
          {(() => {
            const pid = value.replace("project-", "");
            const p = projects.find(pr => pr.id === pid);
            if (!p) return null;
            if (editingId === p.id) {
              return (
                <div className="flex items-center gap-2">
                  <select value={editEmoji} onChange={e => setEditEmoji(e.target.value)}
                    className="w-10 rounded-lg border border-white/15 bg-white/5 text-center text-sm outline-none cursor-pointer">
                    {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <input value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleRename(p)}
                    className="px-2 py-1.5 rounded-lg border border-white/15 bg-white/5 text-sm text-foreground outline-none w-32"
                    autoFocus />
                  <button onClick={() => handleRename(p)} className="text-xs text-green-400 hover:text-green-300">✓</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                </div>
              );
            }
            return (
              <>
                <button onClick={() => startEdit(p)} className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-foreground transition-all" title="Rename">✏️</button>
                <button onClick={() => handleDelete(p)} className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-xs text-muted-foreground hover:text-red-400 transition-all" title="Delete">🗑</button>
              </>
            );
          })()}
        </div>
      )}

      {/* Inline create form */}
      {showCreate && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-white/15 bg-white/5 backdrop-blur-lg">
          <select value={newEmoji} onChange={e => setNewEmoji(e.target.value)}
            className="w-10 rounded-lg border border-white/15 bg-white/5 text-center text-sm outline-none cursor-pointer">
            {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="Project name..."
            className="px-2 py-1.5 rounded-lg border border-white/15 bg-white/5 text-sm text-foreground placeholder:text-foreground/30 outline-none w-40"
            autoFocus
          />
          <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold">Create</button>
          <button onClick={() => { setShowCreate(false); setNewName(""); }} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}
    </div>
  );
}
