import { useState, useCallback, useEffect, useRef } from "react";
import { DEFAULT_KEYBINDS, KeybindMap, KEYBIND_LABELS } from "@/hooks/useKeyboardShortcuts";

interface KeybindsTabProps {
  customKeybinds: Partial<KeybindMap> | undefined;
  onSave: (keybinds: Partial<KeybindMap> | null) => Promise<void>;
}

function KeyCapture({ 
  bindKey, 
  currentValue, 
  label, 
  onChange, 
  allValues 
}: { 
  bindKey: string; 
  currentValue: string; 
  label: string; 
  onChange: (key: string, value: string) => void;
  allValues: KeybindMap;
}) {
  const [capturing, setCapturing] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === "Escape") { setCapturing(false); return; }

      // Check for conflicts
      const conflict = Object.entries(allValues).find(
        ([k, v]) => k !== bindKey && v.toLowerCase() === key.toLowerCase()
      );
      if (conflict) return; // silently reject conflicts

      onChange(bindKey, key);
      setCapturing(false);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, bindKey, onChange, allValues]);

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-foreground/80 flex-1">{label}</span>
      <button
        ref={ref}
        onClick={() => setCapturing(true)}
        className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold min-w-[48px] text-center transition-all ${
          capturing
            ? "border-primary bg-primary/20 text-primary animate-pulse"
            : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
        }`}
      >
        {capturing ? "..." : currentValue.toUpperCase()}
      </button>
    </div>
  );
}

export default function KeybindsTab({ customKeybinds, onSave }: KeybindsTabProps) {
  const [binds, setBinds] = useState<KeybindMap>({
    ...DEFAULT_KEYBINDS,
    ...(customKeybinds || {}),
  });
  const [dirty, setDirty] = useState(false);

  const handleChange = useCallback((key: string, value: string) => {
    setBinds(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    // Only save diffs from defaults
    const diffs: Partial<KeybindMap> = {};
    for (const [k, v] of Object.entries(binds)) {
      if (v !== DEFAULT_KEYBINDS[k as keyof KeybindMap]) {
        (diffs as any)[k] = v;
      }
    }
    await onSave(Object.keys(diffs).length > 0 ? diffs : null);
    setDirty(false);
  };

  const handleReset = async () => {
    setBinds({ ...DEFAULT_KEYBINDS });
    await onSave(null);
    setDirty(false);
  };

  const gridKeys = Object.entries(KEYBIND_LABELS).filter(([k]) => 
    ["mind", "body", "expression", "exploration", "people", "money", "spirit", "order", "projects", "resetDay"].includes(k)
  );
  const missionKeys = Object.entries(KEYBIND_LABELS).filter(([k]) => 
    ["editTasks", "aiSuggestions", "resetDefaults"].includes(k)
  );
  const globalKeys = Object.entries(KEYBIND_LABELS).filter(([k]) => 
    ["toggleShortcuts"].includes(k)
  );

  return (
    <div className="space-y-5 pb-4">
      <p className="text-xs text-muted-foreground">
        Click a key badge then press any key to rebind. Press Escape to cancel.
      </p>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Grid View</h4>
        <div className="space-y-0.5">
          {gridKeys.map(([key, label]) => (
            <KeyCapture
              key={key}
              bindKey={key}
              currentValue={binds[key as keyof KeybindMap]}
              label={label}
              onChange={handleChange}
              allValues={binds}
            />
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mission View</h4>
        <div className="space-y-0.5">
          {missionKeys.map(([key, label]) => (
            <KeyCapture
              key={key}
              bindKey={key}
              currentValue={binds[key as keyof KeybindMap]}
              label={label}
              onChange={handleChange}
              allValues={binds}
            />
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Global</h4>
        <div className="space-y-0.5">
          {globalKeys.map(([key, label]) => (
            <KeyCapture
              key={key}
              bindKey={key}
              currentValue={binds[key as keyof KeybindMap]}
              label={label}
              onChange={handleChange}
              allValues={binds}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="flex-1 py-2.5 rounded-xl text-sm font-bold gradient-purple text-primary-foreground glow-sm transition-all disabled:opacity-40"
        >
          Save Keybinds
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all border border-white/10"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
