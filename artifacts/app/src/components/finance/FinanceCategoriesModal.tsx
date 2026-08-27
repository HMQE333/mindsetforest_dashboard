import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, GripVertical } from "lucide-react";
import { useFinanceCategories, CategoryKind, FinanceCategory } from "@/hooks/useFinanceCategories";

interface Props {
  open: boolean;
  onClose: () => void;
  initialKind?: CategoryKind;
}

const PALETTE = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#10B981",
  "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6",
  "#A855F7", "#EC4899", "#78716C", "#9CA3AF", "#6B7280",
];

function CategoryRow({ cat, onUpdate, onDelete, onDragStart, onDragOver, onDrop }: {
  cat: FinanceCategory;
  onUpdate: (patch: Partial<FinanceCategory>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const [showColors, setShowColors] = useState(false);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDrop={onDrop}
      className="flex items-center gap-2 p-2 rounded-xl bg-muted/30 border border-border hover:border-white/10 transition-all"
    >
      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
      <input
        value={cat.icon}
        onChange={e => onUpdate({ icon: e.target.value.slice(0, 4) || "🔣" })}
        className="w-10 h-9 text-center rounded-lg bg-background border border-border text-base focus:outline-none focus:border-primary/50"
      />
      <input
        value={cat.name}
        onChange={e => onUpdate({ name: e.target.value })}
        className="flex-1 h-9 px-2 rounded-lg bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
      />
      <div className="relative">
        <button
          onClick={() => setShowColors(s => !s)}
          className="w-9 h-9 rounded-lg border border-border shrink-0"
          style={{ background: cat.color }}
          aria-label="Pick color"
        />
        {showColors && (
          <div className="absolute right-0 top-10 z-10 p-2 rounded-xl glass-card border border-border grid grid-cols-5 gap-1.5 shadow-xl">
            {PALETTE.map(c => (
              <button
                key={c}
                onClick={() => { onUpdate({ color: c }); setShowColors(false); }}
                className="w-6 h-6 rounded-md border border-border hover:scale-110 transition-transform"
                style={{ background: c }}
              />
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onDelete}
        className="p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function FinanceCategoriesModal({ open, onClose, initialKind = "expense" }: Props) {
  const { expenseCategories, incomeCategories, addCategory, updateCategory, deleteCategory, reorderCategories } = useFinanceCategories();
  const [tab, setTab] = useState<CategoryKind>(initialKind);
  const [dragId, setDragId] = useState<string | null>(null);

  const list = tab === "expense" ? expenseCategories : incomeCategories;

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = list.map(c => c.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderCategories(tab, ids);
    setDragId(null);
  };

  const handleAdd = () => {
    const baseName = tab === "expense" ? "New expense" : "New income";
    let name = baseName;
    let i = 1;
    while (list.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      i++;
      name = `${baseName} ${i}`;
    }
    addCategory(tab, name, "🔣", "#8B5CF6");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg glass-card rounded-2xl border border-border p-5 space-y-4 max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-foreground">Manage Categories</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/30 border border-border w-fit shrink-0">
              {(["expense", "income"] as CategoryKind[]).map(k => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                    tab === k ? "gradient-purple text-primary-foreground glow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "expense" ? "💸" : "💰"} {k}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {list.map(cat => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  onUpdate={(patch) => updateCategory(cat.id, patch)}
                  onDelete={() => deleteCategory(cat.id)}
                  onDragStart={() => setDragId(cat.id)}
                  onDragOver={() => {}}
                  onDrop={() => handleDrop(cat.id)}
                />
              ))}
              {list.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No categories yet</p>
              )}
            </div>

            <button
              onClick={handleAdd}
              className="w-full py-2.5 rounded-xl bg-muted/30 border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 text-sm font-semibold text-foreground transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" /> Add category
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
