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
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        iconUrl: c.iconUrl,
        color: c.color,
        colorVar: c.colorVar,
      })),
    [categories]
  );
}
