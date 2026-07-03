export interface TrackerMetric {
  id: string;
  label: string;
  unit: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  colorVar: string; // tailwind class like "cat-mind"
}

export interface TrackerEntry {
  metricId: string;
  value: number;
  date: string; // ISO yyyy-mm-dd
  timestamp: number;
}

export const TRACKER_METRICS: TrackerMetric[] = [
  {
    id: "hours-mind",
    label: "Study Hours",
    unit: "hrs",
    icon: "📖",
    categoryId: "mind",
    categoryName: "Mind",
    categoryIcon: "🧠",
    colorVar: "cat-mind",
  },
  {
    id: "pages-read",
    label: "Pages Read",
    unit: "pages",
    icon: "📄",
    categoryId: "mind",
    categoryName: "Mind",
    categoryIcon: "🧠",
    colorVar: "cat-mind",
  },
  {
    id: "pushups",
    label: "Push-ups",
    unit: "reps",
    icon: "💥",
    categoryId: "body",
    categoryName: "Body",
    categoryIcon: "💪",
    colorVar: "cat-body",
  },
  {
    id: "hours-body",
    label: "Training Hours",
    unit: "hrs",
    icon: "⏱️",
    categoryId: "body",
    categoryName: "Body",
    categoryIcon: "💪",
    colorVar: "cat-body",
  },
  {
    id: "clients-outreached",
    label: "Clients Outreached",
    unit: "clients",
    icon: "📨",
    categoryId: "creation",
    categoryName: "Creation",
    categoryIcon: "🎨",
    colorVar: "cat-creation",
  },
  {
    id: "hours-creation",
    label: "Creation Hours",
    unit: "hrs",
    icon: "🛠️",
    categoryId: "creation",
    categoryName: "Creation",
    categoryIcon: "🎨",
    colorVar: "cat-creation",
  },
  {
    id: "good-trade-setups",
    label: "Good Trade Setups",
    unit: "setups",
    icon: "🎯",
    categoryId: "trading",
    categoryName: "Trading",
    categoryIcon: "📊",
    colorVar: "cat-trading",
  },
  {
    id: "hours-trading",
    label: "Trading Hours",
    unit: "hrs",
    icon: "📈",
    categoryId: "trading",
    categoryName: "Trading",
    categoryIcon: "📊",
    colorVar: "cat-trading",
  },
  {
    id: "people-contacted",
    label: "People Contacted",
    unit: "people",
    icon: "🤝",
    categoryId: "networking",
    categoryName: "Networking",
    categoryIcon: "👑",
    colorVar: "cat-networking",
  },
  {
    id: "hours-exploration",
    label: "Exploration Hours",
    unit: "hrs",
    icon: "🔭",
    categoryId: "exploration",
    categoryName: "Exploration",
    categoryIcon: "🔭",
    colorVar: "cat-exploration",
  },
];

const STORAGE_KEY = "tracker_entries_v1";

export function loadEntries(): TrackerEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: TrackerEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function addEntry(metricId: string, value: number): TrackerEntry[] {
  const entries = loadEntries();
  const now = new Date();
  const entry: TrackerEntry = {
    metricId,
    value,
    date: now.toISOString().split("T")[0],
    timestamp: now.getTime(),
  };
  entries.push(entry);
  saveEntries(entries);
  return entries;
}

export function getTodayTotal(entries: TrackerEntry[], metricId: string): number {
  const today = new Date().toISOString().split("T")[0];
  return entries
    .filter((e) => e.metricId === metricId && e.date === today)
    .reduce((sum, e) => sum + e.value, 0);
}

export function getAllTimeTotal(entries: TrackerEntry[], metricId: string): number {
  return entries
    .filter((e) => e.metricId === metricId)
    .reduce((sum, e) => sum + e.value, 0);
}

export function getLast7DaysTotal(entries: TrackerEntry[], metricId: string): number {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  return entries
    .filter((e) => e.metricId === metricId && e.timestamp >= sevenDaysAgo)
    .reduce((sum, e) => sum + e.value, 0);
}

export function getStreakDays(entries: TrackerEntry[]): number {
  if (entries.length === 0) return 0;
  const uniqueDates = [...new Set(entries.map((e) => e.date))].sort().reverse();
  const today = new Date().toISOString().split("T")[0];
  
  let streak = 0;
  let expectedDate = today;
  
  for (const date of uniqueDates) {
    if (date === expectedDate) {
      streak++;
      const d = new Date(expectedDate);
      d.setDate(d.getDate() - 1);
      expectedDate = d.toISOString().split("T")[0];
    } else if (date < expectedDate) {
      break;
    }
  }
  
  return streak;
}

export function getDailyData(entries: TrackerEntry[], metricId: string, days: number = 7) {
  const result: { date: string; value: number }[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayTotal = entries
      .filter((e) => e.metricId === metricId && e.date === dateStr)
      .reduce((sum, e) => sum + e.value, 0);
    result.push({ date: dateStr, value: dayTotal });
  }
  
  return result;
}
