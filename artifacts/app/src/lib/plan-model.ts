/**
 * The data model behind a Planning **Simulation**: a generated walk-through of a
 * whole project with every decision already made, split into concrete steps and
 * repeated loops.
 *
 * A simulation is stored as one JSON document (`Plan`) rather than as rows in
 * `planning_tasks`, because it is regenerated, versioned and diffed as a whole.
 * Every mutation goes through `applyOps` so the AI, drag-and-drop and manual
 * edits all take the same path and can be undone the same way.
 */

export type Energy = "low" | "medium" | "high";

export interface PlanStep {
  id: string;
  kind: "step";
  title: string;
  detail?: string;
  /** What concretely exists once this step is finished. */
  output?: string;
  /** The decision this step bakes in, if it resolves one. */
  decision?: string;
  estimateMinutes?: number;
  energy?: Energy;
  done?: boolean;
}

export interface PlanLoop {
  id: string;
  kind: "loop";
  title: string;
  /** Human-readable repetition, e.g. "12 times" or "every week". */
  repeat: string;
  /** What makes the loop stop. */
  exit?: string;
  steps: PlanStep[];
}

export type PlanBlock = PlanStep | PlanLoop;

export interface PlanPhase {
  id: string;
  title: string;
  summary?: string;
  blocks: PlanBlock[];
}

export interface PlanDecision {
  id: string;
  question: string;
  choice: string;
  why?: string;
}

export interface Plan {
  version: 1;
  title: string;
  goal: string;
  horizon?: string;
  assumptions: string[];
  decisions: PlanDecision[];
  risks: string[];
  phases: PlanPhase[];
}

/* ------------------------------------------------------------------ ops --- */

export type PlanOp =
  | { type: "update_meta"; title?: string; goal?: string; horizon?: string; assumptions?: string[]; risks?: string[] }
  | { type: "set_decision"; id?: string; question: string; choice: string; why?: string }
  | { type: "delete_decision"; id: string }
  | { type: "insert_phase"; index?: number; phase: Partial<PlanPhase> & { title: string } }
  | { type: "update_phase"; id: string; title?: string; summary?: string }
  | { type: "move_phase"; id: string; toIndex: number }
  | { type: "delete_phase"; id: string }
  | { type: "insert_block"; phaseId?: string; loopId?: string; index?: number; block: Partial<PlanBlock> & { title: string } }
  | { type: "update_block"; id: string; title?: string; detail?: string; output?: string; decision?: string; estimateMinutes?: number; energy?: Energy; repeat?: string; exit?: string; done?: boolean }
  | { type: "move_block"; id: string; toPhaseId?: string; toLoopId?: string; toIndex: number }
  | { type: "delete_block"; id: string };

export interface OpResult {
  plan: Plan;
  applied: PlanOp[];
  errors: string[];
}

