import { motion } from "framer-motion";
import { getKeybinds, KeybindMap, KEYBIND_LABELS } from "@/hooks/useKeyboardShortcuts";

interface ShortcutsPanelProps {
  context: "grid" | "projects" | "mission";
  onClose: () => void;
  customKeybinds?: Partial<KeybindMap>;
}

interface ShortcutEntry {
  key: string;
  label: string;
}

function buildShortcuts(binds: KeybindMap, context: "grid" | "projects" | "mission") {
  if (context === "grid") {
    return [
      { key: binds.mind.toUpperCase(), label: "Mind" },
      { key: binds.body.toUpperCase(), label: "Body" },
      { key: binds.creation.toUpperCase(), label: "Creation" },
      { key: binds.exploration.toUpperCase(), label: "Exploration" },
      { key: binds.networking.toUpperCase(), label: "Networking" },
      { key: binds.trading.toUpperCase(), label: "Trading" },
      { key: binds.spirit.toUpperCase(), label: "Spirit" },
      { key: binds.order.toUpperCase(), label: "Order" },
      { key: binds.projects.toUpperCase(), label: "Projects" },
      { key: binds.resetDay.toUpperCase(), label: "Reset Day" },
    ];
  }
  if (context === "projects") {
    return [
      { key: "1-9", label: "Select project" },
      { key: "Esc", label: "Back to grid" },
    ];
  }
  return [
    { key: "1-9", label: "Complete mission" },
    { key: binds.editTasks.toUpperCase(), label: "Edit tasks" },
    { key: binds.aiSuggestions.toUpperCase(), label: "AI suggestions" },
    { key: binds.resetDefaults.toUpperCase(), label: "Reset defaults" },
    { key: "Esc", label: "Back" },
  ];
}

function ShortcutGroup({ title, shortcuts }: { title: string; shortcuts: ShortcutEntry[] }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1.5">
        {shortcuts.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3">
            <kbd className="px-2 py-1 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-mono font-bold min-w-[32px] text-center">
              {s.key}
            </kbd>
            <span className="text-sm text-foreground/80 flex-1">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShortcutsPanel({ context, onClose, customKeybinds }: ShortcutsPanelProps) {
  const binds = getKeybinds(customKeybinds);
  const contextShortcuts = buildShortcuts(binds, context);
  const contextTitle = context === "grid" ? "Category Grid" : context === "projects" ? "Projects List" : "Mission View";

  const globalShortcuts = [
    { key: binds.toggleShortcuts.toUpperCase(), label: "Toggle this panel" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card p-6 w-full max-w-sm mx-4 border-2 border-primary/30"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            ⌨️ Keyboard Shortcuts
          </h3>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground transition-colors text-sm">
            ✕
          </button>
        </div>

        <ShortcutGroup title={`Current: ${contextTitle}`} shortcuts={contextShortcuts} />
        <ShortcutGroup title="Global" shortcuts={globalShortcuts} />
      </motion.div>
    </motion.div>
  );
}
