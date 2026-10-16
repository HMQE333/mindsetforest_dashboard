import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type Connection,
  useNodesState, useEdgesState,
  Handle, Position,
  type NodeProps, MarkerType, BackgroundVariant,
  ReactFlowProvider, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Plus, Trash2, X, Ban, RotateCcw, LayoutGrid, Maximize2, Minimize2, MessageSquare, HelpCircle } from "lucide-react";
import { usePlanningState, type PlanningTask } from "@/hooks/usePlanningState";
import type { PlanningBoard } from "@/hooks/useBoards";
import {
  childrenMap,
  descendants,
  frontier,
  isWaiting,
  nextPerRoot,
  openDescendants,
  parseLine,
  parsePaste,
  placeholderFor,
  recordIds,
  stateOf,
  titleSettle,
  PLACEHOLDERS,
  type LineKind,
  type PasteRow,
  type Verdict,
} from "@/lib/planning-model";
import { answerChoices, childCounts, matchChoice, openLoopIds, rowTails } from "@/lib/planning-list";
import { findFreeSpot, layoutMap, movedSubtrees, NODE_H, NODE_W, type LayoutOptions, type XY } from "@/lib/planning-map-layout";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PlanningNodeDetail from "./PlanningNodeDetail";
import PlanningMarker from "./PlanningMarker";
import PlanningPastePreview from "./PlanningPastePreview";
import { navigateToMention } from "./PlanningMentions";
import { reopenNode } from "./planning-reopen";
import { toast } from "@/hooks/use-toast";

/* ── Two kinds, two colours ──────────────────────────────────
 * A Step waits to be done (the app's primary), a Question waits to be answered
 * (amber), as on the List's markers. Closed nodes (done, settled, dropped) are
 * faded; the frontier glows with the app's gradient. Nothing else is
 * colour-coded. `color` is a CSS colour so edges and the minimap follow the theme. */
const KIND = {
  step: { label: "Step", color: "hsl(var(--primary))", faded: "hsl(var(--primary) / 0.35)", bar: "from-primary to-violet-400", border: "border-primary/40" },
  question: { label: "Question", color: "#f59e0b", faded: "rgba(245, 158, 11, 0.35)", bar: "from-amber-400 to-orange-500", border: "border-amber-400/45" },
} as const;
const kindOf = (t: { ask: boolean }) => (t.ask ? KIND.question : KIND.step);

const KIND_HINT: Record<LineKind, string> = {
  step: "Step",
  question: "Question",
  settled: "Settled",
  note: "Note for the parent",
};

function extractDomain(url: string): string {
  try { return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return url; }
}
function openUrl(url: string) {
  window.open(url.startsWith("http") ? url : `https://${url}`, "_blank", "noopener,noreferrer");
}

const isOpenNode = (t: PlanningTask) => !t.done && !t.dropped;

/* ── Node data ───────────────────────────────────────────────── */
interface NodeCallbacks {
  onAdd: (parentId: string | null, text: string) => Promise<void>;
  onPaste: (parentId: string | null, text: string) => void;
  onToggle: (id: string) => void;
  onSettle: (id: string, answer: string) => Promise<boolean>;
  onSettleWithChild: (id: string, childId: string) => Promise<boolean>;
  onVerdict: (id: string, verdict: Verdict) => void;
  onDelete: (id: string) => void;
  onDrop: (id: string) => void;
  /** Resolves true when the title was saved. */
  onRename: (id: string, title: string) => Promise<boolean>;
  onSelect: (id: string) => void;
  /** Keeps a node in the Open loops view while its answer box is open (it may settle and leave the frontier). */
  onHold: (id: string, held: boolean) => void;
}

type TaskNodeData = {
  task: PlanningTask;
  frontier: boolean;
  waiting: boolean;
  next: boolean;
  record: boolean;
  childTotal: number;
  childClosed: number;
  /** Open direct children with no tick history: one-tap answers when settling (answerChoices). */
  options: PlanningTask[];
  touch: boolean;
  cb: NodeCallbacks;
};
type BoardNodeData = { board: PlanningBoard; cb: NodeCallbacks };

type TaskFlowNode = Node<TaskNodeData, "taskNode">;
type BoardFlowNode = Node<BoardNodeData, "boardNode">;
type FlowNode = TaskFlowNode | BoardFlowNode;

const BOARD_NODE = "board";
const nodeIdOf = (taskId: string) => `node-${taskId}`;
const taskIdOf = (nodeId: string) => (nodeId.startsWith("node-") ? nodeId.slice(5) : null);

/** Raises a node above its neighbours while one of its popovers is open. */
function useRaiseWhile(nodeId: string, raised: boolean) {
  const { updateNode } = useReactFlow();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    updateNode(nodeId, { zIndex: raised ? 1000 : 0 });
  }, [raised, nodeId, updateNode]);
}

