import { useState, useRef, useEffect } from "react";
import { CATEGORIES } from "@/lib/dashboard-data";
import { UserProject, useUserProjects } from "@/hooks/useUserProjects";

interface CategoryProjectSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

const EMOJI_OPTIONS = ["📁", "🦀", "🚀", "🎹", "📚", "💻", "🎯", "🧪", "🎨", "📈", "🏋️", "🌱", "⚡", "🔧", "🧠"];

export default function CategoryProjectSelector({ value, onChange }: CategoryProjectSelectorProps) {
  const { projects, addProject, deleteProject, renameProject, projectKey, isProjectKey } = useUserProjects();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("📁");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedCat = CATEGORIES.find(c => c.id === value);
  const selectedProj = isProjectKey(value) ? projects.find(p => projectKey(p.id) === value) : null;
  const displayLabel = selectedProj ? `${selectedProj.emoji} ${selectedProj.name}` : selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : value;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const p = await addProject(newName.trim(), newEmoji);
    if (p) {
      onChange(projectKey(p.id));
      setShowCreate(false);
      setNewName("");
      setNewEmoji("📁");
      setOpen(false);
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

  return (
    <div className="flex items-center gap-3 flex-wrap" ref={ref}>
      <label className="text-sm text-muted-foreground">Scope</label>

      {/* Custom dropdown trigger */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 backdrop-blur-lg text-foreground text-sm outline-none cursor-pointer hover:bg-white/10 hover:border-white/25 transition-all flex items-center gap-2 min-w-[180px]"
        >
          <span className="truncate flex-1 text-left">{displayLabel}</span>
          <span className={`text-foreground/40 text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
        </button>

        {open && (
          <div
            className="absolute top-full left-0 mt-2 w-[260px] rounded-xl border border-white/15 backdrop-blur-xl overflow-hidden z-50"
            style={{
              background: "rgba(16,16,24,0.85)",
              boxShadow: "0 16px 64px rgba(0,0,0,0.5)",
            }}
          >
            {/* Categories */}
            <div className="px-3 pt-3 pb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground/40">Categories</span>
            </div>
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition-all hover:bg-white/8 ${
                  value === c.id ? "bg-primary/15 text-foreground" : "text-foreground/80"
                }`}
              >
                <span className="text-base">{c.icon}</span>
                <span className="truncate">{c.name}</span>
                {value === c.id && <span className="ml-auto text-primary text-xs">●</span>}
              </button>
            ))}

            {/* Projects */}
            {projects.length > 0 && (
              <>
                <div className="px-3 pt-3 pb-1 border-t border-white/8">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-foreground/40">Projects</span>
                </div>
                {projects.map(p => {
                  const pKey = projectKey(p.id);
                  const isActive = value === pKey;

                  if (editingId === p.id) {
                    return (
                      <div key={p.id} className="px-3 py-2 flex items-center gap-1.5">
                        <select value={editEmoji} onChange={e => setEditEmoji(e.target.value)}
                          className="w-8 rounded-lg border border-white/15 bg-white/5 text-center text-xs outline-none cursor-pointer">
                          {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleRename(p)}
                          className="px-2 py-1 rounded-lg border border-white/15 bg-white/5 text-xs text-foreground outline-none flex-1 min-w-0"
                          autoFocus />
                        <button onClick={() => handleRename(p)} className="text-xs text-green-400 hover:text-green-300">✓</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-foreground/40 hover:text-foreground">✕</button>
                      </div>
                    );
                  }

                  return (
                    <div key={p.id} className={`group flex items-center transition-all hover:bg-white/8 ${isActive ? "bg-primary/15" : ""}`}>
                      <button
                        onClick={() => { onChange(pKey); setOpen(false); }}
                        className="flex-1 px-3 py-2 text-left text-sm flex items-center gap-2.5"
                      >
                        <span className="text-base">{p.emoji}</span>
                        <span className={`truncate ${isActive ? "text-foreground" : "text-foreground/80"}`}>{p.name}</span>
                        {isActive && <span className="ml-auto text-primary text-xs">●</span>}
                      </button>
                      <div className="flex gap-0.5 pr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingId(p.id); setEditName(p.name); setEditEmoji(p.emoji); }}
                          className="p-1 rounded text-foreground/40 hover:text-foreground text-xs">✏️</button>
                        <button onClick={() => handleDelete(p)}
                          className="p-1 rounded text-foreground/40 hover:text-red-400 text-xs">🗑</button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Create */}
            <div className="border-t border-white/8">
              {showCreate ? (
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <select value={newEmoji} onChange={e => setNewEmoji(e.target.value)}
                      className="w-8 rounded-lg border border-white/15 bg-white/5 text-center text-xs outline-none cursor-pointer">
                      {EMOJI_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleCreate()}
                      placeholder="Project name..."
                      className="flex-1 px-2 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs text-foreground placeholder:text-foreground/30 outline-none min-w-0"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={handleCreate} className="flex-1 px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold">Create</button>
                    <button onClick={() => { setShowCreate(false); setNewName(""); }} className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-foreground/60 hover:text-foreground">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full px-3 py-2.5 text-left text-sm text-foreground/60 hover:text-foreground hover:bg-white/5 transition-all flex items-center gap-2"
                >
                  <span className="text-base">➕</span>
                  <span>New Project</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
