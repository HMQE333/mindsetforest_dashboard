import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { TRACKER_METRICS } from "@/lib/tracker-data";
import { useAuth } from "@/hooks/useAuth";
import { useTrackerEntries, getTodayTotal, getLast7DaysTotal, getAllTimeTotal, getStreakDays } from "@/hooks/useTrackerEntries";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useIsWatch } from "@/hooks/useIsWatch";
import TrackerStatCard from "@/components/TrackerStatCard";
import TrackerInputModal from "@/components/TrackerInputModal";
import TrackerOverviewBar from "@/components/TrackerOverviewBar";
import TrackerRecentLog from "@/components/TrackerRecentLog";
import TrackerCalendar from "@/components/TrackerCalendar";
import TrackerDetailedStats from "@/components/TrackerDetailedStats";
import TrackerActivityPulse from "@/components/TrackerActivityPulse";
import TrackerWatchView from "@/components/TrackerWatchView";
import TrackerAchievements from "@/components/TrackerAchievements";
import TrackerMilestoneModal from "@/components/TrackerMilestoneModal";
import { useTrackerXp } from "@/hooks/useTrackerXp";
import { useAssistantCurrentScope } from "@/hooks/useAssistant";
import { Sparkles } from "lucide-react";

export default function Tracker() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { entries, loading, addEntry } = useTrackerEntries();
  const { getMetrics } = useUserSettings();
  const metrics = getMetrics();
  const isWatch = useIsWatch();
  const { awardEntryXp, totalXp, todayEntryXp, config } = useTrackerXp();
  const [activeMetricId, setActiveMetricId] = useState<string | null>(null);
  const [floatingXP, setFloatingXP] = useState<{ id: number; value: number; x: number; y: number } | null>(null);
  const [milestone, setMilestone] = useState<{ id: string; title: string; icon: string; xp: number } | null>(null);
  useAssistantCurrentScope("tracker");

  const streak = getStreakDays(entries);
  const activeMetric = activeMetricId ? metrics.find((m) => m.id === activeMetricId) || null : null;

  const handleAdd = useCallback((metricId: string) => {
    setActiveMetricId(metricId);
  }, []);

  const handleSubmit = useCallback(async (metricId: string, value: number) => {
    await addEntry(metricId, value);
    setActiveMetricId(null);
    const xp = await awardEntryXp(metricId, value);
    setFloatingXP({ id: Date.now(), value: xp > 0 ? xp : value, x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setTimeout(() => setFloatingXP(null), 1500);
  }, [addEntry, awardEntryXp]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  // Group metrics by category
  const grouped = metrics.reduce<Record<string, typeof metrics>>((acc, m) => {
    if (!acc[m.categoryId]) acc[m.categoryId] = [];
    acc[m.categoryId].push(m);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse">Loading...</div>
      </div>
    );
  }

  if (isWatch) {
    return (
      <>
        <TrackerWatchView entries={entries} streak={streak} onAdd={handleAdd} metrics={metrics} />
        <AnimatePresence>
          {activeMetric && (
            <TrackerInputModal
              metric={activeMetric}
              onSubmit={handleSubmit}
              onClose={() => setActiveMetricId(null)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cat-spirit/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <Link
            to="/"
            className="glass-card px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gradient-purple">Stats Tracker</h1>
          <div className="flex items-center gap-2">
            {config.enabled && (
              <div
                title={`${todayEntryXp} XP earned today from logs${config.dailyCap > 0 ? ` (cap ${config.dailyCap})` : ""}`}
                className="hidden sm:inline-flex items-center gap-1.5 glass-card px-3 py-2 text-xs font-bold text-primary"
              >
                <Sparkles className="w-3.5 h-3.5" /> {totalXp} XP
              </div>
            )}
            <button
            onClick={handleSignOut}
            className="glass-card px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
            >
              Sign Out
            </button>
          </div>
        </motion.div>

        {/* Overview */}
        <TrackerOverviewBar entries={entries} streak={streak} />

        {/* Category Sections */}
        {Object.entries(grouped).map(([catId, metrics], catIndex) => {
          const cat = metrics[0];
          return (
            <motion.div
              key={catId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 + catIndex * 0.05 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">{cat.categoryIcon}</span>
                <h2 className="text-lg font-bold text-foreground/90">{cat.categoryName}</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {metrics.map((metric, i) => (
                  <TrackerStatCard
                    key={metric.id}
                    metric={metric}
                    todayValue={getTodayTotal(entries, metric.id)}
                    weekValue={getLast7DaysTotal(entries, metric.id)}
                    allTimeValue={getAllTimeTotal(entries, metric.id)}
                    index={catIndex * 3 + i}
                    onAdd={handleAdd}
                  />
                ))}
              </div>
            </motion.div>
          );
        })}

        {/* Calendar (click to expand) */}
        <TrackerCalendar entries={entries} />

        {/* Detailed Stats (click to expand) */}
        <TrackerDetailedStats entries={entries} />

        {/* 12-Month Activity Pulse */}
        <TrackerActivityPulse entries={entries} />

        {/* Achievements */}
        <TrackerAchievements entries={entries} onMilestone={setMilestone} />

        {/* Recent Log */}
        <TrackerRecentLog entries={entries} />
      </div>

      {/* Input Modal */}
      <AnimatePresence>
        {activeMetric && (
          <TrackerInputModal
            metric={activeMetric}
            onSubmit={handleSubmit}
            onClose={() => setActiveMetricId(null)}
          />
        )}
      </AnimatePresence>

      <TrackerMilestoneModal milestone={milestone} onClose={() => setMilestone(null)} />

      {/* Floating XP */}
      <AnimatePresence>
        {floatingXP && (
          <motion.div
            key={floatingXP.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -100, scale: 1.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            className="fixed pointer-events-none z-[100] text-3xl font-bold text-stat-value"
            style={{ left: floatingXP.x - 40, top: floatingXP.y - 20 }}
          >
            +{floatingXP.value} XP
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