/* ── One text box: parseLine decides the kind ────────────────── */
function AddBox({ placeholder, root = false, onSubmit, onPaste, onClose }: {
  placeholder: string;
  /** A new root: a note line has no parent to go to, so it becomes a step. */
  root?: boolean;
  onSubmit: (text: string) => Promise<void>;
  onPaste: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const parsed = text.trim() ? parseLine(text).kind : null;
  const kind = root && parsed === "note" ? "step" : parsed;

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    await onSubmit(t);
    setBusy(false);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="nodrag nowheel nopan w-64 rounded-xl border border-white/10 bg-background/95 backdrop-blur-xl p-3 shadow-lg" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit(); if (e.key === "Escape") onClose(); }}
        onPaste={e => {
          // A multi-line paste opens the paste preview (one insertTree on Insert).
          const pasted = e.clipboardData.getData("text");
          if (/\n/.test(pasted.trim())) {
            e.preventDefault();
            onPaste(pasted);
            onClose();
          }
        }}
        placeholder={placeholder}
        className="w-full bg-muted/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
      />
      <div className="flex items-center justify-between gap-2 mt-2">
        <span className="text-[10px] text-muted-foreground truncate">
          {kind ? <>Adds a <span className="font-semibold text-foreground/80">{KIND_HINT[kind]}</span></> : "End with ? to ask · ~ guess · = answer"}
        </span>
        <div className="flex gap-1 flex-shrink-0">
          <button onClick={() => void submit()} disabled={!text.trim() || busy} className="text-[10px] font-medium px-2.5 py-1 rounded-lg gradient-purple text-primary-foreground disabled:opacity-50">Add</button>
          <button onClick={onClose} className="px-1.5 py-1 rounded-lg bg-muted/30 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-3 w-3" /></button>
        </div>
      </div>
    </div>
  );
}

/* ── Settling a question: an answer line, or one tap on an option ── */
function AnswerBox({ task, options, initialPhase = "answer", onSettle, onSettleWithChild, onVerdict, onClose }: {
  task: PlanningTask;
  options: PlanningTask[];
  /** "verdict" when the question was just settled elsewhere (a "= answer" typed into its title). */
  initialPhase?: "answer" | "verdict";
  onSettle: (answer: string) => Promise<boolean>;
  onSettleWithChild: (childId: string) => Promise<boolean>;
  onVerdict: (v: Verdict) => void;
  onClose: () => void;
}) {
  // A reopened question keeps its old answer: it comes back prefilled.
  const [text, setText] = useState(task.outcome ?? "");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"answer" | "verdict">(initialPhase);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const after = (ok: boolean) => {
    setBusy(false);
    if (!ok) return;
    // A written guess is graded once, right after the answer (skippable).
    if (task.guess) setPhase("verdict"); else onClose();
  };
  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    // Typing an option's own words is the same as tapping it (the others become "chosen over").
    const picked = matchChoice(t, options);
    after(await (picked ? onSettleWithChild(picked.id) : onSettle(t)));
  };
  const pick = async (childId: string) => {
    if (busy) return;
    setBusy(true);
    after(await onSettleWithChild(childId));
  };

  return (
    <div className="nodrag nowheel nopan w-64 rounded-xl border border-amber-400/25 bg-background/95 backdrop-blur-xl p-3 shadow-lg" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
      {phase === "answer" ? (
        <>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) void submit(); if (e.key === "Escape") onClose(); }}
            placeholder="The answer, in one line…"
            className="w-full bg-muted/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-amber-400/50"
          />
          {options.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Or pick one</p>
              <div className="flex flex-wrap gap-1">
                {options.map(o => (
                  <button key={o.id} onClick={() => void pick(o.id)} disabled={busy} className="max-w-full truncate text-[10px] px-2 py-1 rounded-md border border-amber-400/25 bg-amber-400/[0.06] text-foreground/90 hover:bg-amber-400/15 transition-colors">
                    {o.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-1 mt-2">
            <button onClick={() => void submit()} disabled={!text.trim() || busy} className="text-[10px] font-medium px-2.5 py-1 rounded-lg gradient-purple text-primary-foreground disabled:opacity-50">Settle</button>
            <button onClick={onClose} className="px-1.5 py-1 rounded-lg bg-muted/30 text-muted-foreground hover:text-foreground" aria-label="Close"><X className="h-3 w-3" /></button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground mb-1">You guessed:</p>
          <p className="text-xs text-foreground mb-2.5 leading-snug">“{task.guess}”</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { onVerdict("right"); onClose(); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"><Check className="h-3 w-3 inline mr-1" />It held</button>
            <button onClick={() => { onVerdict("wrong"); onClose(); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"><X className="h-3 w-3 inline mr-1" />It didn't</button>
            <button onClick={() => { onVerdict("unknown"); onClose(); }} className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-white/12 bg-white/[0.03] text-muted-foreground hover:text-foreground transition-colors"><HelpCircle className="h-3 w-3 inline mr-1" />Can't tell</button>
          </div>
          <button onClick={onClose} className="mt-2 text-[10px] text-muted-foreground hover:text-foreground">Skip</button>
        </>
      )}
    </div>
  );
}

/* ── Inline Title Editor ─────────────────────────────────────── */
function InlineEditor({ value, onSave, onCancel }: { value: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && text.trim() && text.trim() !== value) onSave(text.trim()); else onCancel();
  };
  return (
    <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true); if (e.key === "Escape") finish(false); }} onBlur={() => finish(true)} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} className="nodrag w-full bg-transparent border-b border-primary/50 text-xs font-medium text-foreground outline-none py-0.5" />
  );
}

