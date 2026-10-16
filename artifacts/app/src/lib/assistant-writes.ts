import { supabase } from "@/integrations/supabase/client";
import { TRACKER_METRICS, type TrackerMetric } from "@/lib/tracker-data";
import { computeEntryXp, mergeConfig, type TrackerXpConfig } from "@/lib/tracker-xp";
import { activeStep, DEFAULT_STEP_XP, type PathStep } from "@/lib/path-data";
import { findPathByName } from "@/lib/path-writes";
import { notifyPathsChanged } from "@/hooks/usePaths";
import { PLANNING_TASKS_CHANGED_EVENT } from "@/hooks/usePlanningState";
import { ensureBoard, getRememberedBoard } from "@/lib/planning-board";
import { settleDrops, statePatch, type PlanNode } from "@/lib/planning-model";
import { answerChoices, matchChoice } from "@/lib/planning-list";
import {
  CALENDAR_EVENTS_CHANGED_EVENT,
  FINANCE_CHANGED_EVENT,
  TRACKER_ENTRIES_CHANGED_EVENT,
  USER_SETTINGS_CHANGED_EVENT,
  LIBRARY_CHANGED_EVENT,
  emitAppEvent,
} from "@/lib/app-events";
import type { BookDraft } from "@/lib/assistant-actions";
import { MISSION_PRESETS_CHANGED_EVENT, normalizePresetName, parseMissionMap, snapshotMissions, type MissionMap } from "@/lib/mission-presets";
import { todayKey } from "@/lib/today";

/**
 * Writes the assistant performs outside the Home state provider. Each one goes
 * to the same tables with the same rules as the matching button in the app,
 * then fires the event that page-scoped hooks listen to, so an open page
 * updates without a reload. XP is returned, never added here: the caller owns
 * the dashboard state and adds it through the same path as a click would.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type WriteResult<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Exact (normalised) name first, then a unique containment either way. */
