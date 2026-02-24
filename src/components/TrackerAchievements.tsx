import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { TrackerEntry, getStreakDays, getHabitScore } from "@/hooks/useTrackerEntries";
import { TRACKER_METRICS } from "@/lib/tracker-data";

interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  category: string;
  check: (entries: TrackerEntry[]) => boolean;
  progress: (entries: TrackerEntry[]) => { current: number; target: number };
}

const ACHIEVEMENTS: Achievement[] = [
  // Consistency
  { id: "first-spark", icon: "🔥", title: "First Spark", description: "Log anything for 1 day", category: "Consistency",
    check: (e) => new Set(e.map(x => x.date)).size >= 1,
    progress: (e) => ({ current: Math.min(new Set(e.map(x => x.date)).size, 1), target: 1 }) },
  { id: "week-warrior", icon: "🔥", title: "Week Warrior", description: "7-day streak", category: "Consistency",
    check: (e) => getStreakDays(e) >= 7,
    progress: (e) => ({ current: Math.min(getStreakDays(e), 7), target: 7 }) },
  { id: "monthly-machine", icon: "🔥", title: "Monthly Machine", description: "30-day streak", category: "Consistency",
    check: (e) => getStreakDays(e) >= 30,
    progress: (e) => ({ current: Math.min(getStreakDays(e), 30), target: 30 }) },
  { id: "century-club", icon: "🔥", title: "Century Club", description: "100-day streak", category: "Consistency",
    check: (e) => getStreakDays(e) >= 100,
    progress: (e) => ({ current: Math.min(getStreakDays(e), 100), target: 100 }) },

  // Volume
  { id: "first-log", icon: "📝", title: "First Log", description: "Record 1 entry", category: "Volume",
    check: (e) => e.length >= 1,
    progress: (e) => ({ current: Math.min(e.length, 1), target: 1 }) },
  { id: "getting-started", icon: "📝", title: "Getting Started", description: "10 total entries", category: "Volume",
    check: (e) => e.length >= 10,
    progress: (e) => ({ current: Math.min(e.length, 10), target: 10 }) },
  { id: "dedicated", icon: "📝", title: "Dedicated", description: "100 total entries", category: "Volume",
    check: (e) => e.length >= 100,
    progress: (e) => ({ current: Math.min(e.length, 100), target: 100 }) },
  { id: "data-monster", icon: "📝", title: "Data Monster", description: "500 total entries", category: "Volume",
    check: (e) => e.length >= 500,
    progress: (e) => ({ current: Math.min(e.length, 500), target: 500 }) },

  // Category Coverage
  { id: "explorer", icon: "🌈", title: "Explorer", description: "Log in 3 different categories", category: "Coverage",
    check: (e) => {
      const cats = new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean));
      return cats.size >= 3;
    },
    progress: (e) => {
      const cats = new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean));
      return { current: Math.min(cats.size, 3), target: 3 };
    } },
  { id: "polymath", icon: "🌈", title: "Polymath", description: "Log in all 6 categories", category: "Coverage",
    check: (e) => {
      const cats = new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean));
      return cats.size >= 6;
    },
    progress: (e) => {
      const cats = new Set(e.map(x => TRACKER_METRICS.find(m => m.id === x.metricId)?.categoryId).filter(Boolean));
      return { current: Math.min(cats.size, 6), target: 6 };
    } },
  { id: "category-king", icon: "🌈", title: "Category King", description: "50+ entries in one category", category: "Coverage",
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

  // Specific Milestones
  { id: "100-club", icon: "💪", title: "100 Club", description: "100 total push-ups", category: "Milestones",
    check: (e) => e.filter(x => x.metricId === "pushups").reduce((s, x) => s + x.value, 0) >= 100,
    progress: (e) => ({ current: Math.min(e.filter(x => x.metricId === "pushups").reduce((s, x) => s + x.value, 0), 100), target: 100 }) },
  { id: "bookworm", icon: "📖", title: "Bookworm", description: "500 pages read", category: "Milestones",
    check: (e) => e.filter(x => x.metricId === "pages-read").reduce((s, x) => s + x.value, 0) >= 500,
    progress: (e) => ({ current: Math.min(e.filter(x => x.metricId === "pages-read").reduce((s, x) => s + x.value, 0), 500), target: 500 }) },
  { id: "time-lord", icon: "⏱️", title: "Time Lord", description: "100 total hours logged", category: "Milestones",
    check: (e) => {
      const hourMetrics = TRACKER_METRICS.filter(m => m.unit === "hrs").map(m => m.id);
      return e.filter(x => hourMetrics.includes(x.metricId)).reduce((s, x) => s + x.value, 0) >= 100;
    },
    progress: (e) => {
      const hourMetrics = TRACKER_METRICS.filter(m => m.unit === "hrs").map(m => m.id);
      const total = e.filter(x => hourMetrics.includes(x.metricId)).reduce((s, x) => s + x.value, 0);
      return { current: Math.min(total, 100), target: 100 };
    } },
  { id: "sharpshooter", icon: "🎯", title: "Sharpshooter", description: "50 good trade setups", category: "Milestones",
    check: (e) => e.filter(x => x.metricId === "good-trade-setups").reduce((s, x) => s + x.value, 0) >= 50,
    progress: (e) => ({ current: Math.min(e.filter(x => x.metricId === "good-trade-setups").reduce((s, x) => s + x.value, 0), 50), target: 50 }) },

  // Meta / Fun
  { id: "early-bird", icon: "⭐", title: "Early Bird", description: "Log before 8 AM", category: "Fun",
    check: (e) => e.some(x => new Date(x.createdAt).getHours() < 8),
    progress: (e) => ({ current: e.some(x => new Date(x.createdAt).getHours() < 8) ? 1 : 0, target: 1 }) },
  { id: "night-owl", icon: "🦉", title: "Night Owl", description: "Log after 11 PM", category: "Fun",
    check: (e) => e.some(x => new Date(x.createdAt).getHours() >= 23),
    progress: (e) => ({ current: e.some(x => new Date(x.createdAt).getHours() >= 23) ? 1 : 0, target: 1 }) },
  { id: "perfectionist", icon: "🏆", title: "Perfectionist", description: "100% habit score on any metric", category: "Fun",
    check: (e) => TRACKER_METRICS.some(m => { const s = getHabitScore(e, m.id); return s.score >= 100 && e.some(x => x.metricId === m.id); }),
    progress: (e) => {
      const best = Math.max(0, ...TRACKER_METRICS.map(m => e.some(x => x.metricId === m.id) ? getHabitScore(e, m.id).score : 0));
      return { current: Math.min(best, 100), target: 100 };
    } },
];

