import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown, ChevronRight, Repeat, Check, Trash2, Plus, GripVertical,
  ArrowUp, ArrowDown, Pencil, Clock, Battery, Target, AlertTriangle,
} from "lucide-react";
import {
  Plan, PlanBlock, PlanOp, PlanPhase, isLoop, planStepCount, planTotalMinutes, parseRepeatCount,
} from "@/lib/plan-model";

const energyStyle: Record<string, string> = {
  low: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  high: "text-rose-300 bg-rose-500/10 border-rose-500/20",
};

function minutesLabel(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface DragPayload {
  blockId: string;
  fromPhaseId: string;
  fromLoopId: string | null;
}

interface Props {
  plan: Plan;
  /** Highlighted after an AI edit, so the user can see what moved. */
  highlightIds?: Set<string>;
  onOps: (ops: PlanOp[], label: string) => void;
}

export default function SimulationPlanView({ plan, highlightIds, onOps }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<{ phaseId?: string; loopId?: string } | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const counts = useMemo(() => planStepCount(plan), [plan]);
  const totalMinutes = useMemo(() => planTotalMinutes(plan), [plan]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (id: string, title: string) => { setEditing(id); setDraft(title); };
  const commitEdit = () => {
    if (editing && draft.trim()) onOps([{ type: "update_block", id: editing, title: draft.trim() }], "Renamed a step");
    setEditing(null);
  };

  const shift = (phase: PlanPhase, block: PlanBlock, loopId: string | null, delta: number) => {
    const list: { id: string }[] = loopId
      ? (phase.blocks.find((b) => b.id === loopId) as { steps: { id: string }[] }).steps
      : phase.blocks;
    const index = list.findIndex((b) => b.id === block.id);
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    onOps(
      [{ type: "move_block", id: block.id, toPhaseId: loopId ? undefined : phase.id, toLoopId: loopId ?? undefined, toIndex: target }],
      "Moved a step",
    );
  };

  const handleDrop = (toPhaseId: string, toLoopId: string | null, toIndex: number) => {
    setDropTarget(null);
    if (!drag) return;
    setDrag(null);
    onOps(
      [{
        type: "move_block",
        id: drag.blockId,
        toPhaseId: toLoopId ? undefined : toPhaseId,
        toLoopId: toLoopId ?? undefined,
        toIndex,
      }],
      "Moved a step",
    );
  };

  const submitAdd = () => {
    if (!adding || !newTitle.trim()) return;
    onOps(
      [{ type: "insert_block", phaseId: adding.phaseId, loopId: adding.loopId, block: { kind: "step", title: newTitle.trim() } as PlanBlock }],
      "Added a step",
    );
    setNewTitle("");
    setAdding(null);
  };

  const renderStepRow = (
    block: PlanBlock,
    phase: PlanPhase,
    loopId: string | null,
    index: number,
    number: string,
  ) => {
    const loop = isLoop(block);
    const highlighted = highlightIds?.has(block.id);
    const dropId = `${loopId ?? phase.id}:${index}`;

    return (
      <div
        key={block.id}
        draggable
        onDragStart={() => setDrag({ blockId: block.id, fromPhaseId: phase.id, fromLoopId: loopId })}
        onDragEnd={() => { setDrag(null); setDropTarget(null); }}
        onDragOver={(e) => { e.preventDefault(); setDropTarget(dropId); }}
        onDragLeave={() => setDropTarget((t) => (t === dropId ? null : t))}
        onDrop={(e) => { e.preventDefault(); handleDrop(phase.id, loopId, index); }}
        className={`group rounded-xl border transition-all ${
          dropTarget === dropId ? "border-primary/60 bg-primary/10" : highlighted ? "border-primary/40 bg-primary/5" : "border-transparent hover:bg-white/5"
        }`}
      >
        <div className="flex items-start gap-2 px-2.5 py-2">
          <GripVertical className="h-3.5 w-3.5 mt-1 text-muted-foreground/40 cursor-grab shrink-0" />
          <span className="text-[10px] font-mono text-muted-foreground/60 mt-1 w-8 shrink-0">{number}</span>

          {!loop && (
            <button
              onClick={() => onOps([{ type: "update_block", id: block.id, done: !block.done }], block.done ? "Unchecked a step" : "Checked a step")}
              className={`mt-0.5 h-[18px] w-[18px] rounded-md border shrink-0 flex items-center justify-center transition-all ${
                block.done ? "gradient-purple border-transparent" : "border-muted-foreground/30 hover:border-primary"
              }`}
            >
              {block.done && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </button>
          )}
          {loop && <Repeat className="h-4 w-4 mt-0.5 text-cyan-300 shrink-0" />}

          <div className="flex-1 min-w-0">
            {editing === block.id ? (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(null); }}
                className="w-full h-7 text-sm bg-muted/40 border border-primary/40 rounded-lg px-2 text-foreground outline-none"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm ${!loop && block.done ? "line-through text-muted-foreground" : "text-foreground"} ${loop ? "font-bold" : ""}`}>
                  {block.title}
                </span>
                {loop && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-bold">
                    {block.repeat}
                  </span>
                )}
                {!loop && block.estimateMinutes ? (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                    <Clock className="h-2.5 w-2.5" />{minutesLabel(block.estimateMinutes)}
                  </span>
                ) : null}
                {!loop && block.energy ? (
                  <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${energyStyle[block.energy]}`}>
                    <Battery className="h-2.5 w-2.5" />{block.energy}
                  </span>
                ) : null}
              </div>
            )}

            {!loop && block.detail && <p className="text-xs text-muted-foreground mt-0.5">{block.detail}</p>}
            {!loop && block.output && (
              <p className="text-[11px] text-emerald-300/80 mt-0.5">→ {block.output}</p>
            )}
            {loop && block.exit && <p className="text-xs text-muted-foreground mt-0.5">Exit: {block.exit}</p>}
          </div>

          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => shift(phase, block, loopId, -1)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5">
              <ArrowUp className="h-3 w-3" />
            </button>
            <button onClick={() => shift(phase, block, loopId, 1)} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5">
              <ArrowDown className="h-3 w-3" />
            </button>
            <button onClick={() => startEdit(block.id, block.title)} className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-white/5">
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => onOps([{ type: "delete_block", id: block.id }], "Removed a step")}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-white/5"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {loop && !collapsed.has(block.id) && (
          <div className="pl-9 pb-1.5 space-y-0.5 border-l border-cyan-500/20 ml-5">
            {block.steps.map((step, si) => renderStepRow(step, phase, block.id, si, `${si + 1}`))}
            {adding?.loopId === block.id ? (
              <AddRow value={newTitle} onChange={setNewTitle} onSubmit={submitAdd} onCancel={() => setAdding(null)} />
            ) : (
              <button
                onClick={() => { setAdding({ loopId: block.id }); setNewTitle(""); }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-2.5 py-1 transition-colors"
              >
                <Plus className="h-3 w-3" /> step in loop
              </button>
            )}
          </div>
        )}

        {loop && (
          <button
            onClick={() => toggleCollapse(block.id)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground pl-9 pb-1.5"
          >
            {collapsed.has(block.id) ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {block.steps.length} step{block.steps.length === 1 ? "" : "s"}
            {parseRepeatCount(block.repeat) ? ` × ${parseRepeatCount(block.repeat)}` : ""}
          </button>
        )}
      </div>
    );
  };

  let runningNumber = 0;

  return (
    <div className="space-y-4">
      {/* Overview */}
      <div className="glass-card p-5 space-y-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">{plan.title}</h2>
          {plan.goal && <p className="text-sm text-muted-foreground mt-1">{plan.goal}</p>}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Stat label="steps" value={String(counts.unique)} />
          {counts.expanded !== counts.unique && <Stat label="with loops expanded" value={String(counts.expanded)} />}
          <Stat label="phases" value={String(plan.phases.length)} />
          {totalMinutes > 0 && <Stat label="estimated" value={minutesLabel(totalMinutes)} />}
          {plan.horizon && <Stat label="horizon" value={plan.horizon} />}
        </div>

        {plan.decisions.length > 0 && (
          <details className="group" open>
            <summary className="cursor-pointer text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Decisions already made ({plan.decisions.length})
            </summary>
            <ul className="mt-2 space-y-1.5">
              {plan.decisions.map((d) => (
                <li key={d.id} className="text-xs">
                  <span className="text-muted-foreground">{d.question}</span>
                  <span className="text-foreground font-semibold"> → {d.choice}</span>
                  {d.why && <span className="text-muted-foreground/70"> · {d.why}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {(plan.assumptions.length > 0 || plan.risks.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-3">
            {plan.assumptions.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1">Assumptions</p>
                <ul className="space-y-0.5">
                  {plan.assumptions.map((a, i) => <li key={i} className="text-xs text-muted-foreground">— {a}</li>)}
                </ul>
              </div>
            )}
            {plan.risks.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-muted-foreground mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Risks
                </p>
                <ul className="space-y-0.5">
                  {plan.risks.map((r, i) => <li key={i} className="text-xs text-muted-foreground">— {r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phases */}
      {plan.phases.map((phase, pi) => {
        const isCollapsed = collapsed.has(phase.id);
        const doneCount = phase.blocks.filter((b) => !isLoop(b) && b.done).length;
        return (
          <motion.div key={phase.id} layout className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <button onClick={() => toggleCollapse(phase.id)} className="p-0.5 text-muted-foreground hover:text-primary">
                {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <span className="text-[10px] font-mono text-muted-foreground/60">PHASE {pi + 1}</span>
              <h3 className="text-sm font-bold text-foreground flex-1">{phase.title}</h3>
              <span className="text-xs text-muted-foreground font-mono">{doneCount}/{phase.blocks.length}</span>
              <button
                onClick={() => onOps([{ type: "move_phase", id: phase.id, toIndex: Math.max(0, pi - 1) }], "Moved a phase")}
                disabled={pi === 0}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-20"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => onOps([{ type: "move_phase", id: phase.id, toIndex: Math.min(plan.phases.length - 1, pi + 1) }], "Moved a phase")}
                disabled={pi === plan.phases.length - 1}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-20"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
            {phase.summary && !isCollapsed && <p className="text-xs text-muted-foreground mb-2 pl-6">{phase.summary}</p>}

            {!isCollapsed && (
              <div
                className="space-y-0.5"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleDrop(phase.id, null, phase.blocks.length); }}
              >
                {phase.blocks.map((block, bi) => {
                  runningNumber += 1;
                  return renderStepRow(block, phase, null, bi, String(runningNumber));
                })}

                {adding?.phaseId === phase.id ? (
                  <AddRow value={newTitle} onChange={setNewTitle} onSubmit={submitAdd} onCancel={() => setAdding(null)} />
                ) : (
                  <button
                    onClick={() => { setAdding({ phaseId: phase.id }); setNewTitle(""); }}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary px-2.5 py-1.5 transition-colors"
                  >
                    <Plus className="h-3 w-3" /> step
                  </button>
                )}
              </div>
            )}
          </motion.div>
        );
      })}

      {plan.phases.length === 0 && (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">
          This simulation is empty. Ask the assistant to build it, or add a phase from the chat.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="px-2.5 py-1 rounded-lg bg-muted/40 border border-white/10">
      <span className="font-bold text-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function AddRow({ value, onChange, onSubmit, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel(); }}
        placeholder="New step..."
        className="flex-1 h-8 text-sm bg-muted/30 border border-white/10 rounded-lg px-3 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
        autoFocus
      />
      <button onClick={onSubmit} className="h-8 px-3 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-all">Add</button>
    </div>
  );
}
