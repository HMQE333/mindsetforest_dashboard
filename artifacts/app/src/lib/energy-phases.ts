import { Sprout, Zap, Moon } from "lucide-react";

/**
 * The three-beat working cycle shown on the dashboard: **Gather → Strike →
 * Reflect**. It is a mode you are in, not a task — Gather takes things in,
 * Strike is the execution beat where the actual output happens, Reflect closes
 * the loop. Naming the current beat keeps you from trying to do all three at
 * once.
 */
export type EnergyPhaseId = "gather" | "strike" | "reflect";

export interface EnergyPhase {
  id: EnergyPhaseId;
  label: string;
  icon: typeof Zap;
  /** One line, shown when the phase is active. */
  tagline: string;
  /** What belongs in this phase — shown on hover. */
  hint: string;
  /** Tailwind classes for the active pill. */
  active: string;
  /** Accent for the inactive icon. */
  accent: string;
}

export const ENERGY_PHASES: EnergyPhase[] = [
  {
    id: "gather",
    label: "Gather",
    icon: Sprout,
    tagline: "Take things in. Read, capture, prep, decide what matters.",
    hint: "Inputs, research, notes, tidying the runway. Nothing has to ship yet.",
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    accent: "text-emerald-300/70",
  },
  {
    id: "strike",
    label: "Strike",
    icon: Zap,
    tagline: "Execute. One thing, no new inputs, until it exists.",
    hint: "The output beat. No research, no reorganising — build the thing.",
    active: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    accent: "text-amber-300/70",
  },
  {
    id: "reflect",
    label: "Reflect",
    icon: Moon,
    tagline: "Close the loop. What worked, what to keep, what is next.",
    hint: "Review, log, adjust tomorrow's set. Cheap energy, high leverage.",
    active: "bg-violet-500/15 text-violet-300 border-violet-500/40",
    accent: "text-violet-300/70",
  },
];

export const PHASE_MAP: Record<EnergyPhaseId, EnergyPhase> = Object.fromEntries(
  ENERGY_PHASES.map((p) => [p.id, p]),
) as Record<EnergyPhaseId, EnergyPhase>;

export function nextPhase(id: EnergyPhaseId): EnergyPhaseId {
  const i = ENERGY_PHASES.findIndex((p) => p.id === id);
  return ENERGY_PHASES[(i + 1) % ENERGY_PHASES.length].id;
}

/**
 * Where the cycle most likely sits at this hour — used as the day's starting
 * phase so the chip is never wrong-footed first thing in the morning.
 */
export function suggestedPhase(date = new Date()): EnergyPhaseId {
  const hour = date.getHours();
  if (hour < 10) return "gather";
  if (hour < 20) return "strike";
  return "reflect";
}
