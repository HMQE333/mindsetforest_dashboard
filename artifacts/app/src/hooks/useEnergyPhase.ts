import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { EnergyPhaseId, nextPhase, suggestedPhase } from "@/lib/energy-phases";

interface StoredPhase {
  date: string;
  phase: EnergyPhaseId;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The current beat of the Gather → Strike → Reflect cycle.
 *
 * It is a per-day, per-device note rather than synced state: it says what you
 * are doing *right now*, so it is kept in localStorage and resets to the
 * hour-appropriate phase when the day rolls over.
 */
export function useEnergyPhase() {
  const { user } = useAuth();
  const storageKey = `mf_energy_phase_${user?.id ?? "anon"}`;
  const [phase, setPhaseState] = useState<EnergyPhaseId>(() => suggestedPhase());
  const [manual, setManual] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const stored = raw ? (JSON.parse(raw) as StoredPhase) : null;
      if (stored && stored.date === todayISO() && stored.phase) {
        setPhaseState(stored.phase);
        setManual(true);
        return;
      }
    } catch {
      // A blocked or corrupt store just means we fall back to the suggestion.
    }
    setPhaseState(suggestedPhase());
    setManual(false);
  }, [storageKey]);

  const setPhase = useCallback((next: EnergyPhaseId) => {
    setPhaseState(next);
    setManual(true);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ date: todayISO(), phase: next } satisfies StoredPhase));
    } catch {
      // Not persisting is survivable — the phase still applies for this session.
    }
  }, [storageKey]);

  const advance = useCallback(() => setPhase(nextPhase(phase)), [phase, setPhase]);

  return { phase, setPhase, advance, /** false until the user has picked one today */ manual };
}
