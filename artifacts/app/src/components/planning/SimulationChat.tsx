import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Search, Sparkles, Check, X, Loader2, Brain, ChevronDown, ChevronRight } from "lucide-react";
import { PlanOp, describeOp } from "@/lib/plan-model";
import { PlanSimulation, PlanChatMessage } from "@/hooks/usePlanSimulations";
import { ProductivityReadiness } from "@/lib/plan-context";
import { aiModelLabel, AIModelChoice } from "@/lib/ai-model";

type Phase = "idle" | "researching" | "thinking";

export interface PendingEdit {
  ops: PlanOp[];
  reply: string;
}

interface Props {
  sim: PlanSimulation;
  messages: PlanChatMessage[];
  phase: Phase;
  modelChoice: AIModelChoice;
  readiness: ProductivityReadiness | null;
  pending: PendingEdit | null;
  onSend: (message: string) => void;
  onApply: () => void;
  onDiscard: () => void;
}

const SUGGESTIONS = [
  "Split phase 2 into smaller steps",
  "This is too much for one week — stretch it",
  "Move the setup steps to the end",
  "Turn the review steps into a weekly loop",
];

export default function SimulationChat({
  sim, messages, phase, modelChoice, readiness, pending, onSend, onApply, onDiscard,
}: Props) {
  const [input, setInput] = useState("");
  const [openResearch, setOpenResearch] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, phase, pending]);

  const busy = phase !== "idle";

  const send = () => {
    if (!input.trim() || busy) return;
    onSend(input.trim());
    setInput("");
  };

  const toggleResearch = (id: string) => {
    setOpenResearch((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="glass-card flex flex-col h-[70vh] lg:h-[calc(100vh-13rem)] lg:sticky lg:top-4">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-foreground flex-1">Talk to this plan</h3>
        <span className="text-[10px] text-muted-foreground font-mono">{aiModelLabel(modelChoice)}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              It reads the plan and your own data first, then proposes changes to individual steps — you approve them before anything is saved.
            </p>
            {readiness && !readiness.enough && (
              <p className="text-[11px] text-muted-foreground/70 border border-white/10 rounded-xl p-2.5">
                Your productivity history is not included yet ({readiness.activeDays} active day
                {readiness.activeDays === 1 ? "" : "s"} so far), so the assistant will not draw conclusions about your consistency.
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-primary/10 text-muted-foreground hover:text-foreground border border-white/10 transition-all text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md gradient-purple text-primary-foreground text-sm">
                {m.content}
              </div>
            ) : (
              <div className="space-y-1.5">
                {m.research && (
                  <div className="rounded-xl border border-white/10 bg-muted/20">
                    <button
                      onClick={() => toggleResearch(m.id)}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
                    >
                      {openResearch.has(m.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <Brain className="h-3 w-3" /> Research notes
                    </button>
                    {openResearch.has(m.id) && (
                      <pre className="px-2.5 pb-2 text-[11px] text-muted-foreground whitespace-pre-wrap font-sans">{m.research}</pre>
                    )}
                  </div>
                )}
                <div className="text-sm text-foreground whitespace-pre-wrap">{m.content}</div>
                {m.ops && m.ops.length > 0 && (
                  <p className="text-[11px] text-emerald-300/80">{m.ops.length} change{m.ops.length === 1 ? "" : "s"} applied</p>
                )}
              </div>
            )}
          </div>
        ))}

        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              {phase === "researching" ? <Search className="h-3.5 w-3.5 animate-pulse" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {phase === "researching" ? "Researching your plan and data..." : "Working out the smallest change..."}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Proposed diff */}
        <AnimatePresence>
          {pending && pending.ops.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2"
            >
              <p className="text-[11px] font-bold text-primary">Proposed changes</p>
              <ul className="space-y-1">
                {pending.ops.map((op, i) => {
                  const d = describeOp(op, sim.plan);
                  const color = d.verb === "add"
                    ? "text-emerald-300"
                    : d.verb === "remove"
                      ? "text-rose-300"
                      : d.verb === "move"
                        ? "text-cyan-300"
                        : "text-amber-300";
                  const sign = d.verb === "add" ? "+" : d.verb === "remove" ? "−" : d.verb === "move" ? "↕" : "~";
                  return (
                    <li key={i} className="text-xs flex gap-2">
                      <span className={`font-mono font-bold ${color}`}>{sign}</span>
                      <span className="text-foreground/90">{d.text}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onApply}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold gradient-purple text-primary-foreground glow-sm"
                >
                  <Check className="h-3.5 w-3.5" /> Apply
                </button>
                <button
                  onClick={onDiscard}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5"
                >
                  <X className="h-3.5 w-3.5" /> Discard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about the plan, or ask for a change..."
            rows={2}
            disabled={busy}
            className="flex-1 text-sm bg-muted/30 border border-white/10 rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="h-10 w-10 rounded-xl gradient-purple text-primary-foreground flex items-center justify-center disabled:opacity-40 glow-sm"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