let idCounter = 0;
export function newId(prefix = "b"): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyPlan(title = "Untitled simulation", goal = ""): Plan {
  return { version: 1, title, goal, assumptions: [], decisions: [], risks: [], phases: [] };
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function isLoop(block: PlanBlock): block is PlanLoop {
  return block.kind === "loop";
}

/** Every block in the plan, including steps nested inside loops. */
export function allBlocks(plan: Plan): PlanBlock[] {
  const out: PlanBlock[] = [];
  for (const phase of plan.phases) {
    for (const block of phase.blocks) {
      out.push(block);
      if (isLoop(block)) out.push(...block.steps);
    }
  }
  return out;
}

export function findBlock(plan: Plan, id: string): PlanBlock | null {
  return allBlocks(plan).find((b) => b.id === id) ?? null;
}

/** Total step count, counting a loop body once per repetition when countable. */
export function planStepCount(plan: Plan): { unique: number; expanded: number } {
  let unique = 0;
  let expanded = 0;
  for (const phase of plan.phases) {
    for (const block of phase.blocks) {
      if (isLoop(block)) {
        unique += block.steps.length;
        const times = parseRepeatCount(block.repeat);
        expanded += block.steps.length * (times ?? 1);
      } else {
        unique += 1;
        expanded += 1;
      }
    }
  }
  return { unique, expanded };
}

/** Pulls a repetition count out of free text like "12 times" / "x8" / "weekly". */
export function parseRepeatCount(repeat: string | undefined): number | null {
  if (!repeat) return null;
  const m = repeat.match(/(\d+)\s*(?:times|x|rounds?|cycles?|weeks?|days?|sessions?)?/i) || repeat.match(/x\s*(\d+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : null;
}

export function planTotalMinutes(plan: Plan): number {
  let total = 0;
  for (const phase of plan.phases) {
    for (const block of phase.blocks) {
      if (isLoop(block)) {
        const times = parseRepeatCount(block.repeat) ?? 1;
        total += block.steps.reduce((s, st) => s + (st.estimateMinutes || 0), 0) * times;
      } else {
        total += block.estimateMinutes || 0;
      }
    }
  }
  return total;
}

/* ------------------------------------------------------------ normalize --- */

function normalizeStep(raw: unknown): PlanStep | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return null;
  const energy = r.energy === "low" || r.energy === "medium" || r.energy === "high" ? r.energy : undefined;
  const est = Number(r.estimateMinutes ?? r.minutes ?? r.estimate_minutes);
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId("s"),
    kind: "step",
    title,
    detail: typeof r.detail === "string" ? r.detail : typeof r.description === "string" ? r.description : undefined,
    output: typeof r.output === "string" ? r.output : undefined,
    decision: typeof r.decision === "string" ? r.decision : undefined,
    estimateMinutes: Number.isFinite(est) && est > 0 ? Math.round(est) : undefined,
    energy,
    done: r.done === true,
  };
}

function normalizeBlock(raw: unknown): PlanBlock | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.kind === "loop" || Array.isArray(r.steps)) {
    const title = typeof r.title === "string" ? r.title.trim() : "";
    if (!title) return null;
    const steps = (Array.isArray(r.steps) ? r.steps : []).map(normalizeStep).filter((s): s is PlanStep => s !== null);
    return {
      id: typeof r.id === "string" && r.id ? r.id : newId("l"),
      kind: "loop",
      title,
      repeat: typeof r.repeat === "string" && r.repeat.trim() ? r.repeat.trim() : "repeat",
      exit: typeof r.exit === "string" ? r.exit : undefined,
      steps,
    };
  }
  return normalizeStep(raw);
}

/** Accepts whatever the model returned and coerces it into a valid `Plan`. */
export function normalizePlan(raw: unknown, fallbackTitle = "Simulation"): Plan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const phasesRaw = Array.isArray(r.phases) ? r.phases : [];
  const phases: PlanPhase[] = phasesRaw
    .map((p) => {
      const pr = (p ?? {}) as Record<string, unknown>;
      const title = typeof pr.title === "string" ? pr.title.trim() : "";
      if (!title) return null;
      const blocks = (Array.isArray(pr.blocks) ? pr.blocks : Array.isArray(pr.steps) ? pr.steps : [])
        .map(normalizeBlock)
        .filter((b): b is PlanBlock => b !== null);
      return {
        id: typeof pr.id === "string" && pr.id ? pr.id : newId("p"),
        title,
        summary: typeof pr.summary === "string" ? pr.summary : undefined,
        blocks,
      } as PlanPhase;
    })
    .filter((p): p is PlanPhase => p !== null);

  const decisions = (Array.isArray(r.decisions) ? r.decisions : [])
    .map((d) => {
      const dr = (d ?? {}) as Record<string, unknown>;
      const question = typeof dr.question === "string" ? dr.question.trim() : "";
      const choice = typeof dr.choice === "string" ? dr.choice.trim() : "";
      if (!question || !choice) return null;
      return {
        id: typeof dr.id === "string" && dr.id ? dr.id : newId("d"),
        question,
        choice,
        why: typeof dr.why === "string" ? dr.why : undefined,
      } as PlanDecision;
    })
    .filter((d): d is PlanDecision => d !== null);

  const strings = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.trim().length > 0);

  return {
    version: 1,
    title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : fallbackTitle,
    goal: typeof r.goal === "string" ? r.goal : "",
    horizon: typeof r.horizon === "string" ? r.horizon : undefined,
    assumptions: strings(r.assumptions),
    decisions,
    risks: strings(r.risks),
    phases,
  };
}

