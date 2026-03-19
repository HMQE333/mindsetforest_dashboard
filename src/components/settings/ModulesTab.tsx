import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { FocusPulseStyle } from "@/hooks/useUserSettings";

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
  { id: "projects", label: "Projects", icon: "📂", description: "Custom project scopes for focused work" },
  { id: "library", label: "Library", icon: "📚", description: "Reading list with notes, ratings & AI suggestions" },
  { id: "cooking", label: "Cooking Studio", icon: "🍳", description: "Recipe journal, AI processor & meal planner" },
  { id: "monthly-focus", label: "Monthly Focus", icon: "🎯", description: "Monthly theme reminders on dashboard" },
];

const PULSE_OPTIONS: { value: FocusPulseStyle; label: string; desc: string }[] = [
  { value: "glow", label: "✨ Soft Glow", desc: "Gentle box-shadow pulse" },
  { value: "ping", label: "📡 Ping", desc: "Expanding ring effect" },
  { value: "none", label: "🚫 None", desc: "No animation" },
];

interface ModulesTabProps {
  enabledModules: string[];
  onSave: (modules: string[]) => Promise<void>;
  focusPulseStyle?: FocusPulseStyle;
  onSavePulseStyle?: (style: FocusPulseStyle) => void;
}

export default function ModulesTab({ enabledModules, onSave, focusPulseStyle = "glow", onSavePulseStyle }: ModulesTabProps) {
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
    window.location.reload();
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
              <div className={`w-11 h-6 rounded-full flex items-center transition-all px-0.5 ${
                isOn ? "bg-primary justify-end" : "bg-muted/50 justify-start"
              }`}>
                <motion.div
                  layout
                  className={`w-5 h-5 rounded-full shadow-sm flex items-center justify-center ${
                    isOn ? "bg-white" : "bg-white/80"
                  }`}
                >
                  <span className={`block w-2 h-2 rounded-full transition-colors ${
                    isOn ? "bg-primary" : "bg-muted-foreground/40"
                  }`} />
                </motion.div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Focus Pulse Style picker — only if monthly-focus is enabled */}
      {enabled.has("monthly-focus") && (
        <div className="mt-4 p-3 rounded-xl border border-border bg-muted/10 space-y-2">
          <div className="text-xs font-semibold text-foreground">🎯 Focus Reminder Effect</div>
          <div className="flex gap-2">
            {PULSE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => {
                  onSavePulseStyle?.(opt.value);
                }}
                className={`flex-1 p-2 rounded-lg border text-center transition-all text-xs ${
                  focusPulseStyle === opt.value
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-muted/20 text-muted-foreground hover:border-white/20"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

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
