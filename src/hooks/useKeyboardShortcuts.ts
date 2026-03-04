import { useEffect } from "react";

type ShortcutContext = "grid" | "projects" | "mission";

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
}

const GRID_KEYS: Record<string, string> = {
  m: "mind",
  b: "body",
  c: "creation",
  x: "exploration",
  n: "networking",
  t: "trading",
  s: "spirit",
  o: "order",
  p: "__projects__",
};

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      // Ignore if any modal/dialog is open (check for radix overlays)
      if (document.querySelector("[data-radix-portal]")) return;

      const key = e.key.toLowerCase();

      // Global
      if (key === "?" || key === "k") {
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
        if (key === "r") {
          e.preventDefault();
          actions.resetDay();
          return;
        }
        const categoryId = GRID_KEYS[key];
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
        if (key === "e" && actions.editTasks) {
          e.preventDefault();
          actions.editTasks();
        }
        if (key === "a" && actions.aiSuggestions) {
          e.preventDefault();
          actions.aiSuggestions();
        }
        if (key === "d" && actions.resetDefaults) {
          e.preventDefault();
          actions.resetDefaults();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions]);
}
