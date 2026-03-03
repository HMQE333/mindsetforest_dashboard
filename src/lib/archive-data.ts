import { CATEGORIES } from "./dashboard-data";

export const PILLARS = CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  color: c.color,
  colorVar: c.colorVar,
}));

export const DIRECTIONS = [
  { id: "direction", label: "Direction", icon: "🧭" },
  { id: "goals", label: "Goals", icon: "🎯" },
  { id: "wisdom", label: "Wisdom", icon: "📖" },
  { id: "freedom", label: "Freedom", icon: "🕊️" },
  { id: "protection", label: "Protection", icon: "🛡️" },
  { id: "creation", label: "Creation", icon: "🔨" },
  { id: "expression", label: "Expression", icon: "🎤" },
  { id: "community", label: "Community", icon: "🤝" },
] as const;

export type ArchiveBlock = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  pillars: string[];
  directions: string[];
  tags: string[];
  source_url: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};
