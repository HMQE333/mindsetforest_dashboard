import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import BreathingVessel from "./BreathingVessel";
import { BreathingPattern, BreathPhase, getPhaseLabel, getCycleDuration } from "@/lib/breathing-data";

interface Props {
  pattern: BreathingPattern;
  durationSeconds: number;
  onComplete: (actualSeconds: number) => void;
  onStop: () => void;
}

function getPhaseSequence(p: BreathingPattern): { phase: BreathPhase; duration: number }[] {
  const seq: { phase: BreathPhase; duration: number }[] = [];
  if (p.inhale > 0) seq.push({ phase: "inhale", duration: p.inhale });
  if (p.hold1 > 0) seq.push({ phase: "hold1", duration: p.hold1 });
  if (p.exhale > 0) seq.push({ phase: "exhale", duration: p.exhale });
  if (p.hold2 > 0) seq.push({ phase: "hold2", duration: p.hold2 });
  return seq;
}

const BreathingSession = ({ pattern, durationSeconds, onComplete, onStop }: Props) => {
  const [countdown, setCountdown] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const phaseStartRef = useRef<number>(0);

  const phases = getPhaseSequence(pattern);
  const currentPhase = phases[phaseIndex % phases.length];
  const cycleDuration = getCycleDuration(pattern);
  const overallProgress = Math.min(elapsed / durationSeconds, 1);

  // Fill level based on phase
  const getFillLevel = () => {
    if (!currentPhase) return 0.2;
    const t = Math.min(phaseElapsed / currentPhase.duration, 1);
    switch (currentPhase.phase) {
      case "inhale": return 0.2 + t * 0.7;
      case "hold1": return 0.9;
      case "exhale": return 0.9 - t * 0.7;
      case "hold2": return 0.2;
    }
  };

  // Countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Main timer
  useEffect(() => {
    if (countdown > 0) return;
    startRef.current = performance.now();
    phaseStartRef.current = performance.now();

    const tick = () => {
      const now = performance.now();
      const totalElapsed = (now - startRef.current) / 1000;
      const pElapsed = (now - phaseStartRef.current) / 1000;

      setElapsed(totalElapsed);
      setPhaseElapsed(pElapsed);

      if (totalElapsed >= durationSeconds) {
        onComplete(Math.round(totalElapsed));
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [countdown, durationSeconds, onComplete]);

  // Phase advancement
  useEffect(() => {
    if (countdown > 0 || !currentPhase) return;
    if (phaseElapsed >= currentPhase.duration) {
      setPhaseIndex(i => i + 1);
      setPhaseElapsed(0);
      phaseStartRef.current = performance.now();
    }
  }, [phaseElapsed, currentPhase, countdown]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Countdown overlay
  if (countdown > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6">
        <motion.div
          key={countdown}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          className="text-7xl font-bold text-primary"
        >
          {countdown}
        </motion.div>
        <p className="text-muted-foreground text-sm">Get ready…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Timer */}
      <div className="text-center">
        <p className="text-2xl font-mono font-bold tracking-wider text-foreground/80">
          {formatTime(elapsed)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{formatTime(durationSeconds)} total</p>
      </div>

      {/* Vessel */}
      <BreathingVessel
        phase={currentPhase?.phase || "inhale"}
        fillLevel={getFillLevel()}
        progress={overallProgress}
        phaseDuration={currentPhase?.duration || 4}
      />

      {/* Phase label */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPhase?.phase + "-" + phaseIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="text-center"
        >
          <p className="text-xl font-bold" style={{ color: "hsl(185, 80%, 60%)" }}>
            {currentPhase ? getPhaseLabel(currentPhase.phase) : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {currentPhase ? `${currentPhase.duration}s` : ""}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Phase dots */}
      <div className="flex items-center gap-2">
        {phases.map((p, i) => (
          <motion.div
            key={i}
            className="w-2.5 h-2.5 rounded-full"
            animate={{
              backgroundColor: i === phaseIndex % phases.length
                ? "hsl(185, 80%, 60%)"
                : i < phaseIndex % phases.length
                ? "hsl(185, 50%, 40%)"
                : "hsl(230, 15%, 20%)",
              scale: i === phaseIndex % phases.length ? 1.3 : 1,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-48 h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: "hsl(185, 80%, 55%)" }}
          animate={{ width: `${overallProgress * 100}%` }}
        />
      </div>

      {/* Stop button */}
      <button
        onClick={onStop}
        className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
      >
        <X className="w-4 h-4" /> Stop
      </button>
    </div>
  );
};

export default BreathingSession;
