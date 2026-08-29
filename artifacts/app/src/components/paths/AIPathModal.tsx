import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logSuggestions, localMoment } from "@/hooks/useUserContext";
import { Sparkles, X } from "lucide-react";

export interface DraftedStep {
  title: string;
  /** Separate days this step should be repeated. 1 = do it once. */
  days: number;
  xp: number;
  stage?: string | null;
  reason?: string;
}

interface Props {
  pathName: string;
  categoryName?: string;
  existingSteps: string[];
  onApply: (steps: DraftedStep[], diagnosis: string | null) => Promise<void> | void;
  onClose: () => void;
}

/**
 * One field, one button. The old ladder modal asked for mode, horizon, levels,
 * tasks-per-level and constraints before it would produce anything; everything
 * that used to be a control here is inferred from the user's saved context.
 */
export default function AIPathModal({ pathName, categoryName, existingSteps, onApply, onClose }: Props) {
  const { user } = useAuth();
  const [aim, setAim] = useState("");
  const [steps, setSteps] = useState<DraftedStep[]>([]);
  // The model's read on what is actually in the way. Editable before it lands,
  // because approving a sentence is cheap and composing one is not.
  const [diagnosis, setDiagnosis] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-path-suggest", {
        body: {
          pathName,
          categoryName: categoryName || undefined,
          aim: aim.trim() || undefined,
          existingSteps,
          moment: localMoment(),
        },
      });
      if (fnError) throw fnError;
      const drafted = (data?.steps || []) as DraftedStep[];
      setSteps(drafted);
      setDiagnosis(typeof data?.diagnosis === "string" ? data.diagnosis : "");
      setPicked(new Set(drafted.map((_, i) => i)));
    } catch (e) {
      console.error("AI path suggestion failed:", e);
      setError("Could not reach the planner. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [pathName, categoryName, aim, existingSteps]);

  const toggle = (i: number) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const apply = async () => {
    setApplying(true);
    if (user) {
      logSuggestions(user.id, steps.map((s, i) => ({
        scope: "path" as const,
        title: s.title,
        detail: { days: s.days, xp: s.xp, path: pathName },
        accepted: picked.has(i),
      })));
    }
    await onApply(steps.filter((_, i) => picked.has(i)), diagnosis.trim() || null);
    setApplying(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.99, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[560px] rounded-2xl border border-white/14 bg-background/95 overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-foreground">Draft steps · {pathName}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {steps.length === 0 ? (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">
                  What does &quot;good&quot; look like here? (optional)
                </label>
                <textarea
                  value={aim}
                  onChange={e => setAim(e.target.value)}
                  rows={3}
                  placeholder="e.g. hold a conversation in Spanish without freezing"
                  className="w-full bg-background/60 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40 resize-none"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                onClick={generate}
                disabled={loading}
                className="w-full py-3 rounded-xl gradient-purple text-primary-foreground font-bold glow-sm hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0"
              >
                {loading ? "Thinking..." : "✨ Draft the path"}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {diagnosis && (
                <div className="mb-3 p-3 rounded-xl border border-primary/25 bg-primary/[0.06]">
                  <p className="text-[10px] uppercase tracking-wider text-primary/80 font-bold mb-1.5">
                    What it thinks is actually in the way
                  </p>
                  <textarea
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    rows={2}
                    className="w-full bg-transparent text-sm text-foreground outline-none resize-none leading-snug"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Saved with the path and checked when it ends. Edit it if it is wrong - that is the point.
                  </p>
                </div>
              )}
              {steps.map((s, i) => (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                    picked.has(i) ? "border-primary/40 bg-primary/10" : "border-white/8 bg-white/[0.02] opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm flex-1 text-foreground">{s.title}</span>
                    {s.days > 1 && (
                      <span className="text-[11px] font-mono text-muted-foreground flex-shrink-0">×{s.days} days</span>
                    )}
                    <span className="text-[11px] font-bold text-primary flex-shrink-0">{s.xp} XP</span>
                  </div>
                  {s.reason && <p className="text-[11px] text-muted-foreground mt-1">{s.reason}</p>}
                </button>
              ))}
            </div>
          )}
        </div>

        {steps.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-4 border-t border-white/10">
            <button
              onClick={() => { setSteps([]); setPicked(new Set()); }}
              className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-muted-foreground hover:text-foreground transition-all"
            >
              Redo
            </button>
            <button
              onClick={apply}
              disabled={picked.size === 0 || applying}
              className="flex-1 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold glow-sm hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:translate-y-0"
            >
              {applying ? "Adding..." : `Add ${picked.size} step${picked.size === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
