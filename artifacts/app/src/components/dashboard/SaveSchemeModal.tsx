import { useState } from "react";
import { motion } from "framer-motion";
import { X, Check } from "lucide-react";
import { Mission } from "@/lib/dashboard-data";
import { CustomCategory } from "@/hooks/useUserSettings";

const EMOJI_CHOICES = ["🎛️", "🪫", "🔋", "🧘", "🔥", "✈️", "🌧️", "🧠", "💤", "⚡"];

interface Props {
  categories: (CustomCategory & { missions?: Mission[] })[];
  /** Full (unfiltered) mission list for a category, as it stands right now. */
  getRawMissions: (categoryId: string) => Mission[];
  initial?: { id: string; name: string; emoji: string; description: string; categoryIds: string[] } | null;
  onSave: (input: { name: string; emoji: string; description: string; missions: Record<string, Mission[]> }) => void;
  onClose: () => void;
}

export default function SaveSchemeModal({ categories, getRawMissions, initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🎛️");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (initial?.categoryIds) return new Set(initial.categoryIds);
    // Default: every category that currently has missions to save.
    return new Set(categories.filter((c) => getRawMissions(c.id).length > 0).map((c) => c.id));
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const totalTasks = Array.from(selected).reduce((sum, id) => sum + getRawMissions(id).length, 0);

  const submit = () => {
    if (!name.trim()) return;
    const missions: Record<string, Mission[]> = {};
    for (const id of selected) {
      const list = getRawMissions(id);
      if (list.length > 0) missions[id] = list.map((m) => ({ ...m, __originalIndex: undefined }));
    }
    onSave({ name: name.trim(), emoji, description: description.trim(), missions });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-card w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{initial ? "Update scheme" : "Save as scheme"}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Snapshots the tasks of the categories you pick, so you can load them back in one click.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex flex-wrap gap-1">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`h-9 w-9 rounded-xl text-lg transition-all ${emoji === e ? "gradient-purple glow-sm" : "bg-muted/40 hover:bg-muted"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Scheme name — e.g. Low energy day"
          className="w-full h-10 text-sm bg-muted/30 border border-white/10 rounded-xl px-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          autoFocus
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="When to use it (optional)"
          className="w-full h-10 text-sm bg-muted/30 border border-white/10 rounded-xl px-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
        />

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">Categories in this scheme</p>
          <div className="space-y-1">
            {categories.map((cat) => {
              const count = getRawMissions(cat.id).length;
              const on = selected.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggle(cat.id)}
                  disabled={count === 0}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all ${
                    count === 0 ? "opacity-40 cursor-not-allowed" : on ? "bg-primary/10 border border-primary/30" : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <span className={`h-5 w-5 rounded-md border flex items-center justify-center ${on ? "gradient-purple border-transparent" : "border-muted-foreground/30"}`}>
                    {on && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                  <span className="text-base">{cat.icon || "📁"}</span>
                  <span className="text-sm text-foreground flex-1">{cat.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">{count} task{count === 1 ? "" : "s"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">{totalTasks} task{totalTasks === 1 ? "" : "s"} saved</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-xs font-bold text-muted-foreground hover:text-foreground rounded-xl transition-all">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!name.trim() || totalTasks === 0}
              className="h-9 px-4 text-xs font-bold rounded-xl gradient-purple text-primary-foreground glow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {initial ? "Update" : "Save scheme"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

