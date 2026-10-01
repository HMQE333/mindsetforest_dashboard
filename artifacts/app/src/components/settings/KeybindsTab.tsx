import { useState, useCallback, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { DEFAULT_KEYBINDS, KeybindMap, KEYBIND_LABELS } from "@/hooks/useKeyboardShortcuts";
import {
  comboFromEvent, formatHotkey, hotkeyDiffs, hotkeyProblem, resolveHotkeys,
  HOTKEY_ACTIONS, type HotkeyId, type HotkeyMap, type HotkeyScope,
} from "@/lib/hotkeys";

interface KeybindsTabProps {
  customKeybinds: Partial<KeybindMap> | undefined;
  customHotkeys: Partial<HotkeyMap> | undefined;
  onSave: (keybinds: Partial<KeybindMap> | null, hotkeys: Partial<HotkeyMap> | null) => Promise<void>;
}

/** Records a combination with a modifier; refuses the ones that would break typing or clash. */
function ComboCapture({ id, label, value, map, onChange }: {
  id: HotkeyId;
  label: string;
  value: string;
  map: HotkeyMap;
  onChange: (id: HotkeyId, combo: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const bare = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      if (e.code === "Escape") { setCapturing(false); setProblem(null); return; }
      if (bare && (e.code === "Backspace" || e.code === "Delete")) {
        onChange(id, "");
        setCapturing(false);
        setProblem(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // only modifiers so far
      const why = hotkeyProblem(id, combo, map);
      if (why) { setProblem(`${formatHotkey(combo)}: ${why}`); return; }
      onChange(id, combo);
      setCapturing(false);
      setProblem(null);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, id, map, onChange]);

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground/80 flex-1">{label}</span>
        <button
          onClick={() => { setCapturing((c) => !c); setProblem(null); }}
          className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold min-w-[96px] text-center transition-all ${
            capturing
              ? "border-primary bg-primary/20 text-primary animate-pulse"
              : value
                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
          }`}
          aria-label={`Change the shortcut for ${label}`}
        >
          {capturing ? "Press keys..." : formatHotkey(value)}
        </button>
        <button
          onClick={() => { onChange(id, ""); setCapturing(false); setProblem(null); }}
          disabled={!value}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground disabled:opacity-0"
          title="Clear"
          aria-label={`Clear the shortcut for ${label}`}
        >
          <X size={12} />
        </button>
      </div>
      {problem && <p className="text-[11px] text-destructive mt-1">{problem}</p>}
    </div>
  );
}

const SCOPE_SECTIONS: { scope: HotkeyScope; title: string; note?: string }[] = [
  { scope: "app", title: "Anywhere in the app" },
  { scope: "field", title: "Archive inbox and Quick Capture" },
  {
    scope: "tracker",
    title: "On your PC (desktop tracker)",
    note: "Works in every program while the tracker runs; a change reaches it within a minute.",
  },
];

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

export default function KeybindsTab({ customKeybinds, customHotkeys, onSave }: KeybindsTabProps) {
  const [binds, setBinds] = useState<KeybindMap>({
    ...DEFAULT_KEYBINDS,
    ...(customKeybinds || {}),
  });
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => resolveHotkeys(customHotkeys));
  const [dirty, setDirty] = useState(false);

  const handleChange = useCallback((key: string, value: string) => {
    setBinds(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleComboChange = useCallback((id: HotkeyId, combo: string) => {
    setHotkeys(prev => ({ ...prev, [id]: combo }));
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
    await onSave(Object.keys(diffs).length > 0 ? diffs : null, hotkeyDiffs(hotkeys));
    setDirty(false);
  };

  const handleReset = async () => {
    setBinds({ ...DEFAULT_KEYBINDS });
    setHotkeys(resolveHotkeys(null));
    await onSave(null, null);
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
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Shortcuts with Ctrl, Alt or Shift. Click one and press the new combination; Backspace clears it, Escape cancels.
        </p>
        {SCOPE_SECTIONS.map(({ scope, title, note }) => (
          <div key={scope}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{title}</h4>
            {note && <p className="text-[11px] text-muted-foreground/80 mb-1">{note}</p>}
            <div className="space-y-0.5">
              {HOTKEY_ACTIONS.filter((a) => a.scope === scope).map((a) => (
                <ComboCapture key={a.id} id={a.id} label={a.label} value={hotkeys[a.id]} map={hotkeys} onChange={handleComboChange} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground border-t border-white/10 pt-4">
        Single keys on the Home screen. Click a key badge then press any key to rebind. Press Escape to cancel.
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
