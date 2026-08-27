export interface LadderTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface LadderLevels {
  [level: number]: LadderTask[];
}

/** A named, independent ladder. Category is an optional context tag for AI. */
export interface Ladder {
  id: string;
  name: string;
  category?: string | null;
  levels: LadderLevels;
}

export const LADDER_LEVELS = [
  { level: 0, title: "Foundation", emoji: "0️⃣", colors: { bg: "from-violet-500/20 to-fuchsia-500/20", border: "border-violet-500/40", glow: "shadow-violet-500/30", text: "text-violet-200" } },
  { level: 1, title: "System", emoji: "1️⃣", colors: { bg: "from-green-500/20 to-emerald-500/20", border: "border-green-500/40", glow: "shadow-green-500/30", text: "text-green-200" } },
  { level: 2, title: "Output", emoji: "2️⃣", colors: { bg: "from-blue-500/20 to-blue-600/20", border: "border-blue-500/40", glow: "shadow-blue-500/30", text: "text-blue-200" } },
  { level: 3, title: "Feedback", emoji: "3️⃣", colors: { bg: "from-amber-500/20 to-amber-600/20", border: "border-amber-500/40", glow: "shadow-amber-500/30", text: "text-amber-200" } },
  { level: 4, title: "Optimization", emoji: "4️⃣", colors: { bg: "from-red-500/20 to-red-600/20", border: "border-red-500/40", glow: "shadow-red-500/30", text: "text-red-200" } },
  { level: 5, title: "Mastery", emoji: "5️⃣", colors: { bg: "from-purple-500/20 to-purple-600/20", border: "border-purple-500/40", glow: "shadow-purple-500/30", text: "text-purple-200" } },
];

export function emptyLevels(): LadderLevels {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] };
}

/** Backward compat: convert old category-keyed format to new array format. */
export function migrateLadders(old: Record<string, { levels: LadderLevels }>): Ladder[] {
  const result: Ladder[] = [];
  const catNames: Record<string, string> = {
    mind: "Mind", body: "Body", expression: "Expression", creation: "Expression",
    exploration: "Exploration", people: "People", networking: "People",
    money: "Money", trading: "Money", spirit: "Spirit", order: "Order",
  };
  for (const [key, val] of Object.entries(old)) {
    result.push({
      id: crypto.randomUUID(),
      name: catNames[key] || key.charAt(0).toUpperCase() + key.slice(1),
      category: key,
      levels: val.levels || emptyLevels(),
    });
  }
  return result;
}