export function matchByName<T>(items: T[], wanted: string, nameOf: (t: T) => string): T | null {
  const w = norm(wanted);
  if (!w) return null;
  const exact = items.find((i) => norm(nameOf(i)) === w);
  if (exact) return exact;
  const partial = items.filter((i) => {
    const n = norm(nameOf(i));
    return n.length > 0 && (n.includes(w) || w.includes(n));
  });
  return partial.length === 1 ? partial[0] : null;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** The user's metrics (custom ones when set, the built-in list otherwise). */
export async function loadMetrics(userId: string): Promise<TrackerMetric[]> {
  const { data } = await supabase
    .from("user_metrics")
    .select("id,label,unit,icon,category_id,color_var,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (!data || data.length === 0) return TRACKER_METRICS;
  return data.map((m) => ({
    id: m.id,
    label: m.label,
    unit: m.unit,
    icon: m.icon,
    categoryId: m.category_id,
    categoryName: m.category_id,
    categoryIcon: "📊",
    colorVar: m.color_var,
  })) as TrackerMetric[];
}

/**
 * Log a value for a metric today and award Stats XP with the user's own rules
 * (same per-entry formula as the Stats page, no daily cap).
 */
export async function logMetricEntry(
  userId: string,
  metricRef: string,
  value: number,
): Promise<WriteResult<{ metric: TrackerMetric; xp: number }>> {
  const metrics = await loadMetrics(userId);
  const metric = metrics.find((m) => m.id === metricRef) ?? matchByName(metrics, metricRef, (m) => m.label);
  if (!metric) return { ok: false, error: `Nie znaleziono metryki „${metricRef}”` };

  const date = todayKey();
  const { error } = await supabase.from("tracker_entries").insert({ user_id: userId, metric_id: metric.id, value, date });
  if (error) return { ok: false, error: "Nie udało się zapisać wpisu" };

  const { data: onb } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
  const raw = ((onb?.preferences as Record<string, unknown> | null)?.trackerXp ?? null) as Partial<TrackerXpConfig> | null;
  const config = mergeConfig(raw, metrics);
  const xp = computeEntryXp(metric, value, config);
  if (xp > 0) {
    await supabase.from("tracker_xp_grants").insert({ user_id: userId, source: "entry", ref_id: metric.id, xp, date });
  }
  emitAppEvent(TRACKER_ENTRIES_CHANGED_EVENT);
  return { ok: true, metric, xp };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Log today's rep of the active step of a path, like the Home strip button. */
export async function logPathStepToday(
  userId: string,
  pathName: string,
): Promise<WriteResult<{ pathName: string; stepTitle: string; xp: number; categoryId: string | null; finished: boolean }>> {
  const target = await findPathByName(userId, pathName);
  if (!target) return { ok: false, error: `Nie znaleziono ścieżki „${pathName}”` };

  const [{ data: path }, { data: stepRows }] = await Promise.all([
    supabase.from("paths").select("*").eq("id", target.id).maybeSingle(),
    supabase.from("path_steps").select("*").eq("path_id", target.id),
  ]);
  const step = activeStep((stepRows as unknown as PathStep[]) || []);
  if (!step) return { ok: false, error: `Ścieżka „${target.name}” nie ma aktywnego kroku` };

  const date = todayKey();
  const { error } = await supabase
    .from("path_step_logs")
    .insert({ user_id: userId, step_id: step.id, path_id: target.id, date, xp: step.xp });
  if (error) {
    // Unique (step_id, date): already logged today. Anything else is a real failure.
    if (error.code === "23505") return { ok: false, error: `„${step.title}” jest już zalogowane na dziś` };
    return { ok: false, error: `Nie udało się zalogować „${step.title}”: ${error.message}` };
  }

  const repsDone = step.reps_done + 1;
  const targetReps = step.mode === "reps" ? Math.max(1, step.reps_target) : 1;
  const finished = repsDone >= targetReps;
  const { error: stepError } = await supabase
    .from("path_steps")
    .update({ reps_done: repsDone, done: finished, done_at: finished ? new Date().toISOString() : null })
    .eq("id", step.id);
  if (stepError) {
    // Take the day back out so the log and the step's count stay in step and
    // a retry is not refused as "already logged". No XP has been given yet.
    await supabase.from("path_step_logs").delete().eq("user_id", userId).eq("step_id", step.id).eq("date", date);
    notifyPathsChanged();
    return { ok: false, error: `Nie udało się zapisać postępu „${step.title}”: ${stepError.message}` };
  }
  notifyPathsChanged();
  return {
    ok: true,
    pathName: target.name,
    stepTitle: step.title,
    xp: step.xp,
    categoryId: (path as { category_id?: string | null } | null)?.category_id ?? null,
    finished,
  };
}

export interface NewPathStep {
  title: string;
  stage?: string | null;
  days?: number;
  xp?: number;
}

export async function createPath(
  userId: string,
  input: { name: string; diagnosis?: string; categoryId?: string | null; steps: NewPathStep[] },
): Promise<WriteResult<{ id: string }>> {
  const { count } = await supabase.from("paths").select("id", { count: "exact", head: true }).eq("user_id", userId);
  const { data, error } = await supabase
    .from("paths")
    .insert({
      user_id: userId,
      name: input.name,
      category_id: input.categoryId ?? null,
      sort_order: count ?? 0,
      ...(input.diagnosis ? { diagnosis: input.diagnosis } : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Nie udało się utworzyć ścieżki" };
  if (input.steps.length > 0) {
    const rows = input.steps.map((s, i) => {
      const reps = Math.max(1, Math.round(s.days || 1));
      return {
        user_id: userId,
        path_id: data.id,
        title: s.title,
        stage: s.stage ?? null,
        mode: reps > 1 ? "reps" : "once",
        reps_target: reps,
        xp: s.xp ?? DEFAULT_STEP_XP,
        sort_order: i,
      };
    });
    const { error: stepsError } = await supabase.from("path_steps").insert(rows);
    if (stepsError) {
      // A path without its steps is not what was confirmed, and leaving it
      // would make a retry create a second one with the same name.
      await supabase.from("paths").delete().eq("id", data.id).eq("user_id", userId);
      return { ok: false, error: `Nie udało się zapisać kroków ścieżki „${input.name}”: ${stepsError.message}` };
    }
  }
  notifyPathsChanged();
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** A planning board as the assistant's toasts name it. */
export interface PlanningBoardLabel {
  id: string;
  name: string;
  emoji: string;
}

/**
 * The board new assistant-made planning rows go on: the board the user last
 * opened in Planning (remembered in this browser), else the newest board, else
 * a new "📥 Inbox" (ensureBoard). Every Planning view shows one board, so a row
 * without one would be saved but never seen.
 */
export async function defaultPlanningBoard(userId: string): Promise<WriteResult<{ board: PlanningBoardLabel }>> {
  const picked = await ensureBoard(userId);
  if ("error" in picked) return { ok: false, error: picked.error };
  return { ok: true, board: await boardLabel(picked.id) };
}

/** A board's name for a toast; a failed read still leaves a usable board id. */
async function boardLabel(id: string): Promise<PlanningBoardLabel> {
  const { data } = await supabase.from("planning_boards").select("name,emoji").eq("id", id).maybeSingle();
  return { id, name: data?.name ?? "", emoji: data?.emoji ?? "" };
}

/** A v4 UUID, also where crypto.randomUUID is missing (plain-http LAN previews). */
function newNodeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A node the assistant writes (the PlanDraft of an action, plus an optional note). */
export interface AssistantNode {
  title: string;
  ask?: boolean;
  parentIndex?: number;
  notes?: string;
}

/** One row of the single insert an assistant tree becomes. */
export interface AssistantNodeRow {
  id: string;
  user_id: string;
  board_id: string;
  parent_id: string | null;
  title: string;
  ask: boolean;
  done: false;
  dropped: false;
  notes: string;
  sort_order?: number;
}

/**
 * The rows of ONE insert for an assistant-made tree, with client ids so a child
 * names its parent in the same statement (no insert-then-link, so no half-made
 * tree on a failure). A node's parent is an EARLIER node (coerceNodes keeps it
 * so); anything else hangs from `parentId` (null = a new root). Children of a
 * new node are numbered 1..n here; rows that join existing siblings leave
 * sort_order out, so the database puts them last, in order. The old columns
 * (level, deadline, standalone, project_id...) are not written. A question
 * keeps its '?' title and has no guess: the user writes his own priors.
 */
export function planAssistantNodes(
  nodes: AssistantNode[],
  ctx: { userId: string; boardId: string; parentId: string | null },
  newId: () => string = newNodeId,
): AssistantNodeRow[] {
  const ids = nodes.map(() => newId());
  const nextOrder = new Map<number, number>();
  return nodes.map((n, i) => {
    const p = n.parentIndex;
    const inBatch = typeof p === "number" && p >= 0 && p < i;
    const row: AssistantNodeRow = {
      id: ids[i],
      user_id: ctx.userId,
      board_id: ctx.boardId,
      parent_id: inBatch ? ids[p] : ctx.parentId,
      title: n.title,
      // Actions restored from before `ask` existed carry only the title.
      ask: typeof n.ask === "boolean" ? n.ask : n.title.trim().endsWith("?"),
      done: false,
      dropped: false,
      notes: n.notes ?? "",
    };
    if (inBatch) {
      const order = (nextOrder.get(p) ?? 0) + 1;
      nextOrder.set(p, order);
      row.sort_order = order;
    }
    return row;
  });
}

/** The columns the attach and completion matches read (rows come from select("*")). */
interface NodeRef {
  id: string;
  title: string;
  board_id: string | null;
  parent_id?: string | null;
  done?: boolean;
  dropped?: boolean;
  ask?: boolean;
}

/** Open first, then ticked or settled, then dropped. */
const liveness = (n: NodeRef) => (n.dropped ? 2 : n.done ? 1 : 0);

/** True when the normalised `inner` appears in `outer` as a run of whole words ("ai" is not in "domain"). */
const hasWords = (outer: string, inner: string) => ` ${outer} `.includes(` ${inner} `);
const wordCount = (s: string) => (s ? s.split(" ").length : 0);

/**
 * The existing node extend_mindmap hangs new nodes from. The board open in
 * Planning is searched before all boards; within each, an exact (normalised)
 * title wins; then titles that contain the text as whole words, or are
 * contained in it as whole words when they are at least two words or half of
 * it ("SEO" alone is not "Kampania SEO na Instagramie"). Several candidates: an
 * open node beats a closed one beats a dropped one, then the largest share of
 * words in common, then the shortest title.
 */
export function findAttachTarget<T extends NodeRef>(rows: T[], attachTo: string, boardId: string | null): T | null {
  const w = norm(attachTo);
  if (!w) return null;
  const wWords = wordCount(w);
  const pick = (pool: T[]): T | null => {
    const exact = pool.filter((r) => norm(r.title) === w);
    if (exact.length > 0) return [...exact].sort((a, b) => liveness(a) - liveness(b) || a.title.length - b.title.length)[0];
    const hits: { r: T; share: number }[] = [];
    for (const r of pool) {
      const n = norm(r.title);
      if (!n) continue;
      const nWords = wordCount(n);
      if (hasWords(n, w)) hits.push({ r, share: wWords / nWords });
      else if (hasWords(w, n) && (nWords >= 2 || nWords * 2 >= wWords)) hits.push({ r, share: nWords / wWords });
    }
    if (hits.length === 0) return null;
    hits.sort((a, b) => liveness(a.r) - liveness(b.r) || b.share - a.share || a.r.title.length - b.r.title.length);
    return hits[0].r;
  };
  const onBoard = boardId ? pick(rows.filter((r) => r.board_id === boardId)) : null;
  return onBoard ?? pick(rows);
}

/** What the model's title for complete_task matched: one node, several, or none. */
export type OpenNodeMatch<T> = { node: T } | { ambiguous: T[] } | null;

/**
 * "Parent > Title" (or "Parent › Title"): how the model names the parent to
 * tell two open nodes with the same title apart (sibling options often carry
 * the same test question).
 */
function splitParent(title: string): { title: string; parent: string | null } {
  const parts = title.split(/\s+[>›]\s+/);
  return parts.length > 1
    ? { title: parts[parts.length - 1], parent: parts[parts.length - 2] }
    : { title, parent: null };
}

/**
 * The open node complete_task means: the board open in Planning first, then
 * every board, each with matchByName's rule (exact, then partial), except that
 * two exact matches are as ambiguous as two partial ones: the first of two
 * identical titles is a coin toss, and the card could not tell them apart. A
 * "Parent > Title" form keeps only the nodes under that parent. Ambiguous on
 * the board falls through to all boards.
 */
export function matchOpenNodes<T extends NodeRef>(rows: T[], title: string, boardId: string | null): OpenNodeMatch<T> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { title: wantedTitle, parent } = splitParent(title);
  const w = norm(wantedTitle);
  if (!w) return null;
  let open = rows.filter((r) => !r.done && !r.dropped);
  if (parent) {
    const p = norm(parent);
    open = open.filter((r) => {
      const up = r.parent_id ? byId.get(r.parent_id) : undefined;
      const n = up ? norm(up.title) : "";
      return !!n && (n === p || n.includes(p) || p.includes(n));
    });
  }
  const pick = (pool: T[]): OpenNodeMatch<T> => {
    const exact = pool.filter((r) => norm(r.title) === w);
    if (exact.length === 1) return { node: exact[0] };
    if (exact.length > 1) return { ambiguous: exact };
    const partial = pool.filter((r) => {
      const n = norm(r.title);
      return n.length > 0 && (n.includes(w) || w.includes(n));
    });
    if (partial.length === 1) return { node: partial[0] };
    return partial.length > 1 ? { ambiguous: partial } : null;
  };
  const onBoard = boardId ? pick(open.filter((r) => r.board_id === boardId)) : null;
  if (onBoard && "node" in onBoard) return onBoard;
  const all = pick(open);
  if (all && "node" in all) return all;
  return onBoard ?? all;
}

/** matchOpenNodes, as one node or none. */
export function matchOpenNode<T extends NodeRef>(rows: T[], title: string, boardId: string | null): T | null {
  const m = matchOpenNodes(rows, title, boardId);
  return m && "node" in m ? m.node : null;
}

/** The title of the node above `n`, if any. */
function parentTitleOf<T extends NodeRef>(n: T, rows: T[]): string | null {
  const up = n.parent_id ? rows.find((r) => r.id === n.parent_id) : undefined;
  return up ? up.title : null;
}

/** Polish refusal for a complete_task title that fits several open nodes, naming where each one is. */
export function ambiguousNodeError<T extends NodeRef>(title: string, candidates: T[], rows: T[]): string {
  const where = candidates.slice(0, 5).map((c) => {
    const p = parentTitleOf(c, rows);
    return p ? `„${c.title}” pod „${p}”` : `„${c.title}” na górze planu`;
  });
  const first = candidates.find((c) => parentTitleOf(c, rows));
  const example = first ? ` (np. „${parentTitleOf(first, rows)} > ${first.title}”)` : "";
  return `„${splitParent(title).title}” pasuje do ${candidates.length} otwartych węzłów w Planning: ${where.join(", ")}${candidates.length > 5 ? ", …" : ""}. Napisz, o który chodzi${example}.`;
}

/** "1 węzeł", "3 węzły", "5 węzłów". */
export function nodesLabel(n: number): string {
  if (n === 1) return "1 węzeł";
  const few = n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14);
  return `${n} ${few ? "węzły" : "węzłów"}`;
}

/**
 * Writes an assistant-made tree in ONE insert: under the node `attachTo` names
 * (extend_mindmap) on that node's board, or as new roots on the default board
 * (add_task, add_mindmap_nodes, and extend_mindmap with no match). The whole
 * tree lands or none of it does.
 */
export async function addPlanningNodes(
  userId: string,
  nodes: AssistantNode[],
  opts: { attachTo?: string; attachId?: string } = {},
): Promise<WriteResult<{ created: number; board: PlanningBoardLabel; attachedTo: string | null }>> {
  if (nodes.length === 0) return { ok: false, error: "Brak węzłów do dodania" };

  let target: NodeRef | null = null;
  if (opts.attachTo || opts.attachId) {
    // select("*"): naming a column the database has not got yet would turn
    // "attach under X" into "X not found".
    const { data, error } = await supabase.from("planning_tasks").select("*").eq("user_id", userId).limit(2000);
    if (error) return { ok: false, error: `Nie udało się odczytać planu: ${error.message}` };
    const rows = (data || []) as unknown as NodeRef[];
    // The node the confirm card named; matched again by title only if it is gone.
    target = (opts.attachId ? rows.find((r) => r.id === opts.attachId) : undefined) ??
      (opts.attachTo ? findAttachTarget(rows, opts.attachTo, getRememberedBoard(userId)) : null);
  }

  // New nodes live where the node they hang from lives (named in the toast,
  // as it may not be the board on screen); roots go on the default board.
  let board: PlanningBoardLabel;
  if (target?.board_id) {
    board = await boardLabel(target.board_id);
  } else {
    const r = await defaultPlanningBoard(userId);
    if (!r.ok) return r;
    board = r.board;
  }

  const rows = planAssistantNodes(nodes, { userId, boardId: board.id, parentId: target?.id ?? null });
  const { error } = await supabase.from("planning_tasks").insert(rows);
  if (error) return { ok: false, error: `Nie udało się zapisać ${nodesLabel(rows.length)} w Planning: ${error.message}` };
  emitAppEvent(PLANNING_TASKS_CHANGED_EVENT);
  return { ok: true, created: rows.length, board, attachedTo: target?.title ?? null };
}

/**
 * Where extend_mindmap's nodes will go, resolved before the confirm card so
 * the card names the node itself (or says they become new roots), not the
 * model's raw text. Null target: nothing matches.
 */
export async function resolveAttachTarget(
  userId: string,
  attachTo: string,
): Promise<WriteResult<{ target: { id: string; title: string } | null }>> {
  const { data, error } = await supabase.from("planning_tasks").select("*").eq("user_id", userId).limit(2000);
  if (error) return { ok: false, error: `Nie udało się odczytać planu: ${error.message}` };
  const hit = findAttachTarget((data || []) as unknown as NodeRef[], attachTo, getRememberedBoard(userId));
  return { ok: true, target: hit ? { id: hit.id, title: hit.title } : null };
}

/** What complete_task found, before the confirm card. */
export interface PlanningCompletionMatch {
  nodeId: string;
  title: string;
  ask: boolean;
  /** The node above it, so the card tells two same-titled nodes apart. */
  parentTitle: string | null;
  /** Open options of the question that the answer drops as "chosen over" (it names one of them). */
  drops: number;
}

/**
 * The plan for complete_task: every row, closed ones too (the parent that
 * tells two open nodes apart may be settled, and an option's tick history
 * decides whether an answer names it), open rows first so a very large plan
 * never loses them to the limit.
 */
async function readPlan(userId: string) {
  const { data, error } = await supabase.from("planning_tasks").select("*").eq("user_id", userId)
    .order("done", { ascending: true }).limit(2000);
  return { rows: (data || []) as unknown as (NodeRef & Record<string, unknown>)[], error };
}

/** A planning_tasks row read with select("*") as a PlanNode (old rows lack the open-loops columns). */
function asPlanNode(r: Record<string, unknown>): PlanNode {
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const verdict = r.verdict;
  return {
    id: String(r.id ?? ""),
    board_id: str(r.board_id),
    parent_id: str(r.parent_id),
    title: String(r.title ?? ""),
    ask: r.ask === true,
    done: r.done === true,
    dropped: r.dropped === true,
    guess: str(r.guess),
    outcome: str(r.outcome),
    verdict: verdict === "right" || verdict === "wrong" || verdict === "unknown" ? verdict : null,
    closed_at: str(r.closed_at),
    sort_order: Number(r.sort_order) || 0,
    created_at: String(r.created_at ?? ""),
  };
}

/**
 * Settling a question with an answer that names one of its open options is
 * the List's tap on that option: the other open options (and their open work)
 * are dropped as "chosen over" with the question's closed_at. The ids to drop.
 */
function answerDrops(questionId: string, outcome: string, rows: Record<string, unknown>[]): string[] {
  const nodes = rows.map(asPlanNode);
  const choice = matchChoice(outcome, answerChoices(questionId, nodes));
  return choice ? settleDrops(questionId, choice.id, nodes) : [];
}

/** Polish refusal for settling a question without its answer. */
export function missingAnswerError(title: string): string {
  return `„${title}” to otwarte pytanie: napisz, jaka jest odpowiedź, a wtedy je zamknę.`;
}

/**
 * Finds the open node complete_task means, so the confirm card can name it
 * exactly. A question without an answer is refused here, before any card: the
 * assistant never writes the answer for the user.
 */
export async function resolvePlanningCompletion(
  userId: string,
  input: { title: string; outcome?: string },
): Promise<WriteResult<PlanningCompletionMatch>> {
  const { rows, error } = await readPlan(userId);
  if (error) return { ok: false, error: `Nie udało się odczytać planu: ${error.message}` };
  const m = matchOpenNodes(rows, input.title, getRememberedBoard(userId));
  if (m && "ambiguous" in m) return { ok: false, error: ambiguousNodeError(input.title, m.ambiguous, rows) };
  const node = m?.node;
  if (!node) return { ok: false, error: `Nie znaleziono otwartego kroku ani pytania „${input.title}” w Planning` };
  const ask = !!node.ask;
  const outcome = input.outcome?.trim() || "";
  if (ask && !outcome) return { ok: false, error: missingAnswerError(node.title) };
  return {
    ok: true,
    nodeId: node.id,
    title: node.title,
    ask,
    parentTitle: parentTitleOf(node, rows),
    drops: ask ? answerDrops(node.id, outcome, rows).length : 0,
  };
}

/**
 * Closes an open planning node: a Step is ticked, a Question is settled with
 * the user's answer (refused without one). One update writes done, dropped,
 * outcome, verdict and closed_at, the same patch as the List (statePatch). The
 * verdict is never set: grading a guess is the user's.
 */
export async function completePlanningTask(
  userId: string,
  input: { title: string; outcome?: string; nodeId?: string },
): Promise<WriteResult<{ title: string; ask: boolean }>> {
  // The whole plan: a question's answer may name one of its options, whose siblings it then drops.
  const { rows, error } = await readPlan(userId);
  if (error) return { ok: false, error: `Nie udało się odczytać planu: ${error.message}` };
  let row: (NodeRef & Record<string, unknown>) | null = null;
  if (input.nodeId) {
    row = rows.find((r) => r.id === input.nodeId) ?? null;
    if (!row) {
      // Past the read limit, or gone: ask for that one row.
      const { data: one, error: oneError } = await supabase.from("planning_tasks").select("*").eq("user_id", userId).eq("id", input.nodeId).maybeSingle();
      if (oneError) return { ok: false, error: `Nie udało się odczytać planu: ${oneError.message}` };
      row = (one as unknown as (NodeRef & Record<string, unknown>) | null) ?? null;
    }
    if (!row) return { ok: false, error: `„${input.title}” nie ma już w Planning` };
    if (row.done) return { ok: false, error: `„${String(row.title)}” jest już zamknięte` };
  } else {
    const m = matchOpenNodes(rows, input.title, getRememberedBoard(userId));
    if (m && "ambiguous" in m) return { ok: false, error: ambiguousNodeError(input.title, m.ambiguous, rows) };
    row = m?.node ?? null;
    if (!row) return { ok: false, error: `Nie znaleziono otwartego kroku ani pytania „${input.title}” w Planning` };
  }

  const title = String(row.title ?? input.title);
  // A row read before the open-loops migration has no `ask`: tick it the old way.
  if (!("ask" in row)) {
    const { error } = await supabase.from("planning_tasks").update({ done: true }).eq("id", String(row.id)).eq("user_id", userId);
    if (error) return { ok: false, error: `Nie udało się zamknąć „${title}”` };
    emitAppEvent(PLANNING_TASKS_CHANGED_EVENT);
    return { ok: true, title, ask: false };
  }

  const ask = !!row.ask;
  const outcome = input.outcome?.trim() || "";
  if (ask && !outcome) return { ok: false, error: missingAnswerError(title) };
  const node = asPlanNode(row);
  // A step is just ticked (an outcome the model sent is not its to write).
  const patch = statePatch(node, ask ? "settled" : "done", ask ? { outcome, verdict: null } : { verdict: null }, new Date().toISOString());
  // The options it was chosen over first, the question last: a failure in between leaves it open.
  const drops = ask ? answerDrops(node.id, outcome, rows) : [];
  for (let i = 0; i < drops.length; i += 100) {
    const ids = drops.slice(i, i + 100);
    const { error: dropError } = await supabase.from("planning_tasks")
      .update({ done: true, dropped: true, closed_at: patch.closed_at })
      .eq("user_id", userId).in("id", ids);
    if (dropError) return { ok: false, error: `Nie udało się zamknąć „${title}”: ${dropError.message}` };
  }
  const { error: writeError } = await supabase.from("planning_tasks").update(patch).eq("id", node.id).eq("user_id", userId);
  if (writeError) return { ok: false, error: `Nie udało się zamknąć „${title}”: ${writeError.message}` };
  emitAppEvent(PLANNING_TASKS_CHANGED_EVENT);
  return { ok: true, title, ask };
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

/** "Deep Work: Rules for..." and "deep work" are the same book on the shelf. */
const shelfKey = (title: string) => norm(title.split(/[:(]/)[0]);

/**
 * Puts books on the shelf in the order given (first on top), skipping any
 * already there. A book added as finished is stamped finished today.
 */
export async function addBooks(
  userId: string,
  books: BookDraft[],
): Promise<WriteResult<{ added: string[]; skipped: string[] }>> {
  const { data, error: readError } = await supabase.from("user_books").select("title").eq("user_id", userId);
  if (readError) return { ok: false, error: "Nie udało się odczytać biblioteki" };
  const have = new Set((data || []).map((b) => shelfKey(b.title)));
  const added: string[] = [];
  const skipped: string[] = [];
  const now = Date.now();
  const rows = [];
  for (const b of books) {
    const key = shelfKey(b.title);
    if (!key || have.has(key)) { skipped.push(b.title); continue; }
    have.add(key);
    const finished = b.status === "finished";
    rows.push({
      user_id: userId,
      title: b.title,
      author: b.author || "",
      status: b.status || "to-read",
      total_pages: b.totalPages || 0,
      pages_read: finished ? b.totalPages || 0 : 0,
      tags: b.tags || [],
      notes: b.notes || "",
      finished_at: finished ? new Date(now).toISOString() : null,
      // Distinct times keep the list in the order given.
      created_at: new Date(now - added.length).toISOString(),
    });
    added.push(b.title);
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("user_books").insert(rows);
    if (error) return { ok: false, error: "Nie udało się dodać książek" };
    emitAppEvent(LIBRARY_CHANGED_EVENT);
  }
  return { ok: true, added, skipped };
}

// ---------------------------------------------------------------------------
// Calendar & finance
// ---------------------------------------------------------------------------

export async function addCalendarEvent(
  userId: string,
  input: { title: string; date: string; time?: string; notes?: string; tag?: string },
): Promise<WriteResult> {
  const title = input.time ? `${input.time} ${input.title}` : input.title;
  const { error } = await supabase
    .from("calendar_events")
    .insert({ user_id: userId, title, date: input.date, notes: input.notes || "", tag: input.tag || "" });
  if (error) return { ok: false, error: "Nie udało się dodać wydarzenia" };
  emitAppEvent(CALENDAR_EVENTS_CHANGED_EVENT);
  return { ok: true };
}

export async function addFinanceTransaction(
  userId: string,
  input: { type: "expense" | "income"; amount: number; title: string; category?: string; date?: string },
): Promise<WriteResult<{ category: string }>> {
  const { data: cats } = await supabase.from("finance_categories").select("name,kind").eq("user_id", userId);
  const list = cats || [];
  const ofKind = list.filter((c) => !c.kind || c.kind === input.type || c.kind === "both");
  const picked =
    (input.category ? matchByName(ofKind.length ? ofKind : list, input.category, (c) => c.name)?.name : null) ??
    input.category?.trim() ??
    (input.type === "income" ? "Income" : "Other");
  const { error } = await supabase.from("finance_transactions").insert({
    user_id: userId,
    type: input.type,
    amount: input.amount,
    title: input.title,
    category: picked,
    date: input.date || todayKey(),
  });
  if (error) return { ok: false, error: "Nie udało się dodać transakcji" };
  emitAppEvent(FINANCE_CHANGED_EVENT);
  return { ok: true, category: picked };
}

// ---------------------------------------------------------------------------
// Mission presets
// ---------------------------------------------------------------------------

/**
 * Save a new mission set (written by the assistant) as a preset. An existing
 * preset of that name is overwritten. `applied` stamps last_applied_at so the
 * picker shows it as active when the caller also loads it onto Home.
 */
export async function createPresetFromMissions(
  userId: string,
  input: { name: string; emoji?: string; description?: string },
  missions: MissionMap,
  applied: boolean,
): Promise<WriteResult<{ name: string; updated: boolean }>> {
  const name = normalizePresetName(input.name);
  if (!name) return { ok: false, error: "Podaj nazwę presetu" };
  const clean = parseMissionMap(missions) as unknown as never;
  const stamp = applied ? { last_applied_at: new Date().toISOString() } : {};
  const { data: existing } = await supabase.from("mission_presets").select("id").eq("user_id", userId).eq("name", name).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("mission_presets")
      .update({
        missions: clean,
        updated_at: new Date().toISOString(),
        ...(input.emoji ? { emoji: input.emoji } : {}),
        ...(input.description ? { description: input.description.slice(0, 200) } : {}),
        ...stamp,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  } else {
    const { count } = await supabase.from("mission_presets").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const { error } = await supabase.from("mission_presets").insert({
      user_id: userId,
      name,
      emoji: input.emoji || "⚡",
      description: (input.description || "").slice(0, 200),
      missions: clean,
      sort_order: count ?? 0,
      ...stamp,
    });
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  }
  emitAppEvent(MISSION_PRESETS_CHANGED_EVENT);
  return { ok: true, name, updated: !!existing };
}

/** Save the current Home missions as a preset; an existing preset of that name is overwritten. */
export async function saveCurrentAsPreset(
  userId: string,
  input: { name: string; emoji?: string; description?: string },
  customMissions: MissionMap,
): Promise<WriteResult<{ name: string; updated: boolean }>> {
  const name = normalizePresetName(input.name);
  if (!name) return { ok: false, error: "Podaj nazwę presetu" };
  const missions = snapshotMissions(customMissions) as unknown as never;
  const { data: existing } = await supabase.from("mission_presets").select("id").eq("user_id", userId).eq("name", name).maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("mission_presets")
      .update({ missions, updated_at: new Date().toISOString(), ...(input.emoji ? { emoji: input.emoji } : {}) })
      .eq("id", existing.id);
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  } else {
    const { count } = await supabase.from("mission_presets").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const { error } = await supabase.from("mission_presets").insert({
      user_id: userId,
      name,
      emoji: input.emoji || "⚡",
      description: (input.description || "").slice(0, 200),
      missions,
      sort_order: count ?? 0,
    });
    if (error) return { ok: false, error: "Nie udało się zapisać presetu" };
  }
  emitAppEvent(MISSION_PRESETS_CHANGED_EVENT);
  return { ok: true, name, updated: !!existing };
}

// ---------------------------------------------------------------------------
// Preferences (theme, modules)
// ---------------------------------------------------------------------------

/** Merge keys into user_onboarding.preferences without clobbering the rest. */
export async function patchPreferences(userId: string, patch: Record<string, unknown>): Promise<WriteResult> {
  const { data, error: readErr } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
  if (readErr) return { ok: false, error: "Nie udało się odczytać ustawień" };
  const existing = (data?.preferences as Record<string, unknown>) || {};
  const merged = { ...existing, ...patch };
  const { error } = await supabase.from("user_onboarding").update({ preferences: merged as never }).eq("user_id", userId);
  if (error) return { ok: false, error: "Nie udało się zapisać ustawień" };
  emitAppEvent(USER_SETTINGS_CHANGED_EVENT);
  return { ok: true };
}

export async function setModuleEnabled(userId: string, module: string, enabled: boolean): Promise<WriteResult> {
  const { data } = await supabase.from("user_onboarding").select("preferences").eq("user_id", userId).maybeSingle();
  const prefs = (data?.preferences as { enabledModules?: string[] } | null) || {};
  const current = Array.isArray(prefs.enabledModules) ? prefs.enabledModules : [];
  const next = enabled ? Array.from(new Set([...current, module])) : current.filter((m) => m !== module);
  return patchPreferences(userId, { enabledModules: next.includes("dashboard") ? next : ["dashboard", ...next] });
}
