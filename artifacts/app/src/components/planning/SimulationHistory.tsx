import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Undo2, History, Loader2 } from "lucide-react";
import { PlanSimulation, PlanVersion } from "@/hooks/usePlanSimulations";
import { planStepCount } from "@/lib/plan-model";

interface Props {
  sim: PlanSimulation;
  load: (simulationId: string) => Promise<PlanVersion[]>;
  onRestore: (version: PlanVersion) => Promise<void> | void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SimulationHistory({ sim, load, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<PlanVersion[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load(sim.id).then((v) => { if (!cancelled) setVersions(v); });
    return () => { cancelled = true; };
  }, [sim.id, load]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="glass-card w-full max-w-lg p-5 space-y-3 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <h3 className="text-base font-bold text-foreground flex-1">Recent changes</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Each entry is the plan as it was <em>before</em> that change. Restoring one undoes everything after it.
        </p>

        {versions === null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading history...
          </div>
        )}

        {versions?.length === 0 && (
          <p className="text-sm text-muted-foreground py-6 text-center">No changes yet.</p>
        )}

        <div className="space-y-1.5">
          {versions?.map((v) => {
            const counts = planStepCount(v.plan);
            return (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/30 border border-white/10">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{v.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {timeAgo(v.created_at)} · {v.source === "ai" ? "assistant" : v.source} · {counts.unique} steps
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setRestoring(v.id);
                    await onRestore(v);
                    setRestoring(null);
                    onClose();
                  }}
                  disabled={restoring !== null}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-40 transition-all"
                >
                  {restoring === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                  Restore
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
