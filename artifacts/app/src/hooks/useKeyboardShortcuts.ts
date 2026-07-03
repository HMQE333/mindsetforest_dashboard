import { useEffect } from "react";

type ShortcutContext = "grid" | "projects" | "mission";

export interface KeybindMap {
  mind: string;
  body: string;
  creation: string;
  exploration: string;
  networking: string;
  trading: string;
  spirit: string;
  order: string;
  projects: string;
  resetDay: string;
  editTasks: string;
  aiSuggestions: string;
  resetDefaults: string;
  toggleShortcuts: string;
}

export const DEFAULT_KEYBINDS: KeybindMap = {
  mind: "m",
  body: "b",
  creation: "c",
  exploration: "x",
  networking: "n",
  trading: "t",
  spirit: "s",
  order: "o",
  projects: "p",
  resetDay: "r",
  editTasks: "e",
  aiSuggestions: "a",
  resetDefaults: "d",
  toggleShortcuts: "?",
};

export const KEYBIND_LABELS: Record<keyof KeybindMap, string> = {
  mind: "Mind",
  body: "Body",
  creation: "Creation",
  exploration: "Exploration",
  networking: "Networking",
  trading: "Trading",
  spirit: "Spirit",
  order: "Order",
  projects: "Projects",
  resetDay: "Reset Day",
  editTasks: "Edit Tasks",
  aiSuggestions: "AI Suggestions",
  resetDefaults: "Reset Defaults",
  toggleShortcuts: "Toggle Shortcuts",
};

interface ShortcutActions {
  context: ShortcutContext;
  selectCategory: (id: string) => void;
  completeMission?: (index: number) => void;
  editTasks?: () => void;
  aiSuggestions?: () => void;
  resetDefaults?: () => void;
  resetDay: () => void;
  goBack?: () => void;
  selectProject?: (index: number) => void;
  toggleShortcutsPanel: () => void;
  missionCount?: number;
  projectCount?: number;
  customKeybinds?: Partial<KeybindMap>;
}

export function getKeybinds(custom?: Partial<KeybindMap>): KeybindMap {
  return { ...DEFAULT_KEYBINDS, ...(custom || {}) };
}

const CATEGORY_KEYS: (keyof KeybindMap)[] = ["mind", "body", "creation", "exploration", "networking", "trading", "spirit", "order"];

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const binds = getKeybinds(actions.customKeybinds);

    // Build reverse map for grid: key -> categoryId
    const gridKeyMap: Record<string, string> = {};
    for (const catKey of CATEGORY_KEYS) {
      gridKeyMap[binds[catKey].toLowerCase()] = catKey;
    }
    gridKeyMap[binds.projects.toLowerCase()] = "__projects__";

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (document.querySelector("[data-radix-portal]")) return;

      const key = e.key.toLowerCase();

      // Global
      if (key === binds.toggleShortcuts.toLowerCase() || key === "k") {
        e.preventDefault();
        actions.toggleShortcutsPanel();
        return;
      }

      if ((key === "escape" || key === "backspace") && actions.goBack) {
        e.preventDefault();
        actions.goBack();
        return;
      }

      if (actions.context === "grid") {
        if (key === binds.resetDay.toLowerCase()) {
          e.preventDefault();
          actions.resetDay();
          return;
        }
        const categoryId = gridKeyMap[key];
        if (categoryId) {
          e.preventDefault();
          actions.selectCategory(categoryId);
        }
      }

      if (actions.context === "projects") {
        const num = parseInt(key);
        if (num >= 1 && num <= 9 && actions.selectProject) {
          e.preventDefault();
          actions.selectProject(num - 1);
        }
      }

      if (actions.context === "mission") {
        const num = parseInt(key);
        if (num >= 1 && num <= 9 && actions.completeMission) {
          e.preventDefault();
          actions.completeMission(num - 1);
          return;
        }
        if (key === binds.editTasks.toLowerCase() && actions.editTasks) {
          e.preventDefault();
          actions.editTasks();
        }
        if (key === binds.aiSuggestions.toLowerCase() && actions.aiSuggestions) {
          e.preventDefault();
          actions.aiSuggestions();
        }
        if (key === binds.resetDefaults.toLowerCase() && actions.resetDefaults) {
          e.preventDefault();
          actions.resetDefaults();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