/* ---------------------------------------------------------------- apply --- */

interface BlockLocation {
  block: PlanBlock;
  phase: PlanPhase;
  loop: PlanLoop | null;
  index: number;
}

function locate(plan: Plan, id: string): BlockLocation | null {
  for (const phase of plan.phases) {
    const idx = phase.blocks.findIndex((b) => b.id === id);
    if (idx !== -1) return { block: phase.blocks[idx], phase, loop: null, index: idx };
    for (const block of phase.blocks) {
      if (!isLoop(block)) continue;
      const si = block.steps.findIndex((s) => s.id === id);
      if (si !== -1) return { block: block.steps[si], phase, loop: block, index: si };
    }
  }
  return null;
}

function removeAt(list: PlanBlock[] | PlanStep[], index: number) {
  (list as PlanBlock[]).splice(index, 1);
}

function clampInsert(len: number, index: number | undefined): number {
  if (index === undefined || index === null || !Number.isFinite(index)) return len;
  return Math.max(0, Math.min(len, Math.round(index)));
}

/**
 * Applies a list of edit operations to a plan, never throwing: anything that
 * cannot be applied is reported in `errors` and the rest still lands. Returns a
 * new plan; the input is untouched.
 */
export function applyOps(input: Plan, ops: PlanOp[]): OpResult {
  const plan = clone(input);
  const applied: PlanOp[] = [];
  const errors: string[] = [];

  for (const op of ops) {
    try {
      switch (op.type) {
        case "update_meta": {
          if (typeof op.title === "string" && op.title.trim()) plan.title = op.title.trim();
          if (typeof op.goal === "string") plan.goal = op.goal;
          if (typeof op.horizon === "string") plan.horizon = op.horizon;
          if (Array.isArray(op.assumptions)) plan.assumptions = op.assumptions.filter((a) => typeof a === "string");
          if (Array.isArray(op.risks)) plan.risks = op.risks.filter((a) => typeof a === "string");
          applied.push(op);
          break;
        }
        case "set_decision": {
          const existing = op.id ? plan.decisions.find((d) => d.id === op.id) : undefined;
          if (existing) {
            existing.question = op.question;
            existing.choice = op.choice;
            existing.why = op.why;
          } else {
            plan.decisions.push({ id: op.id || newId("d"), question: op.question, choice: op.choice, why: op.why });
          }
          applied.push(op);
          break;
        }
        case "delete_decision": {
          const before = plan.decisions.length;
          plan.decisions = plan.decisions.filter((d) => d.id !== op.id);
          if (plan.decisions.length === before) errors.push(`No decision ${op.id}`);
          else applied.push(op);
          break;
        }
        case "insert_phase": {
          const phase: PlanPhase = {
            id: op.phase.id || newId("p"),
            title: op.phase.title,
            summary: op.phase.summary,
            blocks: (op.phase.blocks || []).map(normalizeBlock).filter((b): b is PlanBlock => b !== null),
          };
          plan.phases.splice(clampInsert(plan.phases.length, op.index), 0, phase);
          applied.push(op);
          break;
        }
        case "update_phase": {
          const phase = plan.phases.find((p) => p.id === op.id);
          if (!phase) { errors.push(`No phase ${op.id}`); break; }
          if (typeof op.title === "string" && op.title.trim()) phase.title = op.title.trim();
          if (typeof op.summary === "string") phase.summary = op.summary;
          applied.push(op);
          break;
        }
        case "move_phase": {
          const from = plan.phases.findIndex((p) => p.id === op.id);
          if (from === -1) { errors.push(`No phase ${op.id}`); break; }
          const [phase] = plan.phases.splice(from, 1);
          plan.phases.splice(clampInsert(plan.phases.length, op.toIndex), 0, phase);
          applied.push(op);
          break;
        }
        case "delete_phase": {
          const before = plan.phases.length;
          plan.phases = plan.phases.filter((p) => p.id !== op.id);
          if (plan.phases.length === before) errors.push(`No phase ${op.id}`);
          else applied.push(op);
          break;
        }
        case "insert_block": {
          const block = normalizeBlock(op.block);
          if (!block) { errors.push("Block needs a title"); break; }
          if (op.loopId) {
            const loop = allBlocks(plan).find((b) => b.id === op.loopId);
            if (!loop || !isLoop(loop)) { errors.push(`No loop ${op.loopId}`); break; }
            if (isLoop(block)) { errors.push("Loops cannot nest"); break; }
            loop.steps.splice(clampInsert(loop.steps.length, op.index), 0, block);
          } else {
            const phase = op.phaseId ? plan.phases.find((p) => p.id === op.phaseId) : plan.phases[plan.phases.length - 1];
            if (!phase) { errors.push(`No phase ${op.phaseId ?? "(any)"}`); break; }
            phase.blocks.splice(clampInsert(phase.blocks.length, op.index), 0, block);
          }
          applied.push(op);
          break;
        }
        case "update_block": {
          const found = locate(plan, op.id);
          if (!found) { errors.push(`No step ${op.id}`); break; }
          const b = found.block;
          if (typeof op.title === "string" && op.title.trim()) b.title = op.title.trim();
          if (isLoop(b)) {
            if (typeof op.repeat === "string" && op.repeat.trim()) b.repeat = op.repeat.trim();
            if (typeof op.exit === "string") b.exit = op.exit;
          } else {
            if (typeof op.detail === "string") b.detail = op.detail;
            if (typeof op.output === "string") b.output = op.output;
            if (typeof op.decision === "string") b.decision = op.decision;
            if (typeof op.estimateMinutes === "number" && op.estimateMinutes > 0) b.estimateMinutes = Math.round(op.estimateMinutes);
            if (op.energy === "low" || op.energy === "medium" || op.energy === "high") b.energy = op.energy;
            if (typeof op.done === "boolean") b.done = op.done;
          }
          applied.push(op);
          break;
        }
        case "move_block": {
          const found = locate(plan, op.id);
          if (!found) { errors.push(`No step ${op.id}`); break; }
          const moving = found.block;
          const targetLoopId = op.toLoopId;
          if (targetLoopId) {
            const loop = allBlocks(plan).find((b) => b.id === targetLoopId);
            if (!loop || !isLoop(loop)) { errors.push(`No loop ${targetLoopId}`); break; }
            if (isLoop(moving)) { errors.push("A loop cannot move inside a loop"); break; }
            if (found.loop) removeAt(found.loop.steps, found.index);
            else removeAt(found.phase.blocks, found.index);
            loop.steps.splice(clampInsert(loop.steps.length, op.toIndex), 0, moving);
          } else {
            const phase = op.toPhaseId ? plan.phases.find((p) => p.id === op.toPhaseId) : found.phase;
            if (!phase) { errors.push(`No phase ${op.toPhaseId}`); break; }
            if (found.loop) removeAt(found.loop.steps, found.index);
            else removeAt(found.phase.blocks, found.index);
            phase.blocks.splice(clampInsert(phase.blocks.length, op.toIndex), 0, moving);
          }
          applied.push(op);
          break;
        }
        case "delete_block": {
          const found = locate(plan, op.id);
          if (!found) { errors.push(`No step ${op.id}`); break; }
          if (found.loop) removeAt(found.loop.steps, found.index);
          else removeAt(found.phase.blocks, found.index);
          applied.push(op);
          break;
        }
        default:
          errors.push(`Unknown operation: ${(op as { type?: string }).type ?? "?"}`);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Operation failed");
    }
  }

  return { plan, applied, errors };
}

/** Coerces raw model output into ops we know how to apply. */
export function normalizeOps(raw: unknown): PlanOp[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set([
    "update_meta", "set_decision", "delete_decision",
    "insert_phase", "update_phase", "move_phase", "delete_phase",
    "insert_block", "update_block", "move_block", "delete_block",
  ]);
  return raw.filter((o): o is PlanOp => {
    const t = (o as { type?: unknown } | null)?.type;
    return typeof t === "string" && known.has(t);
  });
}

/** One-line, human-readable description of an op, for the diff panel. */
export function describeOp(op: PlanOp, plan: Plan): { verb: "add" | "edit" | "move" | "remove"; text: string } {
  const label = (id: string) => findBlock(plan, id)?.title || plan.phases.find((p) => p.id === id)?.title || id;
  switch (op.type) {
    case "update_meta": return { verb: "edit", text: "Update plan overview" };
    case "set_decision": return { verb: "edit", text: `Decision: ${op.question} → ${op.choice}` };
    case "delete_decision": return { verb: "remove", text: "Remove a decision" };
    case "insert_phase": return { verb: "add", text: `New phase "${op.phase.title}"` };
    case "update_phase": return { verb: "edit", text: `Edit phase "${label(op.id)}"` };
    case "move_phase": return { verb: "move", text: `Move phase "${label(op.id)}" to position ${op.toIndex + 1}` };
    case "delete_phase": return { verb: "remove", text: `Remove phase "${label(op.id)}"` };
    case "insert_block": return { verb: "add", text: `Add "${op.block.title}"` };
    case "update_block": return { verb: "edit", text: `Edit "${label(op.id)}"` };
    case "move_block": return { verb: "move", text: `Move "${label(op.id)}" to position ${op.toIndex + 1}` };
    case "delete_block": return { verb: "remove", text: `Remove "${label(op.id)}"` };
    default: return { verb: "edit", text: "Change" };
  }
}

/**
 * Compact text rendering of a plan, ids included, for the AI to reason over and
 * address individual blocks in its edit operations.
 */
export function planToOutline(plan: Plan): string {
  const lines: string[] = [];
  lines.push(`TITLE: ${plan.title}`);
  if (plan.goal) lines.push(`GOAL: ${plan.goal}`);
  if (plan.horizon) lines.push(`HORIZON: ${plan.horizon}`);
  if (plan.assumptions.length) lines.push(`ASSUMPTIONS: ${plan.assumptions.join(" | ")}`);
  if (plan.risks.length) lines.push(`RISKS: ${plan.risks.join(" | ")}`);
  if (plan.decisions.length) {
    lines.push("DECISIONS:");
    for (const d of plan.decisions) lines.push(`  [${d.id}] ${d.question} -> ${d.choice}${d.why ? ` (${d.why})` : ""}`);
  }
  plan.phases.forEach((phase, pi) => {
    lines.push(`PHASE ${pi} [${phase.id}] ${phase.title}${phase.summary ? ` — ${phase.summary}` : ""}`);
    phase.blocks.forEach((block, bi) => {
      if (isLoop(block)) {
        lines.push(`  ${bi}. LOOP [${block.id}] ${block.title} (repeat: ${block.repeat}${block.exit ? `; exit: ${block.exit}` : ""})`);
        block.steps.forEach((step, si) => {
          lines.push(`     ${si}. [${step.id}] ${step.title}${step.estimateMinutes ? ` (${step.estimateMinutes}m)` : ""}${step.done ? " [done]" : ""}`);
        });
      } else {
        lines.push(`  ${bi}. [${block.id}] ${block.title}${block.estimateMinutes ? ` (${block.estimateMinutes}m)` : ""}${block.energy ? ` [${block.energy}]` : ""}${block.done ? " [done]" : ""}${block.output ? ` -> ${block.output}` : ""}`);
      }
    });
  });
  return lines.join("\n");
}
