/**
 * Keyboard shortcuts with a modifier ("ctrl+shift+k"), set by the user in
 * Settings -> Keybinds. The single-key shortcuts of the Home grid live in
 * hooks/useKeyboardShortcuts.ts; these are the ones that work anywhere,
 * inside the Archive inbox, and on the PC through the desktop tracker.
 *
 * A combo is stored lower-case as "ctrl+alt+shift+key" (in that order), with
 * the key read from KeyboardEvent.code so it does not depend on the keyboard
 * layout: Alt+C is "alt+c" on a Polish keyboard too. "" means not set.
 */

export type HotkeyId =
  | "quickCapture"
  | "toggleAssistant"
  | "goHome"
  | "goPaths"
  | "goArchive"
  | "goLibrary"
  | "inboxSave"
  | "inboxTags"
  | "inboxClean"
  | "inboxPrompt"
  | "trackerCapture";

export type HotkeyMap = Record<HotkeyId, string>;

/** app: anywhere in the app; field: inside the Archive inbox / Quick Capture; tracker: anywhere on the PC. */
export type HotkeyScope = "app" | "field" | "tracker";

export interface HotkeyAction {
  id: HotkeyId;
  label: string;
  scope: HotkeyScope;
}

export const HOTKEY_ACTIONS: HotkeyAction[] = [
  { id: "quickCapture", label: "Quick Capture", scope: "app" },
  { id: "toggleAssistant", label: "Open / close the assistant", scope: "app" },
  { id: "goHome", label: "Go to Home", scope: "app" },
  { id: "goPaths", label: "Go to Paths", scope: "app" },
  { id: "goArchive", label: "Go to Archive", scope: "app" },
  { id: "goLibrary", label: "Go to Library", scope: "app" },
  { id: "inboxSave", label: "Save", scope: "field" },
  { id: "inboxTags", label: "AI tags", scope: "field" },
  { id: "inboxClean", label: "AI clean and split", scope: "field" },
  { id: "inboxPrompt", label: "AI by your prompt", scope: "field" },
  { id: "trackerCapture", label: "Save selected text to Archive", scope: "tracker" },
];

export const DEFAULT_HOTKEYS: HotkeyMap = {
  quickCapture: "ctrl+shift+k",
  toggleAssistant: "",
  goHome: "",
  goPaths: "",
  goArchive: "",
  goLibrary: "",
  inboxSave: "ctrl+enter",
  inboxTags: "alt+t",
  inboxClean: "alt+c",
  inboxPrompt: "alt+p",
  trackerCapture: "alt+shift+s",
};

/** The defaults with the user's own choices on top (unknown ids dropped). */
export function resolveHotkeys(custom?: Partial<Record<string, string>> | null): HotkeyMap {
  const out = { ...DEFAULT_HOTKEYS };
  for (const id of Object.keys(DEFAULT_HOTKEYS) as HotkeyId[]) {
    const v = custom?.[id];
    if (typeof v === "string") out[id] = v;
  }
  return out;
}

/** Only the entries that differ from the defaults, or null when none do. */
export function hotkeyDiffs(map: HotkeyMap): Partial<HotkeyMap> | null {
  const diffs: Partial<HotkeyMap> = {};
  for (const id of Object.keys(DEFAULT_HOTKEYS) as HotkeyId[]) {
    if (map[id] !== DEFAULT_HOTKEYS[id]) diffs[id] = map[id];
  }
  return Object.keys(diffs).length > 0 ? diffs : null;
}

interface KeyLike {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function keyName(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].toLowerCase();
  m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return m[1];
  m = /^F([1-9]|1\d|2[0-4])$/.exec(code);
  if (m) return `f${m[1]}`;
  if (code === "Enter" || code === "NumpadEnter") return "enter";
  if (code === "Space") return "space";
  return null;
}

/** The combo a key press makes, or null while only modifiers are held (or for an unsupported key). */
export function comboFromEvent(e: KeyLike): string | null {
  const key = keyName(e.code);
  if (!key) return null;
  const parts: string[] = [];
  // Cmd on a Mac counts as Ctrl, as the app's shortcuts always did.
  if (e.ctrlKey || e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

export function matchesHotkey(e: KeyLike, combo: string | undefined): boolean {
  return !!combo && comboFromEvent(e) === combo;
}

export function formatHotkey(combo: string): string {
  if (!combo) return "Not set";
  return combo
    .split("+")
    .map((p) => (p === "ctrl" ? "Ctrl" : p === "alt" ? "Alt" : p === "shift" ? "Shift" : p === "enter" ? "Enter" : p === "space" ? "Space" : p.toUpperCase()))
    .join("+");
}

/** Combos the browser keeps for itself, so a page never sees them. */
const BROWSER_KEEPS = new Set([
  "ctrl+t", "ctrl+w", "ctrl+n", "ctrl+shift+t", "ctrl+shift+n", "ctrl+shift+w", "ctrl+shift+q",
  "ctrl+tab", "ctrl+l", "ctrl+r", "ctrl+shift+r", "ctrl+shift+i", "ctrl+shift+j", "ctrl+shift+delete",
  "f5", "f11", "f12",
]);
/** Shortcuts every app uses; taking one would break copy, paste, save and the like. */
const EVERYWHERE = new Set(["a", "c", "v", "x", "z", "y", "s", "f", "p", "o"].map((k) => `ctrl+${k}`));

/**
 * Why a combo cannot be used for this action, or null when it can. "" (not
 * set) is always fine.
 */
export function hotkeyProblem(id: HotkeyId, combo: string, map: HotkeyMap): string | null {
  if (!combo) return null;
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const scope = HOTKEY_ACTIONS.find((a) => a.id === id)?.scope ?? "app";
  const isFKey = /^f\d+$/.test(key);

  if (mods.has("ctrl") && mods.has("alt")) {
    return "Ctrl+Alt is AltGr on a Polish keyboard (ą, ę, ś, ż...). Pick another combination.";
  }
  if (mods.size === 0 && !(isFKey && scope === "app")) {
    return "Add Ctrl, Alt or Shift, or it would fire while you type.";
  }
  if (mods.size === 1 && mods.has("shift") && !isFKey) {
    return "Shift alone types capitals. Add Ctrl or Alt.";
  }
  if (scope === "tracker" && !/^([a-z0-9]|f\d+)$/.test(key)) {
    return "The desktop tracker takes a letter, a digit or F1-F24.";
  }
  if (BROWSER_KEEPS.has(combo)) return "The browser keeps this one for itself.";
  if (EVERYWHERE.has(combo)) return "Every app uses this one (copy, paste, save...).";
  const other = HOTKEY_ACTIONS.find((a) => a.id !== id && map[a.id] === combo);
  if (other) return `Already used by "${other.label}".`;
  return null;
}