/* ── Task Node ─────────────────────────────────────────────── */
function TaskNode({ id, data }: NodeProps<TaskFlowNode>) {
  const { task, cb, touch } = data;
  const kind = kindOf(task);
  const state = stateOf(task);
  const closed = state !== "open";
  const [showAdd, setShowAdd] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answerPhase, setAnswerPhase] = useState<"answer" | "verdict">("answer");
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  // A click opens Details a moment later, so a double-click can still edit: the
  // sheet opened by the first click would otherwise take the second one.
  const selectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSelect = () => { if (selectTimer.current) { clearTimeout(selectTimer.current); selectTimer.current = null; } };
  useEffect(() => cancelSelect, []);
  useRaiseWhile(id, showAdd || showAnswer);
  // While the answer box is open the node must not leave the Open loops view,
  // or settling it would unmount the box before the guess is graded.
  const { onHold } = cb;
  useEffect(() => {
    if (!showAnswer) return;
    onHold(task.id, true);
    return () => onHold(task.id, false);
  }, [showAnswer, task.id, onHold]);
  const openAnswer = (phase: "answer" | "verdict") => { setAnswerPhase(phase); setShowAnswer(true); setShowAdd(false); };
  const mentions = (Array.isArray(task.mentions) ? task.mentions : []).filter(m => m?.kind === "path");
  const visibleMentions = mentions.slice(0, 2);
  const hiddenCount = mentions.length - visibleMentions.length;
  const showActions = (hovered || touch) && !editing;
  const domain = task.url ? extractDomain(task.url) : "";

  // The same muted tails as the List: "~ guess" (with its grade), "= answer", "→ Home: …", why it was dropped.
  const verdictMark = task.verdict === "right" ? " ✓" : task.verdict === "wrong" ? " ✗" : task.verdict === "unknown" ? " ·?" : "";
  const tails = rowTails(task).map(t =>
    t.kind === "guess" ? { text: `~ ${t.text}${verdictMark}`, tone: "text-muted-foreground" }
    : t.kind === "answer" ? { text: `= ${t.text}`, tone: "text-foreground/70" }
    : { text: t.text, tone: "text-muted-foreground" });

  const card = (
    <div
      className={`relative px-3.5 py-2.5 rounded-xl border bg-background/95 backdrop-blur-md min-w-[160px] max-w-[230px] transition-all duration-200 ${data.frontier ? "border-transparent" : kind.border} ${closed ? "opacity-50" : data.waiting ? "opacity-60" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={e => { e.stopPropagation(); cancelSelect(); setEditing(true); }}
      onClick={e => {
        e.stopPropagation();
        if (editing || e.detail > 1) return;
        cancelSelect();
        selectTimer.current = setTimeout(() => { selectTimer.current = null; cb.onSelect(task.id); }, 250);
      }}
    >
      <div className={`absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-r ${kind.bar}`} />
      {data.next && (
        <span className="absolute -top-2.5 left-2 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider gradient-purple text-primary-foreground">next</span>
      )}
      {showActions && (
        <div className="absolute -top-2 -right-2 flex gap-1 z-10">
          {task.ask && state === "open" ? (
            <button onClick={e => { e.stopPropagation(); if (showAnswer) setShowAnswer(false); else openAnswer("answer"); }} className="w-5 h-5 rounded-full bg-muted border border-amber-400/40 text-amber-500 hover:text-foreground flex items-center justify-center transition-all" title="Answer it"><MessageSquare className="h-3 w-3" /></button>
          ) : closed ? (
            <button onClick={e => { e.stopPropagation(); cb.onToggle(task.id); }} className="w-5 h-5 rounded-full bg-muted border border-white/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all" title="Reopen"><RotateCcw className="h-3 w-3" /></button>
          ) : (
            <button onClick={e => { e.stopPropagation(); cb.onToggle(task.id); }} className="w-5 h-5 rounded-full bg-muted border border-white/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all" title="Tick it"><Check className="h-3 w-3" /></button>
          )}
          {(!closed || state === "settled") && (
            <button onClick={e => { e.stopPropagation(); cb.onDrop(task.id); }} className="w-5 h-5 rounded-full bg-muted border border-white/10 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all" title={state === "settled" ? "Drop it (the answer stays as the record)" : "Drop it (it stays, faded)"}><Ban className="h-3 w-3" /></button>
          )}
          {!data.record && (
            <button onClick={e => { e.stopPropagation(); cb.onDelete(task.id); }} className="w-5 h-5 rounded-full bg-destructive/80 text-white flex items-center justify-center hover:bg-destructive transition-all" title="Delete"><Trash2 className="h-3 w-3" /></button>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        <PlanningMarker look={{ ask: task.ask, state }} className="mt-px" />
        <div className="flex-1 min-w-0">
          {editing
            ? <InlineEditor
                value={task.title}
                onSave={t => {
                  setEditing(false);
                  // "X? = a" settles it like the answer box: grade a written guess right after
                  // (held in the Open loops view meanwhile, as the answer box would be).
                  const settles = !!titleSettle(task, t) && !!task.guess?.trim();
                  if (settles) onHold(task.id, true);
                  void cb.onRename(task.id, t).then(ok => {
                    if (ok && settles) openAnswer("verdict");
                    else if (settles) onHold(task.id, false);
                  });
                }}
                onCancel={() => setEditing(false)}
              />
            : <p className={`text-xs font-medium leading-snug break-words ${state === "dropped" ? "line-through text-muted-foreground" : closed ? "text-muted-foreground" : "text-foreground"}`}>{task.title}</p>}
          {tails.map((t, i) => (
            <p key={i} className={`text-[10px] leading-snug mt-0.5 truncate ${t.tone}`} title={t.text}>{t.text}</p>
          ))}
        </div>
        {task.url && (
          <button onClick={e => { e.stopPropagation(); openUrl(task.url as string); }} className="flex-shrink-0 w-5 h-5 rounded-md bg-muted/40 border border-white/10 flex items-center justify-center overflow-hidden" title={task.url}>
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" className="w-3.5 h-3.5" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </button>
        )}
      </div>
      {(data.childTotal > 0 || mentions.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 mt-1.5">
          {data.childTotal > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground px-1 py-0.5 rounded bg-muted/30">{data.childClosed}/{data.childTotal}</span>
          )}
          {visibleMentions.map((m, i) => (
            <button key={i} onClick={e => { e.stopPropagation(); navigateToMention(m); }} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md border transition-transform hover:scale-110 bg-violet-500/15 border-violet-500/40 text-violet-200" title="Open in Paths">🪜</button>
          ))}
          {hiddenCount > 0 && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-muted/30 border border-white/10 text-muted-foreground">+{hiddenCount}</span>
          )}
        </div>
      )}
      <div className="flex justify-center mt-1.5">
        <button onClick={e => { e.stopPropagation(); setShowAdd(s => !s); setShowAnswer(false); }} className={`w-5 h-5 rounded-full flex items-center justify-center transition-all border ${showAdd ? "gradient-purple border-transparent text-white scale-110" : "bg-muted/30 border-white/10 text-muted-foreground hover:text-foreground hover:border-primary/40"}`} title="Add under it">{showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button>
      </div>
    </div>
  );

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!bg-primary/60 !border-primary/40 !w-3 !h-3" />
      {data.frontier
        ? <div className="rounded-[13px] p-[1.5px] gradient-purple glow-sm">{card}</div>
        : card}
      {showAdd && (
        <div className="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-2">
          <AddBox
            placeholder={placeholderFor(task)}
            onSubmit={t => cb.onAdd(task.id, t)}
            onPaste={t => cb.onPaste(task.id, t)}
            onClose={() => setShowAdd(false)}
          />
        </div>
      )}
      {showAnswer && (
        <div className="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-2">
          <AnswerBox
            task={task}
            options={data.options}
            initialPhase={answerPhase}
            onSettle={a => cb.onSettle(task.id, a)}
            onSettleWithChild={c => cb.onSettleWithChild(task.id, c)}
            onVerdict={v => cb.onVerdict(task.id, v)}
            onClose={() => setShowAnswer(false)}
          />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-primary/60 !border-primary/40 !w-3 !h-3" />
    </div>
  );
}

/* ── Board Node: the one container ───────────────────────────── */
function BoardNode({ id, data }: NodeProps<BoardFlowNode>) {
  const { board, cb } = data;
  const [showAdd, setShowAdd] = useState(false);
  useRaiseWhile(id, showAdd);
  return (
    <div className="relative px-5 py-3.5 rounded-2xl border border-primary/40 glow-md bg-background/90 backdrop-blur-xl min-w-[200px] max-w-[260px]">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
      <p className="relative text-sm font-bold text-gradient-purple truncate">{board.emoji} {board.name}</p>
      <div className="flex justify-center mt-2.5 relative">
        <button onClick={e => { e.stopPropagation(); setShowAdd(s => !s); }} className={`w-6 h-6 rounded-full flex items-center justify-center transition-all border ${showAdd ? "gradient-purple border-transparent text-white scale-110" : "bg-muted/30 border-white/10 text-muted-foreground hover:text-foreground hover:border-primary/40"}`} title="Add what you're aiming at">{showAdd ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button>
      </div>
      {showAdd && (
        <div className="absolute z-[100] top-full left-1/2 -translate-x-1/2 mt-2">
          <AddBox placeholder={PLACEHOLDERS.root} root onSubmit={t => cb.onAdd(null, t)} onPaste={t => cb.onPaste(null, t)} onClose={() => setShowAdd(false)} />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-primary/60 !border-primary/40 !w-3 !h-3" />
    </div>
  );
}

const nodeTypes = { taskNode: TaskNode, boardNode: BoardNode };

/* ── Layout: lib/planning-map-layout.ts places the nodes; this builds React Flow's ── */
function buildFlow(
  visible: PlanningTask[],
  dataOf: (t: PlanningTask) => TaskNodeData,
  boardData: BoardNodeData,
  opts: LayoutOptions,
): { nodes: FlowNode[]; edges: Edge[] } {
  const { board, placed } = layoutMap(visible, opts);
  const byId = new Map(visible.map(t => [t.id, t]));
  const nodes: FlowNode[] = [{ id: BOARD_NODE, type: "boardNode", position: board, draggable: false, data: boardData }];
  const edges: Edge[] = [];
  for (const p of placed) {
    const task = byId.get(p.id);
    if (!task) continue;
    const data = dataOf(task);
    const nodeId = nodeIdOf(p.id);
    const source = p.parentId ? nodeIdOf(p.parentId) : BOARD_NODE;
    // No per-node `draggable`: the Open loops view turns dragging off for the whole map.
    nodes.push({ id: nodeId, type: "taskNode", position: p.position, data });
    const kind = kindOf(task);
    edges.push({
      id: `e-${source}-${nodeId}`,
      source,
      target: nodeId,
      type: "smoothstep",
      animated: data.frontier,
      style: { stroke: kind.color, strokeWidth: 2, opacity: !isOpenNode(task) ? 0.25 : data.waiting ? 0.4 : 0.7 },
      markerEnd: { type: MarkerType.ArrowClosed, color: kind.color, width: 15, height: 15 },
    });
  }
  return { nodes, edges };
}

/**
 * The Open loops view (same filter as the List): frontier nodes plus the
 * ancestors needed to place them, and the `held` nodes being answered.
 */
function openLoopsOf(tasks: PlanningTask[], held: ReadonlySet<string>): PlanningTask[] {
  const keep = openLoopIds(tasks, held);
  return tasks.filter(t => keep.has(t.id));
}

interface ConfirmState {
  title: string;
  body: string;
  action: { label: string; run: () => void };
  alt?: { label: string; run: () => void };
}

function MapViewInner({ board, openLoops }: { board: PlanningBoard; openLoops: boolean }) {
  const boardId = board.id;
  const {
    tasks, loading, addNode, insertTree, updateNode, clearPositions, setNodeState, settleWithChild, moveNode, deleteNodes,
  } = usePlanningState(undefined, { boardId });
  const reactFlowInstance = useReactFlow();
  const isMobile = useIsMobile();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<XY | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [paste, setPaste] = useState<{ parentId: string | null; rows: PasteRow[]; target: string; parentTitle: string | null } | null>(null);
  const [organizing, setOrganizing] = useState(false);
  // Nodes kept in the Open loops view while their answer box is open.
  const [held, setHeld] = useState<ReadonlySet<string>>(() => new Set());
  // Bumped to lay the map out afresh once (Organize, switching the Open loops view).
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPos = useRef<XY | null>(null);
  const flowWrapperRef = useRef<HTMLDivElement>(null);
  // Node id that should be gently brought into view once it renders.
  const pendingFocusRef = useRef<string | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isFullscreen) setIsFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  // Pan the view to include a flow-space position if it's currently off-screen.
  const ensureVisible = useCallback((pos: XY) => {
    const wrap = flowWrapperRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const screen = reactFlowInstance.flowToScreenPosition(pos);
    const margin = 100;
    const outside =
      screen.x < rect.left + margin || screen.x > rect.right - margin ||
      screen.y < rect.top + margin || screen.y > rect.bottom - margin;
    if (outside) reactFlowInstance.setCenter(pos.x, pos.y, { zoom: reactFlowInstance.getZoom(), duration: 500 });
  }, [reactFlowInstance]);

  /* ── writes ── */
  const handleAdd = useCallback(async (parentId: string | null, text: string, at?: XY) => {
    const line = parseLine(text);
    const created = await addNode({ boardId, parentId, line });
    if (!created) return;
    if (line.kind === "note" && parentId) {
      toast({ title: "Note added", description: `On “${created.title}”` });
      return;
    }
    if (at && !openLoops) await updateNode(created.id, { position_x: at.x, position_y: at.y });
    pendingFocusRef.current = nodeIdOf(created.id);
  }, [addNode, updateNode, boardId, openLoops]);

  // A multi-line paste opens the paste preview; Insert is one insertTree.
  const handlePaste = useCallback((parentId: string | null, text: string) => {
    const rows = parsePaste(text);
    if (rows.length === 0) return;
    const parent = parentId ? tasksRef.current.find(t => t.id === parentId) : null;
    setPaste({ parentId, rows, target: parent ? `under “${parent.title}”` : `at the top of ${board.emoji} ${board.name}`, parentTitle: parent?.title ?? null });
  }, [board.emoji, board.name]);

  const handleInsertPaste = useCallback(async (rows: PasteRow[]): Promise<boolean> => {
    if (!paste) return false;
    const inserted = await insertTree(boardId, paste.parentId, rows);
    if (!inserted) return false;
    if (inserted.length > 0) pendingFocusRef.current = nodeIdOf(inserted[0].id);
    setPaste(null);
    return true;
  }, [insertTree, boardId, paste]);

  const handleToggle = useCallback((id: string) => {
    const list = tasksRef.current;
    const t = list.find(x => x.id === id);
    if (!t) return;
    if (t.done || t.dropped) { void reopenNode(t, setNodeState, list); return; }
    const open = openDescendants(id, list).length;
    if (open === 0) { void setNodeState(id, "done"); return; }
    setConfirm({
      title: `Tick “${t.title}”?`,
      body: `${open} open ${open === 1 ? "node is" : "nodes are"} still below it. Drop them with it (Reopen brings them back), or tick only this one.`,
      action: { label: `Tick and drop ${open}`, run: () => void setNodeState(id, "done", { dropOpenChildren: true }) },
      alt: { label: "Tick only this", run: () => void setNodeState(id, "done") },
    });
  }, [setNodeState]);

  const handleSettle = useCallback((id: string, answer: string) => setNodeState(id, "settled", { outcome: answer }), [setNodeState]);
  const handleSettleWithChild = useCallback((id: string, childId: string) => settleWithChild(id, childId), [settleWithChild]);
  const handleVerdict = useCallback((id: string, verdict: Verdict) => { void setNodeState(id, "settled", { verdict }); }, [setNodeState]);
  const handleDrop = useCallback((id: string) => { void setNodeState(id, "dropped", { dropOpenChildren: true }); }, [setNodeState]);
  const handleRename = useCallback((id: string, title: string) => updateNode(id, { title }), [updateNode]);
  const handleSelect = useCallback((id: string) => setSelectedTaskId(id), []);
  const handleHold = useCallback((id: string, on: boolean) => {
    setHeld(prev => {
      if (prev.has(id) === on) return prev;
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    const list = tasksRef.current;
    const t = list.find(x => x.id === id);
    if (!t) return;
    const below = descendants(id, list).length;
    if (below === 0) { void deleteNodes([id]); return; }
    setConfirm({
      title: `Delete “${t.title}”?`,
      body: `This also deletes the ${below} ${below === 1 ? "node" : "nodes"} under it. This can't be undone.`,
      action: { label: `Delete ${below + 1}`, run: () => void deleteNodes([id]) },
    });
  }, [deleteNodes]);

  const callbacks = useMemo<NodeCallbacks>(() => ({
    onAdd: (parentId, text) => handleAdd(parentId, text),
    onPaste: handlePaste,
    onToggle: handleToggle,
    onSettle: handleSettle,
    onSettleWithChild: handleSettleWithChild,
    onVerdict: handleVerdict,
    onDelete: handleDelete,
    onDrop: handleDrop,
    onRename: handleRename,
    onSelect: handleSelect,
    onHold: handleHold,
  }), [handleAdd, handlePaste, handleToggle, handleSettle, handleSettleWithChild, handleVerdict, handleDelete, handleDrop, handleRename, handleSelect, handleHold]);

  // Drag-connect = move the target under the source (the board node = make it a root).
  const handleConnect = useCallback((connection: Connection) => {
    const childId = connection.target ? taskIdOf(connection.target) : null;
    if (!childId || !connection.source) return;
    const parentId = connection.source === BOARD_NODE ? null : taskIdOf(connection.source);
    if (connection.source !== BOARD_NODE && !parentId) return;
    const child = tasksRef.current.find(t => t.id === childId);
    if (!child || (child.parent_id ?? null) === parentId) return;
    void moveNode(childId, parentId, Infinity).then(ok => {
      if (!ok) return;
      const parent = parentId ? tasksRef.current.find(t => t.id === parentId) : null;
      toast({ title: "Moved", description: parent ? `“${child.title}” is now under “${parent.title}”` : `“${child.title}” is now a root` });
    });
  }, [moveNode]);

  // Drag stop: persist the position (not in the Open loops view, which is laid out on the fly).
  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    const id = taskIdOf(node.id);
    if (!id || openLoops) return;
    void updateNode(id, { position_x: node.position.x, position_y: node.position.y });
  }, [updateNode, openLoops]);

  /* ── what is shown ── */
  const derived = useMemo(() => {
    const byId = new Map(tasks.map(t => [t.id, t]));
    const kids = childrenMap(tasks);
    const front = new Set(frontier(tasks).map(t => t.id));
    const next = nextPerRoot(tasks);
    const record = recordIds(tasks);
    const tally = childCounts(tasks);
    return { byId, kids, front, next, record, tally };
  }, [tasks]);

  const visible = useMemo(() => (openLoops ? openLoopsOf(tasks, held) : tasks), [tasks, openLoops, held]);

  const dataOf = useCallback((t: PlanningTask): TaskNodeData => {
    const tally = derived.tally.get(t.id);
    return {
      task: t,
      frontier: derived.front.has(t.id),
      waiting: isWaiting(t, derived.byId),
      next: derived.next.has(t.id),
      record: derived.record.has(t.id),
      childTotal: tally?.total ?? 0,
      childClosed: tally?.closed ?? 0,
      options: t.ask && isOpenNode(t) ? answerChoices(t.id, tasks) : [],
      touch: isMobile,
      cb: callbacks,
    };
  }, [derived, tasks, callbacks, isMobile]);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Parents as last laid out: a node whose parent changed (moveNode) is laid out afresh.
  const prevParentsRef = useRef<Map<string, string | null>>(new Map());
  const usedLayoutKeyRef = useRef("");
  const layoutKey = `${openLoops ? "open" : "all"}:${layoutEpoch}`;

  const layout = useMemo(() => {
    const fresh = layoutKey !== usedLayoutKeyRef.current;
    const relayout = movedSubtrees(visible, prevParentsRef.current);
    // Where each node is shown now (by task id); a fresh layout ignores it.
    const live = fresh ? null : new Map(
      nodesRef.current.flatMap(n => { const id = taskIdOf(n.id); return id ? [[id, n.position] as const] : []; }),
    );
    const boardData: BoardNodeData = { board, cb: callbacks };
    return { ...buildFlow(visible, dataOf, boardData, { persisted: !openLoops, live, relayout }), fresh };
  }, [visible, dataOf, board, callbacks, openLoops, layoutKey]);

  useEffect(() => {
    setNodes(prev => {
      const prevMap = new Map(prev.map(n => [n.id, n]));
      // Keep React Flow's own fields (measured size, selection) on nodes that stay.
      return layout.nodes.map(n => {
        const existing = prevMap.get(n.id);
        return existing ? ({ ...existing, ...n, position: n.position, data: n.data } as FlowNode) : n;
      });
    });
    setEdges(layout.edges);
    prevParentsRef.current = new Map(visible.map(t => [t.id, t.parent_id ?? null]));

    if (layout.fresh && !loading) {
      usedLayoutKeyRef.current = layoutKey;
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.3, maxZoom: 1.1, duration: 500 }), 80);
    }

    // Keep-in-view: gently pan to a freshly added node once it has a position.
    if (pendingFocusRef.current) {
      const target = layout.nodes.find(n => n.id === pendingFocusRef.current);
      if (target) {
        const center = { x: target.position.x + NODE_W / 2, y: target.position.y + NODE_H / 2 };
        pendingFocusRef.current = null;
        setTimeout(() => ensureVisible(center), 80);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loading]);

  // Switching the Open loops view lays the map out afresh (handled by layoutKey);
  // Organize clears every stored position, then does the same.
  const handleAutoOrganize = useCallback(async () => {
    const placed = tasksRef.current.filter(t => t.position_x != null || t.position_y != null);
    setOrganizing(true);
    const ok = await clearPositions(placed.map(t => t.id));
    setOrganizing(false);
    setLayoutEpoch(e => e + 1);
    if (ok) toast({ title: "Organized", description: "Nodes reset to the standard layout" });
  }, [clearPositions]);

  const handleContextAdd = useCallback(async (text: string) => {
    if (!contextMenuPos) return;
    const flowPos = reactFlowInstance.screenToFlowPosition(contextMenuPos);
    const spot = findFreeSpot(flowPos, nodesRef.current.map(n => n.position));
    await handleAdd(null, text, spot);
  }, [contextMenuPos, reactFlowInstance, handleAdd]);

  const handleContextPaste = useCallback((text: string) => handlePaste(null, text), [handlePaste]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);
  useEffect(() => clearLongPress, [clearLongPress]);

  const emptyHint = !loading && visible.length === 0;

  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden border border-white/10 transition-all duration-300 ${isFullscreen ? "fixed inset-0 z-50 rounded-none border-none bg-background" : "h-[600px]"}`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-muted/20 backdrop-blur-md flex-wrap">
        {isFullscreen && <h3 className="text-sm font-semibold text-foreground truncate max-w-[40%]">{board.emoji} {board.name}{openLoops ? " · Open loops" : ""}</h3>}
        {!openLoops && (
          <button onClick={() => void handleAutoOrganize()} disabled={organizing} className="flex items-center gap-1.5 h-7 px-2.5 text-[10px] font-medium bg-muted/30 border border-white/10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50" title="Reset every node to the standard layout"><LayoutGrid className="h-3.5 w-3.5" /><span className="hidden sm:inline">{organizing ? "Organizing…" : "Organize"}</span></button>
        )}
        <button onClick={() => setIsFullscreen(f => !f)} className="flex items-center gap-1.5 h-7 px-2.5 text-[10px] font-medium bg-muted/30 border border-white/10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>{isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        <p className="text-[10px] text-muted-foreground hidden lg:block">
          {isMobile ? "Long-press the canvas to add" : "Right-click the canvas to add · Double-click to edit · Drag from a node's bottom dot to another node to put that node under it"}
        </p>
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground ml-auto">
          <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-br ${KIND.step.bar}`} />{KIND.step.label}</span>
          <span className="flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-sm bg-gradient-to-br ${KIND.question.bar}`} />{KIND.question.label}</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm gradient-purple glow-sm" />Open now</span>
        </div>
      </div>
      <div ref={flowWrapperRef} className="flex-1 relative"
        // Capture phase: React Flow's pan/zoom stops a touch on the canvas from
        // bubbling, so a bubbling handler here never ran and long-press did nothing.
        onTouchStartCapture={(e) => {
          clearLongPress();
          // One finger on the empty canvas only (a node has its own tap, a pinch is not a press).
          const el = e.target as HTMLElement;
          if (e.touches.length !== 1 || !el.closest?.(".react-flow__pane") || el.closest(".react-flow__node")) return;
          const touch = e.touches[0];
          longPressPos.current = { x: touch.clientX, y: touch.clientY };
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            if (longPressPos.current) setContextMenuPos(longPressPos.current);
          }, 600);
        }}
        onTouchMoveCapture={(e) => {
          // A finger never holds perfectly still: only a real move (a pan) cancels the press.
          const t = e.touches[0];
          const at = longPressPos.current;
          if (!t || !at || Math.hypot(t.clientX - at.x, t.clientY - at.y) > 10) clearLongPress();
        }}
        onTouchEndCapture={clearLongPress}
        onTouchCancelCapture={clearLongPress}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={handleConnect}
          isValidConnection={c => c.source !== c.target}
          onNodeDragStop={handleNodeDragStop}
          nodeTypes={nodeTypes}
          nodesDraggable={!openLoops}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          className="bg-transparent"
          onPaneContextMenu={(e) => { e.preventDefault(); setContextMenuPos({ x: e.clientX, y: e.clientY }); }}
          onPaneClick={() => setContextMenuPos(null)}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--muted-foreground) / 0.15)" />
          <Controls className="!bg-background !border-white/10 !rounded-lg [&>button]:!bg-muted/30 [&>button]:!border-white/10 [&>button]:!text-muted-foreground [&>button:hover]:!bg-muted/50 [&>button]:!rounded-md" />
          {!isMobile && (
            <MiniMap
              nodeColor={(node) => {
                if (node.type === "boardNode") return "hsl(var(--primary))";
                const task = (node.data as { task?: PlanningTask })?.task;
                if (!task) return "hsl(var(--muted))";
                const kind = kindOf(task);
                return isOpenNode(task) ? kind.color : kind.faded;
              }}
              maskColor="hsl(var(--background) / 0.85)"
              className="!bg-background !border-white/10 !rounded-lg"
              style={{ height: 100, width: 150 }}
            />
          )}
        </ReactFlow>
        {/* Right-click / long-press on the canvas: a new root where you clicked */}
        {contextMenuPos && (
          // Kept on screen: pressed near the right edge of a phone, the box (w-64) would open mostly off it.
          <div className="fixed z-[200]" style={{ left: Math.max(8, Math.min(contextMenuPos.x, window.innerWidth - 256 - 8)), top: Math.max(8, Math.min(contextMenuPos.y, window.innerHeight - 120)) }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
            <AddBox placeholder={PLACEHOLDERS.root} root onSubmit={handleContextAdd} onPaste={handleContextPaste} onClose={() => setContextMenuPos(null)} />
          </div>
        )}
        {emptyHint && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <div className="text-center space-y-2 opacity-60">
              {openLoops ? (
                <>
                  <Check className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No open loops on this board.</p>
                </>
              ) : (
                <>
                  <Plus className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{isMobile ? "Long-press to add what you're aiming at" : "Right-click to add what you're aiming at"}</p>
                  <p className="text-[10px] text-muted-foreground">Or use the + on the board node</p>
                </>
              )}
            </div>
          </div>
        )}
        <PlanningNodeDetail
          node={tasks.find(t => t.id === selectedTaskId) || null}
          open={!!selectedTaskId}
          onOpenChange={o => { if (!o) setSelectedTaskId(null); }}
          onUpdate={updateNode}
          onSetState={setNodeState}
          nodes={tasks}
        />
      </div>
      <PlanningPastePreview
        open={!!paste}
        rows={paste?.rows ?? []}
        target={paste?.target ?? ""}
        parentTitle={paste?.parentTitle ?? null}
        onCancel={() => setPaste(null)}
        onInsert={handleInsertPaste}
      />
      <AlertDialog open={!!confirm} onOpenChange={o => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {confirm?.alt && (
              <AlertDialogAction className="bg-muted text-foreground hover:bg-muted/80" onClick={() => { confirm.alt?.run(); setConfirm(null); }}>{confirm.alt.label}</AlertDialogAction>
            )}
            <AlertDialogAction onClick={() => { confirm?.action.run(); setConfirm(null); }}>{confirm?.action.label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Exported component ────────────────────────────────────── */
interface Props {
  /** The one container the Map shows. */
  board: PlanningBoard;
  /** Only frontier nodes plus the ancestors needed to place them. */
  openLoops?: boolean;
}
export default function PlanningMap({ board, openLoops = false }: Props) {
  return <ReactFlowProvider><MapViewInner board={board} openLoops={openLoops} /></ReactFlowProvider>;
}
