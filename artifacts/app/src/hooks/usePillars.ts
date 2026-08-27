import { useMemo } from "react";
import { useUserSettings } from "./useUserSettings";

export interface Pillar {
  id: string;
  name: string;
  icon: string;
  iconUrl?: string;
  color: string;
  colorVar: string;
}

export function usePillars(): Pillar[] {
  const { getCategories } = useUserSettings();
  const categories = getCategories();

  return useMemo(
    () => [
      // "Uncategorized". Always available, safe fallback
      { id: "uncategorized", name: "Uncategorized", icon: "📦", color: "#6B7280", colorVar: "cat-uncategorized" },
      ...categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        iconUrl: c.iconUrl,
        color: c.color,
        colorVar: c.colorVar,
      })),
    ],
    [categories]
  );
}