interface Props {
  entries: TrackerEntry[];
}

export default function TrackerAchievements({ entries }: Props) {
  const [expanded, setExpanded] = useState(false);

  const computed = useMemo(() => {
    return ACHIEVEMENTS.map(a => {
      const unlocked = a.check(entries);
      const prog = a.progress(entries);
      const percent = prog.target > 0 ? Math.round((prog.current / prog.target) * 100) : 0;
      return { ...a, unlocked, ...prog, percent };
    }).sort((a, b) => {
      // unlocked first, then in-progress (percent > 0), then locked
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (!a.unlocked && !b.unlocked) return b.percent - a.percent;
      return 0;
    });
  }, [entries]);

  const unlockedCount = computed.filter(a => a.unlocked).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="mt-8"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full glass-card p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🏆</span>
          <span className="font-bold text-foreground/90">Achievements</span>
          <span className="text-sm text-muted-foreground">
            {unlockedCount} / {ACHIEVEMENTS.length} unlocked
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4">
              {computed.map((badge, i) => (
                <motion.div
                  key={badge.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`glass-card p-3 relative transition-all ${
                    badge.unlocked
                      ? "ring-1 ring-primary/30 shadow-[0_0_15px_-3px_hsl(var(--primary)/0.2)]"
                      : "opacity-70"
                  }`}
                >
                  {badge.unlocked && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                  )}

                  <div className={`text-2xl mb-1 ${badge.unlocked ? "" : "grayscale opacity-50"}`}>
                    {badge.icon}
                  </div>
                  <div className="font-semibold text-sm text-foreground/90 leading-tight">
                    {badge.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
                    {badge.description}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="h-1.5 w-full rounded-full bg-secondary/60 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${
                          badge.unlocked ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${badge.percent}%` }}
                        transition={{ delay: i * 0.03 + 0.2, duration: 0.5 }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {badge.current} / {badge.target}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
