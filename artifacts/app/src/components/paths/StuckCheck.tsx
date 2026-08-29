import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { useAssistant } from "@/hooks/useAssistant";
import { Path, PathStep } from "@/lib/path-data";
import { ROUTES, Route, PARK_DAYS } from "@/lib/path-router";

interface Props {
  path: Path;
  step: PathStep;
  days: number;
  /** Rewrite the step to a smaller version of itself. */
  onShrink: (title: string) => void;
  /** Send the user to the diagnosis line - the constraint was wrong. */
  onRediagnose: () => void;
  /** Stop asking for this many days. Every answer buys some quiet. */
  onSnooze: (days: number) => void;
}

/**
 * The one place the app is allowed to nag, and it asks rather than tells.
 *
 * The routing is a fixed table, not a model call. Five of its six answers cost
 * nothing and change the plan locally; only "I don't know what to do" reaches
 * for outside help, which is the finding this whole check exists to test.
 */
export default function StuckCheck({ path, step, days, onShrink, onRediagnose, onSnooze }: Props) {
  const { openPanel, sendMessage } = useAssistant();
  const [picked, setPicked] = useState<Route | null>(null);
  const [text, setText] = useState("");

  const answer = (route: Route) => {
    if (route.kind === "park") { onSnooze(PARK_DAYS); return; }
    if (route.kind === "note") { onSnooze(3); return; }
    if (route.kind === "rediagnose") { onSnooze(3); onRediagnose(); return; }
    setPicked(route);
  };

  const submit = () => {
    const value = text.trim();
    if (!value || !picked) return;
    if (picked.kind === "inform") {
      openPanel();
      sendMessage(
        `I'm stuck on a path called "${path.name}". The step is "${step.title}" and it hasn't moved in ${days} days.` +
        (path.diagnosis ? ` I think the real obstacle is: ${path.diagnosis}.` : "") +
        ` The specific thing I need to know is: ${value}`,
      );
    } else {
      onShrink(value);
    }
    onSnooze(3);
    setPicked(null);
    setText("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="mt-2.5 p-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] overflow-hidden"
    >
      {!picked ? (
        <>
          <p className="text-xs text-foreground/85 mb-0.5 leading-snug">
            <span className="font-bold">“{step.title}”</span> hasn't moved in {days} days.
          </p>
          <p className="text-[11px] text-muted-foreground mb-2.5">What's in the way?</p>
          <div className="grid gap-1.5">
            {ROUTES.map(route => (
              <button
                key={route.id}
                onClick={() => answer(route)}
                className="text-left px-2.5 py-1.5 rounded-lg border border-white/8 bg-white/[0.02] hover:border-amber-500/30 hover:bg-amber-500/[0.06] transition-colors"
              >
                <span className="block text-xs text-foreground/90">{route.symptom}</span>
                <span className="block text-[10px] text-muted-foreground">{route.reads}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => { setPicked(null); setText(""); }}
            className="text-[10px] text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" /> back
          </button>
          <p className="text-xs text-foreground/80 leading-relaxed mb-2.5">{picked.verdict}</p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
              placeholder={
                picked.kind === "inform"
                  ? "The one question you need answered..."
                  : "The smaller version of this step..."
              }
              className="flex-1 min-w-0 bg-background/60 border border-white/12 rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-500/40"
            />
            <button
              onClick={submit}
              className="px-3 py-1.5 rounded-lg text-xs font-bold gradient-purple text-primary-foreground flex-shrink-0"
            >
              {picked.kind === "inform" ? "Ask" : "Replace"}
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
