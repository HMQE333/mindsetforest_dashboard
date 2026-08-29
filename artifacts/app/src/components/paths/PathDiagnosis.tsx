import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Target, Check, X, HelpCircle } from "lucide-react";
import { Path, DiagnosisVerdict } from "@/lib/path-data";

interface Props {
  path: Path;
  /** True once every step is finished - the moment the prior gets graded. */
  finished: boolean;
  /** Incremented by the stall check to open this straight into edit mode. */
  editSignal?: number;
  onSetDiagnosis: (text: string) => void;
  onScore: (verdict: DiagnosisVerdict, actual?: string) => void;
}

/**
 * The written prior, and the one question that grades it.
 *
 * Both live here because they are the same sentence at two moments. Writing it
 * costs one line before the work; grading it costs one click after, and that
 * pairing is the only thing in the app that measures judgement rather than
 * activity. Everything is skippable - a prompt that blocks path creation would
 * stop paths being created, which is a worse failure than an unscored one.
 */
export default function PathDiagnosis({ path, finished, editSignal, onSetDiagnosis, onScore }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path.diagnosis || "");
  const [scoring, setScoring] = useState(false);
  const [actual, setActual] = useState("");

  useEffect(() => { if (editSignal) setEditing(true); }, [editSignal]);

  const submit = () => {
    const text = draft.trim();
    if (text && text !== path.diagnosis) onSetDiagnosis(text);
    setEditing(false);
  };

  // --- the prior has been graded: a small permanent record ---
  if (path.diagnosis && path.diagnosis_verdict) {
    const right = path.diagnosis_verdict === "right";
    const unknown = path.diagnosis_verdict === "unknown";
    return (
      <div className="mt-2.5 px-3 py-2 rounded-xl border border-white/8 bg-white/[0.02]">
        <div className="flex items-start gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${
            unknown
              ? "bg-white/10 text-muted-foreground"
              : right
                ? "bg-green-500/15 text-green-300"
                : "bg-amber-500/15 text-amber-300"
          }`}>
            {unknown ? "unclear" : right ? "called it" : "missed it"}
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed min-w-0">
            {path.diagnosis}
            {path.diagnosis_actual && (
              <span className="block mt-1 text-foreground/70">Actually: {path.diagnosis_actual}</span>
            )}
          </p>
        </div>
      </div>
    );
  }

  // --- path is finished and carries a prior: grade it ---
  if (finished && path.diagnosis) {
    return (
      <div className="mt-2.5 p-3 rounded-xl border border-primary/25 bg-primary/5">
        <p className="text-xs text-muted-foreground mb-1">You said the thing in the way was:</p>
        <p className="text-sm text-foreground mb-3 leading-snug">“{path.diagnosis}”</p>
        {!scoring ? (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onScore("right")}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20 transition-colors"
            >
              <Check className="h-3 w-3 inline mr-1" />It was
            </button>
            <button
              onClick={() => setScoring(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              <X className="h-3 w-3 inline mr-1" />It wasn't
            </button>
            <button
              onClick={() => onScore("unknown")}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-white/12 bg-white/[0.03] text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="h-3 w-3 inline mr-1" />Never found out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={actual}
              onChange={e => setActual(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") onScore("wrong", actual);
                if (e.key === "Escape") setScoring(false);
              }}
              placeholder="So what was it really?"
              className="flex-1 min-w-0 bg-background/60 border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              onClick={() => onScore("wrong", actual)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground flex-shrink-0"
            >
              Save
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- writing or rewriting the prior ---
  return (
    <AnimatePresence mode="wait">
      {editing ? (
        <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2.5">
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={submit}
            onKeyDown={e => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setDraft(path.diagnosis || ""); setEditing(false); }
            }}
            placeholder="The one thing actually in the way, in a sentence..."
            className="w-full bg-background/60 border border-primary/40 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            Not the goal - the obstacle. This is what gets checked when the path ends.
          </p>
        </motion.div>
      ) : (
        <motion.button
          key="view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setEditing(true)}
          className="mt-2.5 w-full text-left px-3 py-2 rounded-xl border border-dashed border-white/12 hover:border-primary/30 hover:bg-primary/[0.04] transition-colors group"
        >
          <span className="flex items-start gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
            <span className={`text-xs leading-relaxed min-w-0 ${path.diagnosis ? "text-foreground/80" : "text-muted-foreground"}`}>
              {path.diagnosis || "What's actually in the way? (optional, one line)"}
            </span>
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
