import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";
import type { FocusPulseStyle, CompletionEffect } from "@/hooks/useUserSettings";

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
  { id: "finance", label: "Finance", icon: "💰", description: "Track income, expenses, subscriptions & loans" },
  { id: "breathing", label: "Breathing", icon: "🌬️", description: "Guided breathing exercises with the Vessel of Air" },
  { id: "calendar", label: "Calendar", icon: "📅", description: "Monthly calendar with events, tags & filters" },
  { id: "planning", label: "Planning", icon: "🧠", description: "Mind-board with project maps, task decomposition & actions" },
  { id: "monthly-focus", label: "Monthly Focus", icon: "🎯", description: "Monthly theme reminders on dashboard" },
];

const PULSE_OPTIONS: { value: FocusPulseStyle; label: string; desc: string }[] = [
  { value: "glow", label: "✨ Soft Glow", desc: "Gentle box-shadow pulse" },
  { value: "ping", label: "📡 Ping", desc: "Expanding ring effect" },
  { value: "none", label: "🚫 None", desc: "No animation" },
];

const COMPLETION_EFFECT_OPTIONS: { value: CompletionEffect; label: string; desc: string }[] = [
  { value: "burst", label: "✨ Burst", desc: "Particle explosion" },
  { value: "banner", label: "🏆 Banner", desc: "Sliding badge" },
  { value: "fireworks", label: "🎆 Fireworks", desc: "Confetti clusters" },
  { value: "none", label: "🚫 None", desc: "No animation" },
];

interface ModulesTabProps {
  enabledModules: string[];
  moduleOrder?: string[];
  onSave: (modules: string[], order: string[]) => Promise<void>;
  focusPulseStyle?: FocusPulseStyle;
  onSavePulseStyle?: (style: FocusPulseStyle) => void;
  completionEffect?: CompletionEffect;
  onSaveCompletionEffect?: (effect: CompletionEffect) => void;
  showCompletionBadge?: boolean;
  onSaveCompletionBadge?: (val: boolean) => void;
}

function getOrderedModules(order?: string[]): ModuleConfig[] {
  if (!order || order.length === 0) return ALL_MODULES;
  const byId = new Map(ALL_MODULES.map(m => [m.id, m]));
  const ordered: ModuleConfig[] = [];
  for (const id of order) {
    const mod = byId.get(id);
    if (mod) { ordered.push(mod); byId.delete(id); }
  }
  // Append any new modules not in order
  byId.forEach(mod => ordered.push(mod));
  return ordered;
}

