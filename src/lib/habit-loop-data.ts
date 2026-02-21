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

export interface CategoryHabitLoops {
  currentLoop: number;
  loops: HabitLoop[];
}

export interface AllHabitLoops {
  [categoryId: string]: CategoryHabitLoops;
}

export function createEmptyHabitLoops(): AllHabitLoops {
  const categories = ["mind", "body", "creation", "exploration", "networking", "trading", "spirit", "order"];
  const obj: AllHabitLoops = {};
  categories.forEach(cat => {
    obj[cat] = { currentLoop: 0, loops: [] };
  });
  return obj;
}

export function isLoopComplete(loop: HabitLoop): boolean {
  return loop.tasks.length > 0 && loop.tasks.every(t => t.completedReps >= loop.repsRequired);
}

export function getLoopProgress(loop: HabitLoop): { total: number; completed: number; percentage: number } {
  const total = loop.tasks.length * loop.repsRequired;
  const completed = loop.tasks.reduce((sum, t) => sum + Math.min(t.completedReps, loop.repsRequired), 0);
  return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 };
}
