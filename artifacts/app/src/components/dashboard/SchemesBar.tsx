import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Plus, Undo2, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Mission, CATEGORIES } from "@/lib/dashboard-data";
import { useSchemes, Scheme } from "@/hooks/useSchemes";
import { CustomCategory } from "@/hooks/useUserSettings";
import SaveSchemeModal from "./SaveSchemeModal";

interface Props {
  categories: CustomCategory[];
  customMissions: Record<string, Mission[]>;
  /** Replaces today's missions; returns the set that was replaced, for undo. */
  onApply: (missions: Record<string, Mission[]>) => Record<string, Mission[]>;
}

export default function SchemesBar({ categories, customMissions, onApply }: Props) {
  const { schemes, createScheme, updateScheme, deleteScheme, markUsed } = useSchemes();
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Scheme | null>(null);
  const [undoState, setUndoState] = useState<{ missions: Record<string, Mission[]>; name: string } | null>(null);
  const [manage, setManage] = useState(false);

  const getRawMissions = (categoryId: string): Mission[] =>
    customMissions[categoryId] || CATEGORIES.find((c) => c.id === categoryId)?.missions || [];

  const load = (scheme: Scheme) => {
    const previous = onApply(scheme.missions || {});
    setUndoState({ missions: previous, name: scheme.name });
    markUsed(scheme.id);
    const count = Object.values(scheme.missions || {}).reduce((n, list) => n + list.length, 0);
    toast.success(`Loaded "${scheme.name}"`, { description: `${count} task${count === 1 ? "" : "s"} are now today's missions.` });
  };

  const undo = () => {
    if (!undoState) return;
    onApply(undoState.missions);
    toast.success("Reverted", { description: `Back to the missions you had before "${undoState.name}".` });
    setUndoState(null);
  };

  return (
    <div className="max-w-5xl mx-auto mb-4">
      <div className="glass-card px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground pr-1">
            <Bookmark className="h-3.5 w-3.5" /> Schemes
          </span>

          {schemes.length === 0 && (
            <span className="text-xs text-muted-foreground/70">
              Save today's task set and load it back on days that look the same.
            </span>
          )}

          {schemes.map((scheme) => {
            const count = Object.values(scheme.missions || {}).reduce((n, list) => n + list.length, 0);
            return (
              <div key={scheme.id} className="flex items-center">
                <button
                  onClick={() => load(scheme)}
                  title={scheme.description || `Load ${scheme.name} (${count} tasks)`}
                  className="flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-xl text-xs font-bold bg-muted/40 hover:bg-primary/15 text-foreground border border-white/10 hover:border-primary/40 transition-all"
                >
                  <span className="text-sm">{scheme.emoji}</span>
                  {scheme.name}
                  <span className="text-[10px] text-muted-foreground font-mono">{count}</span>
                </button>
                {manage && (
                  <div className="flex items-center ml-1">
                    <button
                      onClick={() => setEditing(scheme)}
                      title="Overwrite with today's tasks"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-white/5 transition-all"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteScheme(scheme.id)}
                      title="Delete scheme"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-white/5 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex-1" />

          <AnimatePresence>
            {undoState && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={undo}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
              >
                <Undo2 className="h-3.5 w-3.5" /> Undo load
              </motion.button>
            )}
          </AnimatePresence>

          {schemes.length > 0 && (
            <button
              onClick={() => setManage((m) => !m)}
              className={`h-8 px-3 rounded-xl text-xs font-bold transition-all ${manage ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
            >
              {manage ? "Done" : "Manage"}
            </button>
          )}

          <button
            onClick={() => setSaving(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Save current
          </button>
        </div>
      </div>

      <AnimatePresence>
        {saving && (
          <SaveSchemeModal
            categories={categories}
            getRawMissions={getRawMissions}
            onSave={async (input) => {
              await createScheme(input);
              setSaving(false);
              toast.success(`Scheme "${input.name}" saved`);
            }}
            onClose={() => setSaving(false)}
          />
        )}
        {editing && (
          <SaveSchemeModal
            categories={categories}
            getRawMissions={getRawMissions}
            initial={{
              id: editing.id,
              name: editing.name,
              emoji: editing.emoji,
              description: editing.description,
              categoryIds: Object.keys(editing.missions || {}),
            }}
            onSave={async (input) => {
              await updateScheme(editing.id, input);
              setEditing(null);
              toast.success(`Scheme "${input.name}" updated`);
            }}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
