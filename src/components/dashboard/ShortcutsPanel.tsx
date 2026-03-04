import { motion } from "framer-motion";

interface ShortcutsPanelProps {
  context: "grid" | "projects" | "mission";
  onClose: () => void;
}

interface ShortcutEntry {
  key: string;
  label: string;
}

const GRID_SHORTCUTS: ShortcutEntry[] = [
  { key: "M", label: "Mind" },
  { key: "B", label: "Body" },
  { key: "C", label: "Creation" },
  { key: "X", label: "Exploration" },
  { key: "N", label: "Networking" },
  { key: "T", label: "Trading" },
  { key: "S", label: "Spirit" },
  { key: "O", label: "Order" },
  { key: "P", label: "Projects" },
  { key: "R", label: "Reset Day" },
];

const MISSION_SHORTCUTS: ShortcutEntry[] = [
  { key: "1-9", label: "Complete mission" },
  { key: "E", label: "Edit tasks" },
  { key: "A", label: "AI suggestions" },
  { key: "D", label: "Reset defaults" },
  { key: "Esc", label: "Back" },
];

const PROJECT_SHORTCUTS: ShortcutEntry[] = [
  { key: "1-9", label: "Select project" },
  { key: "Esc", label: "Back to grid" },
];

const GLOBAL_SHORTCUTS: ShortcutEntry[] = [
  { key: "?", label: "Toggle this panel" },
];

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

export default function ShortcutsPanel({ context, onClose }: ShortcutsPanelProps) {
  const contextShortcuts = context === "grid" ? GRID_SHORTCUTS : context === "projects" ? PROJECT_SHORTCUTS : MISSION_SHORTCUTS;
  const contextTitle = context === "grid" ? "Category Grid" : context === "projects" ? "Projects List" : "Mission View";

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
        <ShortcutGroup title="Global" shortcuts={GLOBAL_SHORTCUTS} />
      </motion.div>
    </motion.div>
  );
}
