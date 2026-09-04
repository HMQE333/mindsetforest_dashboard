import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Sparkles, Loader2, Trash2, History, RefreshCw, FileText, Plus, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBoards } from "@/hooks/useBoards";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  usePlanSimulations, PlanSimulation as Simulation, PlanChatMessage,
} from "@/hooks/usePlanSimulations";
import { gatherPlanContext, ProductivityReadiness } from "@/lib/plan-context";
import { DEFAULT_AI_MODEL, aiModelLabel } from "@/lib/ai-model";
import { PlanOp, planStepCount } from "@/lib/plan-model";
import SimulationPlanView from "./SimulationPlanView";
import SimulationChat, { PendingEdit } from "./SimulationChat";
import SimulationHistory from "./SimulationHistory";

const SIZE_OPTIONS = [
  { steps: 40, label: "Tight", blurb: "~40 steps" },
  { steps: 80, label: "Full", blurb: "~80 steps" },
  { steps: 140, label: "Exhaustive", blurb: "~140 steps" },
];

interface Props {
  boardId: string | null;
  onBack: () => void;
}

export default function PlanningSimulation({ boardId, onBack }: Props) {
  const { user } = useAuth();
  const { boards } = useBoards();
  const { preferences } = useUserSettings();
  const modelChoice = preferences.aiModel || DEFAULT_AI_MODEL;
  const board = boards.find((b) => b.id === boardId);

  const {
    simulations, loading, generate, regenerate, createEmpty, applyPlanOps,
    listVersions, restoreVersion, deleteSimulation, loadChat, saveChatMessage, askAssistant,
  } = usePlanSimulations(boardId ?? undefined);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [size, setSize] = useState(80);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [messages, setMessages] = useState<PlanChatMessage[]>([]);
  const [chatPhase, setChatPhase] = useState<"idle" | "researching" | "thinking">("idle");
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [readiness, setReadiness] = useState<ProductivityReadiness | null>(null);

  const active = useMemo(() => simulations.find((s) => s.id === activeId) || null, [simulations, activeId]);

  // Load the chat when a simulation is opened.
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    let cancelled = false;
    loadChat(activeId).then((m) => { if (!cancelled) setMessages(m); });
    setPending(null);
    setHighlightIds(new Set());
    return () => { cancelled = true; };
  }, [activeId, loadChat]);

  // Tell the user up front whether their productivity history is in play.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    gatherPlanContext(user.id).then((r) => { if (!cancelled) setReadiness(r.readiness); }).catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  const handleGenerate = async () => {
    if (!brief.trim() || !user) return;
    setGenerating(true);
    try {
      const { text } = await gatherPlanContext(user.id, [], brief);
      const sim = await generate({
        brief: brief.trim(),
        boardName: board?.name,
        context: text,
        modelChoice,
        targetSteps: size,
      });
      if (sim) {
        setActiveId(sim.id);
        setBrief("");
        const counts = planStepCount(sim.plan);
        toast.success("Simulation ready", { description: `${counts.unique} steps across ${sim.plan.phases.length} phases.` });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!active || !user) return;
    setRegenerating(true);
    try {
      const { text } = await gatherPlanContext(user.id, [], active.brief);
      const ok = await regenerate(active, { context: text, modelChoice, targetSteps: size });
      if (ok) toast.success("Regenerated", { description: "A different walk through the same goal. Undo it from the history." });
    } finally {
      setRegenerating(false);
    }
  };

  /** Manual edits (drag, rename, check) go straight in — history covers undo. */
  const handleOps = useCallback(async (ops: PlanOp[], label: string) => {
    if (!active) return;
    await applyPlanOps(active, ops, label, "manual");
  }, [active, applyPlanOps]);

  const handleSend = async (text: string) => {
    if (!active || !user) return;
    const userMsg = await saveChatMessage(active.id, { role: "user", content: text });
    if (userMsg) setMessages((prev) => [...prev, userMsg]);
    setPending(null);

    setChatPhase("researching");
    try {
      const { text: context } = await gatherPlanContext(user.id, [], text);
      setChatPhase("thinking");
      const result = await askAssistant({
        sim: active,
        message: text,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        context,
        modelChoice,
      });
      if (!result) return;

      const saved = await saveChatMessage(active.id, {
        role: "assistant",
        content: result.reply || (result.ops.length > 0 ? "Here is what I would change." : ""),
        research: result.research || null,
        ops: null,
      });
      if (saved) setMessages((prev) => [...prev, saved]);
      if (result.ops.length > 0) setPending({ ops: result.ops, reply: result.reply });
    } finally {
      setChatPhase("idle");
    }
  };

  const applyPending = async () => {
    if (!active || !pending) return;
    const result = await applyPlanOps(active, pending.ops, "Assistant edit", "ai");
    const touched = new Set<string>();
    for (const op of result.applied) {
      const id = (op as { id?: string }).id;
      if (id) touched.add(id);
    }
    setHighlightIds(touched);
    setPending(null);
    toast.success(`${result.applied.length} change${result.applied.length === 1 ? "" : "s"} applied`, {
      description: "Undo it any time from the history.",
    });
  };

  /* ------------------------------------------------------------ render --- */

  if (!boardId) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Open a board to simulate it.
      </div>
    );
  }

  if (active) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setActiveId(null)} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-primary transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-bold text-foreground flex-1 min-w-0 truncate">{active.title}</h2>
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            <History className="h-3.5 w-3.5" /> History
          </button>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-40 transition-all"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regenerate
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
          <SimulationPlanView plan={active.plan} highlightIds={highlightIds} onOps={handleOps} />
          <SimulationChat
            sim={active}
            messages={messages}
            phase={chatPhase}
            modelChoice={modelChoice}
            readiness={readiness}
            pending={pending}
            onSend={handleSend}
            onApply={applyPending}
            onDiscard={() => setPending(null)}
          />
        </div>

        <AnimatePresence>
          {showHistory && (
            <SimulationHistory
              sim={active}
              load={listVersions}
              onRestore={(v) => restoreVersion(active, v)}
              onClose={() => setShowHistory(false)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-primary transition-all">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{board ? `${board.emoji} ${board.name}` : "Simulation"}</h2>
          <p className="text-xs text-muted-foreground">The whole project, every decision already made.</p>
        </div>
      </div>

      {/* Generator */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground flex-1">Simulate a project</h3>
          <span className="text-[10px] text-muted-foreground font-mono">{aiModelLabel(modelChoice)}</span>
        </div>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the thing you want to do — as big as you like. It comes back as concrete steps and repeated loops, with the decisions made for you."
          rows={3}
          className="w-full text-sm bg-muted/30 border border-white/10 rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 resize-none"
        />
        <div className="flex items-center gap-2 flex-wrap">
          {SIZE_OPTIONS.map((o) => (
            <button
              key={o.steps}
              onClick={() => setSize(o.steps)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                size === o.steps ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label} <span className="font-mono font-normal opacity-70">{o.blurb}</span>
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={handleGenerate}
            disabled={generating || !brief.trim()}
            className="flex items-center gap-2 h-9 px-4 rounded-xl text-xs font-bold gradient-purple text-primary-foreground glow-sm disabled:opacity-40"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Simulating..." : "Simulate"}
          </button>
        </div>
        {readiness && !readiness.enough && (
          <p className="text-[11px] text-muted-foreground/70">
            Your productivity history is left out until there is enough of it — the plan will not assume anything about your consistency.
          </p>
        )}
      </div>

      {/* Existing simulations */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Simulations on this board</h3>
          <button
            onClick={async () => {
              const sim = await createEmpty("New simulation");
              if (sim) setActiveId(sim.id);
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Blank
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        ) : simulations.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Nothing simulated yet. Describe a project above and it will come back split into steps and loops.
          </p>
        ) : (
          <div className="space-y-1.5">
            {simulations.map((sim: Simulation) => {
              const counts = planStepCount(sim.plan);
              return (
                <div key={sim.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 border border-white/5 transition-all">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button onClick={() => setActiveId(sim.id)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-foreground truncate">{sim.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {counts.unique} steps · {sim.plan.phases.length} phases
                      {counts.expanded !== counts.unique ? ` · ${counts.expanded} with loops` : ""}
                    </p>
                  </button>
                  <button
                    onClick={() => deleteSimulation(sim.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
