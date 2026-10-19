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
  // getCategories keeps one identity until the categories change; the array it
  // returns is new on every call, so the memo keys on the function.
  const { getCategories } = useUserSettings();

  return useMemo(
    () => [
      // "Uncategorized". Always available, safe fallback
      { id: "uncategorized", name: "Uncategorized", icon: "📦", color: "#6B7280", colorVar: "cat-uncategorized" },
      ...getCategories().map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        iconUrl: c.iconUrl,
        color: c.color,
        colorVar: c.colorVar,
      })),
    ],
    [getCategories]
  );
}