export default function ModulesTab({ enabledModules, moduleOrder, onSave, focusPulseStyle = "glow", onSavePulseStyle, completionEffect = "burst", onSaveCompletionEffect, showCompletionBadge = true, onSaveCompletionBadge }: ModulesTabProps) {
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [orderedModules, setOrderedModules] = useState<ModuleConfig[]>(() => getOrderedModules(moduleOrder));
  const [dirty, setDirty] = useState(false);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  useEffect(() => {
    if (enabledModules.length > 0) {
      setEnabled(new Set(enabledModules));
    } else {
      setEnabled(new Set(ALL_MODULES.map(m => m.id)));
    }
  }, [enabledModules]);

  useEffect(() => {
    setOrderedModules(getOrderedModules(moduleOrder));
  }, [moduleOrder]);

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

  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
  };

  const handleDragEnter = (idx: number) => {
    dragOver.current = idx;
  };

  const handleDrop = (dropIdx: number) => {
    const fromIdx = dragItem.current;
    if (fromIdx === null || fromIdx === dropIdx) return;
    setOrderedModules(prev => {
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(dropIdx, 0, removed);
      return next;
    });
    setDirty(true);
  };

  const handleDragEnd = () => {
    dragItem.current = null;
    dragOver.current = null;
    setDragOverIdx(null);
  };

  // Touch drag support
  const touchStartY = useRef<number>(0);
  const touchIdx = useRef<number | null>(null);

  const handleTouchStart = (idx: number, e: React.TouchEvent) => {
    touchIdx.current = idx;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchIdx.current === null) return;
    const endY = e.changedTouches[0].clientY;
    const diff = endY - touchStartY.current;
    const threshold = 40;
    if (Math.abs(diff) > threshold) {
      const direction = diff > 0 ? 1 : -1;
      const fromIdx = touchIdx.current;
      const toIdx = Math.max(0, Math.min(orderedModules.length - 1, fromIdx + direction));
      if (fromIdx !== toIdx) {
        setOrderedModules(prev => {
          const next = [...prev];
          const [removed] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, removed);
          return next;
        });
        setDirty(true);
      }
    }
    touchIdx.current = null;
  };

  const handleSave = async () => {
    const order = orderedModules.map(m => m.id);
    await onSave(Array.from(enabled), order);
    setDirty(false);
    
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground mb-2">Drag to reorder · toggle to show/hide modules.</p>

      <div className="space-y-1">
        {orderedModules.map((mod, i) => {
          const isOn = enabled.has(mod.id);
          const isDraggedOver = dragOverIdx === i;
          return (
            <div
              key={mod.id}
              draggable
              onDragStart={(e) => {
                dragItem.current = i;
                e.dataTransfer.effectAllowed = "move";
                // Make ghost semi-transparent
                if (e.currentTarget instanceof HTMLElement) {
                  e.currentTarget.style.opacity = "0.5";
                }
              }}
              onDragEnd={(e) => {
                if (e.currentTarget instanceof HTMLElement) {
                  e.currentTarget.style.opacity = "1";
                }
                handleDragEnd();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
                  dragOver.current = i;
                  setDragOverIdx(i);
                }
              }}
              onDragOver={e => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(i);
                setDragOverIdx(null);
              }}
              onTouchStart={e => handleTouchStart(i, e)}
              onTouchEnd={handleTouchEnd}
              className={`w-full flex items-center gap-2 p-3 rounded-xl border transition-all ${
                isOn
                  ? "glass-card border-primary/30 bg-primary/5"
                  : "border-white/5 bg-muted/20 opacity-50"
              } ${isDraggedOver ? "border-primary/60 bg-primary/10 scale-[1.02]" : ""}`}
            >
              {/* Drag handle */}
              <div className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors touch-none">
                <GripVertical className="h-4 w-4" />
              </div>

              {/* Content — clickable to toggle */}
              <button
                onClick={() => toggle(mod.id)}
                disabled={mod.alwaysOn}
                className={`flex-1 flex items-center gap-3 text-left ${mod.alwaysOn ? "cursor-default" : "cursor-pointer"}`}
              >
                <span className="text-2xl">{mod.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground">{mod.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{mod.description}</div>
                </div>
              </button>

              {/* Toggle */}
              <button
                onClick={() => toggle(mod.id)}
                disabled={mod.alwaysOn}
                className={mod.alwaysOn ? "cursor-default" : "cursor-pointer"}
              >
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
              </button>
            </div>
          );
        })}
      </div>

      {/* Focus Pulse Style picker */}
      {enabled.has("monthly-focus") && (
        <div className="mt-4 p-3 rounded-xl border border-border bg-muted/10 space-y-2">
          <div className="text-xs font-semibold text-foreground">🎯 Focus Reminder Effect</div>
          <div className="flex gap-2">
            {PULSE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSavePulseStyle?.(opt.value)}
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

      {/* Mission Complete Effect picker */}
      <div className="mt-4 p-3 rounded-xl border border-border bg-muted/10 space-y-2">
        <div className="text-xs font-semibold text-foreground">🎉 Mission Complete Effect</div>
        <div className="grid grid-cols-2 gap-2">
          {COMPLETION_EFFECT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSaveCompletionEffect?.(opt.value)}
              className={`p-2 rounded-lg border text-center transition-all text-xs ${
                completionEffect === opt.value
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

      {/* Completion Badge Toggle */}
      <div className="mt-4 p-3 rounded-xl border border-border bg-muted/10">
        <button
          onClick={() => onSaveCompletionBadge?.(!showCompletionBadge)}
          className="w-full flex items-center gap-3 text-left"
        >
          <span className="text-xl">✅</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground">Show completion badge on cards</div>
            <div className="text-xs text-muted-foreground">Display a ✓ checkmark when all missions in a section are done</div>
          </div>
          <div className={`w-11 h-6 rounded-full flex items-center transition-all px-0.5 shrink-0 ${
            showCompletionBadge ? "bg-primary justify-end" : "bg-muted/50 justify-start"
          }`}>
            <motion.div layout className={`w-5 h-5 rounded-full shadow-sm flex items-center justify-center ${showCompletionBadge ? "bg-white" : "bg-white/80"}`}>
              <span className={`block w-2 h-2 rounded-full transition-colors ${showCompletionBadge ? "bg-primary" : "bg-muted-foreground/40"}`} />
            </motion.div>
          </div>
        </button>
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
