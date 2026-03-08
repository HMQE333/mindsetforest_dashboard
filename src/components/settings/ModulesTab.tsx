import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export interface ModuleConfig {
  id: string;
  label: string;
  icon: string;
  description: string;
  alwaysOn?: boolean;
}

const ALL_MODULES: ModuleConfig[] = [
  { id: "dashboard", label: "Home", icon: "🎮", description: "Main mission dashboard with XP & levels", alwaysOn: true },
  { id: "tracker", label: "Stats Tracker", icon: "📊", description: "Track daily metrics and habits" },
  { id: "ladder", label: "Mastery Ladder", icon: "🪜", description: "6-level progression system per category" },
  { id: "habitloop", label: "Habit Loop", icon: "🔄", description: "Repetition-based habit building" },
  { id: "oracle", label: "Oracle & Rewards", icon: "🔮", description: "Sacrifice XP for real-life rewards" },
  { id: "archive", label: "Knowledge Archive", icon: "📦", description: "Store and organize knowledge blocks" },
];

interface ModulesTabProps {
  enabledModules: string[];
  onSave: (modules: string[]) => Promise<void>;
}

export default function ModulesTab({ enabledModules, onSave }: ModulesTabProps) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (enabledModules.length > 0) {
      setEnabled(new Set(enabledModules));
    } else {
      // Default: all enabled
      setEnabled(new Set(ALL_MODULES.map(m => m.id)));
    }
  }, [enabledModules]);

  const toggle = (id: string) => {
    const mod = ALL_MODULES.find(m => m.id === id);
    if (mod?.alwaysOn) return;
    setEnabled(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    await onSave(Array.from(enabled));
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground mb-2">Choose which modules appear in your navigation. Home is always visible.</p>

      <div className="space-y-2">
        {ALL_MODULES.map((mod, i) => {
          const isOn = enabled.has(mod.id);
          return (
            <motion.button
              key={mod.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => toggle(mod.id)}
              disabled={mod.alwaysOn}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                isOn
                  ? "glass-card border-primary/30 bg-primary/5"
                  : "border-white/5 bg-muted/20 opacity-50"
              } ${mod.alwaysOn ? "cursor-default" : "cursor-pointer hover:border-white/20"}`}
            >
              <span className="text-2xl">{mod.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground">{mod.label}</div>
                <div className="text-xs text-muted-foreground truncate">{mod.description}</div>
              </div>
              <div className={`w-10 h-6 rounded-full flex items-center transition-all px-0.5 ${
                isOn ? "bg-primary justify-end" : "bg-muted/50 justify-start"
              }`}>
                <motion.div
                  layout
                  className="w-5 h-5 rounded-full bg-white shadow-sm"
                />
              </div>
            </motion.button>
          );
        })}
      </div>

      {dirty && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          Save Modules
        </motion.button>
      )}
    </div>
  );
}
