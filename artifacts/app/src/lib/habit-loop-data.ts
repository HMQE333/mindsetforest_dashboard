export interface HabitTask {
  id: string;
  text: string;
  completedReps: number;
}

export interface HabitLoop {
  name: string;
  repsRequired: number;
  tasks: HabitTask[];
}

/** A named, independent habit loop. Category is an optional context tag for AI. */
export interface HabitLoopProject {
  id: string;
  name: string;
  category?: string | null;
  currentLoop: number;
  loops: HabitLoop[];
}

export function isLoopComplete(loop: HabitLoop): boolean {
  return loop.tasks.length > 0 && loop.tasks.every(t => t.completedReps >= loop.repsRequired);
}

export function getLoopProgress(loop: HabitLoop): { total: number; completed: number; percentage: number } {
  const total = loop.tasks.length * loop.repsRequired;
  const completed = loop.tasks.reduce((sum, t) => sum + Math.min(t.completedReps, loop.repsRequired), 0);
  return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 };
}

/** Backward compat: convert old category-keyed rows to new named projects. */
export function migrateHabitLoops(old: Record<string, { currentLoop: number; loops: HabitLoop[] }>): HabitLoopProject[] {
  const catNames: Record<string, string> = {
    mind: "Mind", body: "Body", expression: "Expression", creation: "Expression",
    exploration: "Exploration", people: "People", networking: "People",
    money: "Money", trading: "Money", spirit: "Spirit", order: "Order",
  };
  const result: HabitLoopProject[] = [];
  for (const [key, val] of Object.entries(old)) {
    if (!val || val.loops.length === 0) continue;
    result.push({
      id: crypto.randomUUID(),
      name: catNames[key] || key.charAt(0).toUpperCase() + key.slice(1),
      category: key,
      currentLoop: val.currentLoop || 0,
      loops: val.loops || [],
    });
  }
  return result;
}