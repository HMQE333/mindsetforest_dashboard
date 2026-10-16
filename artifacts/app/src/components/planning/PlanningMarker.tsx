import { Check } from "lucide-react";
import type { LineKind, NodeState } from "@/lib/planning-model";

/**
 * The one glyph that says what a planning row is waiting for:
 *   ○ a Step to do      ✓ a ticked Step
 *   ? a Question        = a settled Question (or a rule)
 * Dropped rows keep their kind's glyph, faded and dashed. "note" (paste preview
 * only) is a line that goes into its parent's notes, not a node.
 */
export type MarkerLook = { ask: boolean; state: NodeState } | { note: true };

/** The look of a parsed line (paste preview, add box). */
export function lookOfLine(kind: LineKind): MarkerLook {
  if (kind === "note") return { note: true };
  if (kind === "settled") return { ask: true, state: "settled" };
  return { ask: kind === "question", state: "open" };
}

interface Props {
  look: MarkerLook;
  /** Held by an open Question above it: drawn muted. */
  waiting?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

export default function PlanningMarker({ look, waiting, onClick, title, className = "" }: Props) {
  let body: React.ReactNode;
  let tone: string;
  if ("note" in look) {
    tone = "border border-white/15 text-muted-foreground rounded-md";
    body = <span className="text-[11px] font-bold leading-none">›</span>;
  } else if (look.state === "done") {
    tone = "gradient-purple border border-transparent text-primary-foreground rounded-full";
    body = <Check className="h-3 w-3" />;
  } else if (look.state === "settled") {
    tone = "border border-emerald-400/60 bg-emerald-500/15 text-emerald-300 rounded-full";
    body = <span className="text-[12px] font-bold leading-none">=</span>;
  } else if (look.ask) {
    tone = `border ${look.state === "dropped" ? "border-dashed" : ""} border-amber-400/70 text-amber-300 rounded-full`;
    body = <span className="text-[12px] font-bold leading-none">?</span>;
  } else {
    tone = `border-2 ${look.state === "dropped" ? "border-dashed" : ""} border-primary/60 rounded-full`;
    body = null;
  }
  const faded = ("state" in look && look.state === "dropped") ? "opacity-40" : waiting ? "opacity-50" : "";
  const cls = `flex-shrink-0 h-5 w-5 flex items-center justify-center transition-all ${tone} ${faded} ${className}`;
  if (!onClick) return <span className={cls} title={title} aria-hidden={!title}>{body}</span>;
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={`${cls} hover:scale-110`}>
      {body}
    </button>
  );
}
