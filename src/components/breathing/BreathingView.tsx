import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wind, Flame, Zap, Trophy } from "lucide-react";
import { BREATHING_PATTERNS, DURATION_OPTIONS, BreathingPattern } from "@/lib/breathing-data";
import { useBreathingState } from "@/hooks/useBreathingState";
import BreathingSession from "./BreathingSession";

const PATTERN_ICONS: Record<string, string> = {
  equal: "⚖️",
  box: "🔲",
  "478": "🌙",
  relaxing: "🍃",
};

const BreathingView = () => {
  const { stats, logSession } = useBreathingState();
  const [selectedPattern, setSelectedPattern] = useState<BreathingPattern | null>(null);
  const [selectedDuration, setSelectedDuration] = useState(120);
  const [sessionActive, setSessionActive] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const handleStart = (pattern: BreathingPattern) => {
    setSelectedPattern(pattern);
    setSessionActive(true);
    setShowComplete(false);
  };

  const handleComplete = useCallback((actualSeconds: number) => {
    if (selectedPattern) {
      logSession(selectedPattern.id, actualSeconds);
    }
    setSessionActive(false);
    setShowComplete(true);
    setTimeout(() => setShowComplete(false), 3000);
  }, [selectedPattern, logSession]);

  const handleStop = () => {
    setSessionActive(false);
    setSelectedPattern(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <Wind className="w-6 h-6" style={{ color: "hsl(185, 80%, 55%)" }} />
          Vessel of Air
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Fill the ancient vessel with your breath</p>
      </div>

      {/* Stats strip */}
      <div className="flex items-center justify-center gap-6">
        {[
          { icon: <Flame className="w-4 h-4" />, label: "Sessions", value: stats.totalSessions },
          { icon: <Wind className="w-4 h-4" />, label: "Minutes", value: stats.totalMinutes },
          { icon: <Zap className="w-4 h-4" />, label: "Streak", value: `${stats.currentStreak}d` },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span style={{ color: "hsl(185, 70%, 55%)" }}>{s.icon}</span>
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-bold text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Session complete celebration */}
        {showComplete && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center py-16"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Trophy className="w-16 h-16 mx-auto mb-4" style={{ color: "hsl(185, 80%, 55%)" }} />
            </motion.div>
            <p className="text-2xl font-bold text-foreground">Session Complete</p>
            <p className="text-muted-foreground mt-2">The vessel is filled with energy ✨</p>
          </motion.div>
        )}

        {/* Active session */}
        {sessionActive && selectedPattern && !showComplete && (
          <motion.div
            key="session"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <BreathingSession
              pattern={selectedPattern}
              durationSeconds={selectedDuration}
              onComplete={handleComplete}
              onStop={handleStop}
            />
          </motion.div>
        )}

        {/* Pattern selection */}
        {!sessionActive && !showComplete && (
          <motion.div
            key="select"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Duration selector */}
            <div className="flex items-center justify-center gap-2">
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.seconds}
                  onClick={() => setSelectedDuration(d.seconds)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    selectedDuration === d.seconds
                      ? "text-primary-foreground glow-sm"
                      : "glass-card text-muted-foreground hover:text-foreground"
                  }`}
                  style={
                    selectedDuration === d.seconds
                      ? { background: "hsl(185, 70%, 40%)" }
                      : {}
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Pattern cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
              {BREATHING_PATTERNS.map((p, i) => (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => handleStart(p)}
                  className="glass-card p-5 rounded-2xl text-left hover:bg-white/5 transition-all group border border-white/5 hover:border-white/10"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{p.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground group-hover:text-foreground/90">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                      <div className="flex items-center gap-1.5 mt-3">
                        {[
                          { l: "In", v: p.inhale },
                          ...(p.hold1 ? [{ l: "Hold", v: p.hold1 }] : []),
                          { l: "Out", v: p.exhale },
                          ...(p.hold2 ? [{ l: "Hold", v: p.hold2 }] : []),
                        ].map((s, j) => (
                          <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground">
                            {s.l} {s.v}s
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BreathingView;
