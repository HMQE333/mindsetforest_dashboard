import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Check, Sparkles } from "lucide-react";
import { TrackerEntry } from "@/hooks/useTrackerEntries";
import { ACHIEVEMENTS } from "@/lib/tracker-achievements";
import { useTrackerXp } from "@/hooks/useTrackerXp";

interface Props {
  entries: TrackerEntry[];
  onMilestone?: (info: { id: string; title: string; icon: string; xp: number }) => void;
}

export default function TrackerAchievements({ entries, onMilestone }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { config, awardMilestoneXp, isMilestoneGranted, markMilestoneSkipped, loading } = useTrackerXp();
  const firedRef = useRef(false);

  const computed = useMemo(() => {
    return ACHIEVEMENTS.map(a => {
      const unlocked = a.check(entries);
      const prog = a.progress(entries);
      const percent = prog.target > 0 ? Math.round((prog.current / prog.target) * 100) : 0;
      const xp = config.milestones[a.id] ?? 0;
      return { ...a, unlocked, ...prog, percent, xp };
    }).sort((a, b) => {
      // unlocked first, then in-progress (percent > 0), then locked
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      if (!a.unlocked && !b.unlocked) return b.percent - a.percent;
      return 0;
    });
  }, [entries, config]);

  const unlockedCount = computed.filter(a => a.unlocked).length;

  // Award milestone XP for newly unlocked achievements.
  useEffect(() => {
    if (loading || !config.enabled) return;
    (async () => {
      for (const a of computed) {
        if (!a.unlocked) continue;
        if (isMilestoneGranted(a.id)) continue;
        // Skip retroactive grants on first run unless user opted in.
        if (!firedRef.current && !config.retroactive) {
          markMilestoneSkipped(a.id);
          continue;
        }
        const awarded = await awardMilestoneXp(a.id);
        if (awarded > 0 && onMilestone) {
          onMilestone({ id: a.id, title: a.title, icon: a.icon, xp: awarded });
        }
      }
      firedRef.current = true;
    })();
  }, [computed, loading, config.enabled, config.retroactive, isMilestoneGranted, awardMilestoneXp, onMilestone]);

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

                  {badge.xp > 0 && (
                    <div className={`mt-1 inline-flex items-center gap-1 text-[10px] font-bold ${badge.unlocked ? "text-primary" : "text-muted-foreground/70"}`}>
                      <Sparkles className="w-2.5 h-2.5" /> +{badge.xp} XP
                    </div>
                  )}

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
