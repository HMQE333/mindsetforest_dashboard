import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CATEGORIES } from "@/lib/dashboard-data";
import { CustomCategory } from "@/hooks/useUserSettings";

const COLOR_PRESETS = [
  { color: "#8B5CF6", lightColor: "#A78BFA", label: "Purple" },
  { color: "#EF4444", lightColor: "#F87171", label: "Red" },
  { color: "#F97316", lightColor: "#FB923C", label: "Orange" },
  { color: "#06B6D4", lightColor: "#22D3EE", label: "Cyan" },
  { color: "#FBBF24", lightColor: "#FCD34D", label: "Gold" },
  { color: "#6366F1", lightColor: "#818CF8", label: "Indigo" },
  { color: "#D946EF", lightColor: "#E879F9", label: "Pink" },
  { color: "#A1A1AA", lightColor: "#D4D4D8", label: "Gray" },
  { color: "#10B981", lightColor: "#34D399", label: "Green" },
  { color: "#EC4899", lightColor: "#F472B6", label: "Rose" },
];

interface CategoriesTabProps {
  customCategories: CustomCategory[];
  onSave: (cats: CustomCategory[]) => Promise<void>;
}

export default function CategoriesTab({ customCategories, onSave }: CategoriesTabProps) {
  const [editing, setEditing] = useState<CustomCategory[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Merge defaults with customs
    const merged = CATEGORIES.map(cat => {
      const custom = customCategories.find(c => c.id === cat.id);
      return {
        id: cat.id,
        name: custom?.name || cat.name,
        tagline: custom?.tagline || cat.tagline,
        icon: custom?.icon || cat.icon,
        color: custom?.color || cat.color,
        lightColor: custom?.lightColor || cat.lightColor,
      };
    });
    setEditing(merged);
  }, [customCategories]);

  const update = (id: string, field: keyof CustomCategory, value: string) => {
    setEditing(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    setDirty(true);
  };

  const updateColor = (id: string, color: string, lightColor: string) => {
    setEditing(prev => prev.map(c => c.id === id ? { ...c, color, lightColor } : c));
    setDirty(true);
  };

  const handleSave = async () => {
    await onSave(editing);
    setDirty(false);
  };

  const handleReset = () => {
    setEditing(CATEGORIES.map(cat => ({
      id: cat.id,
      name: cat.name,
      tagline: cat.tagline,
      icon: cat.icon,
      color: cat.color,
      lightColor: cat.lightColor,
    })));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-muted-foreground">Customize your life pillars</p>
        <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Reset to defaults
        </button>
      </div>

      <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
        {editing.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass-card p-3 space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                value={cat.icon}
                onChange={e => update(cat.id, "icon", e.target.value)}
                className="w-10 h-10 text-center text-xl bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-primary/50"
                maxLength={4}
              />
              <div className="flex-1 space-y-1">
                <input
                  value={cat.name}
                  onChange={e => update(cat.id, "name", e.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  maxLength={30}
                  placeholder="Name"
                />
                <input
                  value={cat.tagline}
                  onChange={e => update(cat.id, "tagline", e.target.value)}
                  className="w-full bg-transparent text-xs text-muted-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  maxLength={50}
                  placeholder="Tagline"
                />
              </div>
            </div>
            {/* Color picker */}
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map(cp => (
                <button
                  key={cp.color}
                  onClick={() => updateColor(cat.id, cp.color, cp.lightColor)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    cat.color === cp.color ? "border-foreground scale-125" : "border-transparent"
                  }`}
                  style={{ backgroundColor: cp.color }}
                  title={cp.label}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {dirty && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          Save Categories
        </motion.button>
      )}
    </div>
  );
}
