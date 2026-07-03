import { TrackerEntry, getStreakDays, getHabitScore } from "@/hooks/useTrackerEntries";
import { TRACKER_METRICS } from "@/lib/tracker-data";

export type AchievementTier = "tiny" | "small" | "medium" | "big" | "legendary";

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  category: string;
  tier: AchievementTier;
  check: (entries: TrackerEntry[]) => boolean;
  progress: (entries: TrackerEntry[]) => { current: number; target: number };
}

export const TIER_DEFAULT_XP: Record<AchievementTier, number> = {
  tiny: 25,
  small: 50,
  medium: 150,
  big: 400,
  legendary: 1000,
};

const sumMetric = (e: TrackerEntry[], id: string) =>
  e.filter(x => x.metricId === id).reduce((s, x) => s + x.value, 0);

export const ACHIEVEMENTS: Achievement[] = [
  // Consistency
  { id: "first-spark", icon: "🔥", title: "First Spark", description: "Log anything for 1 day", category: "Consistency", tier: "tiny",
    check: (e) => new Set(e.map(x => x.date)).size >= 1,
    progress: (e) => ({ current: Math.min(new Set(e.map(x => x.date)).size, 1), target: 1 }) },
  { id: "week-warrior", icon: "🔥", title: "Week Warrior", description: "7-day streak", category: "Consistency", tier: "small",
    check: (e) => getStreakDays(e) >= 7,
    progress: (e) => ({ current: Math.min(getStreakDays(e), 7), target: 7 }) },
  { id: "monthly-machine", icon: "🔥", title: "Monthly Machine", description: "30-day streak", category: "Consistency", tier: "medium",
    check: (e) => getStreakDays(e) >= 30,
    progress: (e) => ({ current: Math.min(getStreakDays(e), 30), target: 30 }) },
  { id: "century-club", icon: "🔥", title: "Century Club", description: "100-day streak", category: "Consistency", tier: "legendary",
    check: (e) => getStreakDays(e) >= 100,
    progress: (e) => ({ current: Math.min(getStreakDays(e), 100), target: 100 }) },

  // Volume
  { id: "first-log", icon: "📝", title: "First Log", description: "Record 1 entry", category: "Volume", tier: "tiny",
    check: (e) => e.length >= 1,
    progress: (e) => ({ current: Math.min(e.length, 1), target: 1 }) },
  { id: "getting-started", icon: "📝", title: "Getting Started", description: "10 total entries", category: "Volume", tier: "small",
    check: (e) => e.length >= 10,
    progress: (e) => ({ current: Math.min(e.length, 10), target: 10 }) },
  { id: "dedicated", icon: "📝", title: "Dedicated", description: "100 total entries", category: "Volume", tier: "medium",
    check: (e) => e.length >= 100,
    progress: (e) => ({ current: Math.min(e.length, 100), target: 100 }) },
  { id: "data-monster", icon: "📝", title: "Data Monster", description: "500 total entries", category: "Volume", tier: "big",
    check: (e) => e.length >= 500,
    progress: (e) => ({ current: Math.min(e.length, 500), target: 500 }) },

  // Coverage
  { id: "explorer", icon: "🌈", title: "Explorer", description: "Log in 3 different categories", category: "Coverage", tier: "small",
    check: (e) => new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean)).size >= 3,
    progress: (e) => ({ current: Math.min(new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean)).size, 3), target: 3 }) },
  { id: "polymath", icon: "🌈", title: "Polymath", description: "Log in all 6 categories", category: "Coverage", tier: "medium",
    check: (e) => new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean)).size >= 6,
    progress: (e) => ({ current: Math.min(new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean)).size, 6), target: 6 }) },
  { id: "category-king", icon: "🌈", title: "Category King", description: "50+ entries in one category", category: "Coverage", tier: "medium",
    check: (e) => {
      const counts: Record<string, number> = {};
      e.forEach(x => { const c = TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId; if (c) counts[c] = (counts[c] || 0) + 1; });
      return Math.max(0, ...Object.values(counts)) >= 50;
    },
    progress: (e) => {
      const counts: Record<string, number> = {};
      e.forEach(x => { const c = TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId; if (c) counts[c] = (counts[c] || 0) + 1; });
      return { current: Math.min(Math.max(0, ...Object.values(counts)), 50), target: 50 };
    } },

  // Milestones
  { id: "100-club", icon: "💪", title: "100 Club", description: "100 total push-ups", category: "Milestones", tier: "small",
    check: (e) => sumMetric(e, "pushups") >= 100,
    progress: (e) => ({ current: Math.min(sumMetric(e, "pushups"), 100), target: 100 }) },
  { id: "bookworm", icon: "📖", title: "Bookworm", description: "500 pages read", category: "Milestones", tier: "medium",
    check: (e) => sumMetric(e, "pages-read") >= 500,
    progress: (e) => ({ current: Math.min(sumMetric(e, "pages-read"), 500), target: 500 }) },
  { id: "time-lord", icon: "⏱️", title: "Time Lord", description: "100 total hours logged", category: "Milestones", tier: "big",
    check: (e) => {
      const hourMetrics = TRACKER_METRICS.filter(m => m.unit === "hrs").map(m => m.id);
      return e.filter(x => hourMetrics.includes(x.metricId)).reduce((s, x) => s + x.value, 0) >= 100;
    },
    progress: (e) => {
      const hourMetrics = TRACKER_METRICS.filter(m => m.unit === "hrs").map(m => m.id);
      const total = e.filter(x => hourMetrics.includes(x.metricId)).reduce((s, x) => s + x.value, 0);
      return { current: Math.min(total, 100), target: 100 };
    } },
  { id: "sharpshooter", icon: "🎯", title: "Sharpshooter", description: "50 good trade setups", category: "Milestones", tier: "medium",
    check: (e) => sumMetric(e, "good-trade-setups") >= 50,
    progress: (e) => ({ current: Math.min(sumMetric(e, "good-trade-setups"), 50), target: 50 }) },

  // Fun
  { id: "early-bird", icon: "⭐", title: "Early Bird", description: "Log before 8 AM", category: "Fun", tier: "tiny",
    check: (e) => e.some(x => new Date(x.createdAt).getHours() < 8),
    progress: (e) => ({ current: e.some(x => new Date(x.createdAt).getHours() < 8) ? 1 : 0, target: 1 }) },
  { id: "night-owl", icon: "🦉", title: "Night Owl", description: "Log after 11 PM", category: "Fun", tier: "tiny",
    check: (e) => e.some(x => new Date(x.createdAt).getHours() >= 23),
    progress: (e) => ({ current: e.some(x => new Date(x.createdAt).getHours() >= 23) ? 1 : 0, target: 1 }) },
  { id: "perfectionist", icon: "🏆", title: "Perfectionist", description: "100% habit score on any metric", category: "Fun", tier: "big",
    check: (e) => TRACKER_METRICS.some(m => { const s = getHabitScore(e, m.id); return s.score >= 100 && e.some(x => x.metricId === m.id); }),
    progress: (e) => {
      const best = Math.max(0, ...TRACKER_METRICS.map(m => e.some(x => x.metricId === m.id) ? getHabitScore(e, m.id).score : 0));
      return { current: Math.min(best, 100), target: 100 };
    } },
];