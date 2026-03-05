import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CATEGORIES, Mission } from "@/lib/dashboard-data";

interface EditMissionsModalProps {
  categoryId: string;
  missions: Mission[];
  onSave: (categoryId: string, missions: Mission[]) => void;
  onClose: () => void;
}

export default function EditMissionsModal({ categoryId, missions, onSave, onClose }: EditMissionsModalProps) {
  const [buffer, setBuffer] = useState<Mission[]>([]);
  const category = CATEGORIES.find(c => c.id === categoryId);

  useEffect(() => {
    setBuffer(missions.map(m => ({ ...m, persistent: m.persistent !== false ? true : false })));
  }, [missions]);

  const updateField = (index: number, field: keyof Mission, value: string | number) => {
    setBuffer(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const deleteRow = (index: number) => {
    setBuffer(prev => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setBuffer(prev => [...prev, { title: "", description: "", duration: "", xp: 10, persistent: false }]);
  };

  const togglePersistent = (index: number) => {
    setBuffer(prev => prev.map((m, i) => i === index ? { ...m, persistent: !m.persistent } : m));
  };

  const handleSave = () => {
    const cleaned = buffer
      .map(m => ({ ...m, title: m.title.trim(), description: m.description.trim(), duration: m.duration.trim() || "—", xp: Number(m.xp) || 10, persistent: !!m.persistent }))
      .filter(m => m.title.length > 0);
    onSave(categoryId, cleaned);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(circle at top, rgba(129,140,248,0.18), transparent 55%), radial-gradient(circle at bottom, rgba(236,72,153,0.18), transparent 55%), rgba(3,7,18,0.92)",
        backdropFilter: "blur(10px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 8 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[960px] max-h-[86vh] flex flex-col gap-4 p-5 rounded-3xl border border-white/15"
        style={{
          background: "radial-gradient(circle at top left, rgba(129,140,248,0.16), transparent 55%), radial-gradient(circle at bottom right, rgba(236,72,153,0.16), transparent 55%), #020617",
          boxShadow: "0 32px 80px rgba(15,23,42,0.95)",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-1 border-b border-white/15">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-xl"
              style={{ background: "radial-gradient(circle at 30% 30%, #fef3c7, #f97316)" }}>
              ✏️
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Edit Tasks — {category?.name}</h2>
              <p className="text-xs text-foreground/60">Add, rename or remove missions. Changes are saved to your account.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-foreground/80 hover:bg-primary/30 transition-colors flex items-center justify-center">
            ✕
          </button>
        </div>

        {/* Mission List */}
        <div className="flex-1 overflow-y-auto space-y-3 py-2">
          {buffer.length === 0 && (
            <p className="text-sm text-foreground/50 text-center py-5">No missions yet. Click "Add task" below.</p>
          )}
          {buffer.map((mission, index) => (
            <div key={index} className="grid grid-cols-[2.3fr_1.2fr] gap-3 p-3 rounded-2xl border border-primary/40"
              style={{ background: "radial-gradient(circle at top, rgba(129,140,248,0.18), transparent 60%), rgba(15,23,42,0.95)" }}>
              <div className="flex flex-col gap-1">
                <input
                  className="w-full rounded-full border border-white/20 bg-background/80 text-foreground px-3 py-2 text-sm outline-none focus:border-primary/90 focus:ring-1 focus:ring-primary/70"
                  placeholder="Task title"
                  value={mission.title}
                  onChange={e => updateField(index, "title", e.target.value)}
                />
                <textarea
                  className="w-full rounded-xl border border-white/20 bg-background/80 text-foreground px-3 py-2 text-sm outline-none focus:border-primary/90 resize-none min-h-[48px]"
                  placeholder="Description"
                  value={mission.description}
                  onChange={e => updateField(index, "description", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1.3fr_0.8fr_auto] gap-2 items-center">
                  <input
                    className="w-full rounded-full border border-white/20 bg-background/80 text-foreground px-3 py-2 text-sm outline-none"
                    placeholder="Duration"
                    value={mission.duration}
                    onChange={e => updateField(index, "duration", e.target.value)}
                  />
                  <input
                    type="number"
                    className="w-full max-w-[80px] rounded-full border border-white/20 bg-background/80 text-foreground px-3 py-2 text-sm text-center outline-none"
                    value={mission.xp}
                    min={1}
                    max={500}
                    onChange={e => updateField(index, "xp", Number(e.target.value) || 0)}
                  />
                  <button
                    onClick={() => deleteRow(index)}
                    className="px-2 py-1.5 rounded-full border border-destructive/80 bg-destructive/20 text-destructive-foreground text-sm hover:bg-destructive/40 transition-colors"
                  >
                    🗑
                  </button>
                </div>
                <button
                  onClick={() => togglePersistent(index)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    mission.persistent
                      ? "border-primary/60 bg-primary/20 text-primary"
                      : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
                  }`}
                >
                  {mission.persistent ? "🔒 Stays after reset" : "🔄 Resets daily"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 pt-2 border-t border-primary/30">
          <button onClick={addRow} className="px-4 py-2 rounded-full border border-white/20 bg-background/80 text-foreground text-sm hover:bg-primary/20 transition-colors">
            ＋ Add task
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-white/20 bg-background/80 text-foreground text-sm hover:bg-primary/20 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-full border border-primary gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all"
          >
            Save changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
