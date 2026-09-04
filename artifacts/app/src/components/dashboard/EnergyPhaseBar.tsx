import { AnimatePresence, motion } from "framer-motion";
import { ENERGY_PHASES, PHASE_MAP } from "@/lib/energy-phases";
import { useEnergyPhase } from "@/hooks/useEnergyPhase";

/**
 * Slim Gather → Strike → Reflect selector for the main dashboard view.
 * Tap a beat to switch to it; the active one shows its one-line prompt.
 */
export default function EnergyPhaseBar() {
  const { phase, setPhase, manual } = useEnergyPhase();
  const current = PHASE_MAP[phase];

  return (
    <div className="max-w-5xl mx-auto mb-3">
      <div className="glass-card px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {ENERGY_PHASES.map((p, i) => {
            const Icon = p.icon;
            const isActive = p.id === phase;
            return (
              <div key={p.id} className="flex items-center">
                {i > 0 && <span className="text-muted-foreground/30 text-xs px-0.5">›</span>}
                <button
                  onClick={() => setPhase(p.id)}
                  title={`${p.label} — ${p.hint}`}
                  className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-bold border transition-all ${
                    isActive ? p.active : `border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5`
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${isActive ? "" : p.accent}`} />
                  {p.label}
                </button>
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={phase}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-muted-foreground flex-1 min-w-0 truncate"
          >
            {current.tagline}
          </motion.p>
        </AnimatePresence>

        {!manual && (
          <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">suggested</span>
        )}
      </div>
    </div>
  );
}
