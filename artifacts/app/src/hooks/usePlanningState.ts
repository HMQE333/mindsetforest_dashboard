import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";
import {
  appendNote,
  descendants,
  droppedWith,
  editPatch,
  hasRecord,
  isBareUrl,
  linkOf,
  nodeFieldsOf,
  openDescendants,
  pasteStructure,
  placeNew,
  planMove,
  planTree,
  settleDrops,
  statePatch,
  titleSettle,
  wouldCycle,
  type NodeState,
  type ParsedLine,
  type PasteRow,
  type PlanNode,
  type StateOptions,
  type Verdict,
} from "@/lib/planning-model";
import { answerChoices, matchChoice } from "@/lib/planning-list";

/**
 * A link from a planning node to a Path (optionally to one specific step).
 * Replaces the old ladder/loop mention pair - one kind instead of two.
 */
export type PlanningMention = { kind: "path"; pathId: string; stepId?: string | null };

/**
 * A planning_tasks row: the PlanNode every view uses, plus the columns only
 * some views read. The table's old columns (level, deadline, leverage, energy,
 * time_minutes, icon, standalone, project_id) stay in the database for stale
 * bundles and the deployed planner, but are not part of this type: a node's
 * kind is `ask`, its position is the tree, and new code never writes them.
 */
export interface PlanningTask extends PlanNode {
  user_id: string;
  url: string | null;
  notes: string;
  position_x: number | null;
  position_y: number | null;
  mentions: PlanningMention[];
}

export interface BoardScope {
  boardId?: string;
}

/** What updateNode may change. A title is re-parsed (see editPatch in lib/planning-model.ts). */
export type NodePatch = Partial<Pick<PlanningTask,
  "title" | "notes" | "url" | "ask" | "guess" | "mentions" | "position_x" | "position_y">>;

/**
 * Fired whenever a `planning_tasks` row is written from outside a given
 * `usePlanningState` instance (e.g. by the AI assistant, or by another
 * instance of this hook). Instances listen for this and refetch so new tasks
 * show up immediately. An instance's own writes carry `detail.source` so it
 * does not refetch what it has just applied.
 */
export const PLANNING_TASKS_CHANGED_EVENT = "planning-tasks-changed";

const nowIso = () => new Date().toISOString();

/**
 * Ids per update request. An `.in("id", ...)` filter travels in the URL (about
 * 39 characters an id), so dropping a pasted spec's 300 open rows in one
 * request would be a 12 KB URL that a gateway may refuse.
 */
export const IDS_PER_REQUEST = 100;

/** `ids` in chunks of at most `size`. */
export function chunks<T>(ids: T[], size = IDS_PER_REQUEST): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** A v4 UUID, also where crypto.randomUUID is missing (plain-http LAN previews). */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Rows read before the open-loops migration lack its columns; give every row the full shape. */
function normalize(row: Record<string, unknown>): PlanningTask {
  const r = row as unknown as PlanningTask;
  const verdict = r.verdict;
  return {
    ...r,
    ask: !!r.ask,
    done: !!r.done,
    dropped: !!r.dropped,
    guess: r.guess ?? null,
    outcome: r.outcome ?? null,
    verdict: verdict === "right" || verdict === "wrong" || verdict === "unknown" ? verdict : null,
    closed_at: r.closed_at ?? null,
    notes: r.notes ?? "",
    url: r.url ?? null,
    sort_order: r.sort_order ?? 0,
    mentions: Array.isArray(r.mentions) ? r.mentions : [],
  };
}

type Row = Record<string, unknown>;
// The typed client knows planning_tasks; rows are cast to PlanningTask through normalize().
const table = () => supabase.from("planning_tasks");

/**
 * The only writer of planning_tasks in the client UI. Every write checks its
 * error, shows a toast on failure and refetches; nothing flips local state on a
 * failed write.
 */
export function usePlanningState(projectId?: string, board?: BoardScope) {
  const { user } = useAuth();
  const userId = user?.id;
  const [tasks, setTasksState] = useState<PlanningTask[]>([]);
  const [loading, setLoading] = useState(true);
  // The latest rows, updated eagerly: a write issued right after another (Enter,
  // then Tab on the new row) must see the new row before React re-renders.
  const tasksRef = useRef<PlanningTask[]>([]);
  // Bumped by every local write, so a fetch that started before it reads again
  // instead of overwriting the write with rows from before it.
  const writeEpoch = useRef(0);
  const setTasks = useCallback((next: PlanningTask[] | ((prev: PlanningTask[]) => PlanningTask[]), fromWrite = true) => {
    const value = typeof next === "function" ? next(tasksRef.current) : next;
    tasksRef.current = value;
    if (fromWrite) writeEpoch.current += 1;
    setTasksState(value);
  }, []);
  const instanceId = useRef(newId());
  const fetchSeq = useRef(0);

  const boardId = board?.boardId;

  const fetchTasks = useCallback(async () => {
    const seq = ++fetchSeq.current;
    if (!userId) { setLoading(false); return; }
    for (let attempt = 0; attempt < 3; attempt++) {
      const epoch = writeEpoch.current;
      let query = table()
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (boardId) {
        query = query.eq("board_id", boardId);
      } else if (projectId) {
        query = query.eq("project_id", projectId);
      }
      const { data, error } = await query;
      // A newer fetch (another board picked meanwhile) wins over a slower old one.
      if (seq !== fetchSeq.current) return;
      if (epoch !== writeEpoch.current && attempt < 2) continue;
      if (data && !error) setTasks((data as unknown as Row[]).map(normalize), false);
      break;
    }
    setLoading(false);
  }, [userId, projectId, boardId, setTasks]);

  // A new scope starts empty: the old board's rows must not show (or be acted on) under the new one.
  useEffect(() => {
    setTasks([], false);
    setLoading(true);
    fetchTasks();
  }, [fetchTasks, setTasks]);

  // Refetch when planning_tasks is written elsewhere (the assistant, another
  // instance of this hook) so this page-scoped instance stays in sync.
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<{ source?: string } | null>).detail?.source === instanceId.current) return;
      fetchTasks();
    };
    window.addEventListener(PLANNING_TASKS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PLANNING_TASKS_CHANGED_EVENT, handler);
  }, [fetchTasks]);

  const announce = useCallback(() => {
    window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT, { detail: { source: instanceId.current } }));
  }, []);

  const fail = useCallback((title: string, error?: { message?: string } | null) => {
    toast({ title, description: error?.message, variant: "destructive" });
    void fetchTasks();
  }, [fetchTasks]);

  /** Applies already-written patches to local state. */
  const applyLocal = useCallback((patches: { ids: string[]; patch: Partial<PlanningTask> }[]) => {
    setTasks((prev) => prev.map((t) => {
      let next = t;
      for (const p of patches) if (p.ids.includes(t.id)) next = { ...next, ...p.patch };
      return next;
    }));
  }, [setTasks]);

  /**
   * Writes each patch to its ids, in order, a request per IDS_PER_REQUEST ids;
   * false (after a toast and a refetch) when any write fails. Callers put the
   * node a state change is about LAST, so a failure part-way leaves that node
   * as it was (still open, to retry) rather than closed over half its subtree.
   */
  const writePatches = useCallback(async (
    patches: { ids: string[]; patch: Row }[],
    failTitle: string,
  ): Promise<boolean> => {
    if (!userId) return false;
    for (const p of patches) {
      for (const ids of chunks(p.ids)) {
        const q = table().update(p.patch as never).eq("user_id", userId);
        const { error } = await (ids.length === 1 ? q.eq("id", ids[0]) : q.in("id", ids));
        if (error) { fail(failTitle, error); return false; }
      }
    }
    return true;
  }, [userId, fail]);

  /** Sets new sort_orders in parallel (each sibling needs its own value). */
  const writeOrders = useCallback(async (orders: { id: string; sort_order: number }[], failTitle: string): Promise<boolean> => {
    if (!userId || orders.length === 0) return true;
    const results = await Promise.all(orders.map((o) =>
      table().update({ sort_order: o.sort_order }).eq("id", o.id).eq("user_id", userId)));
    const bad = results.find((r) => r.error);
    if (bad) { fail(failTitle, bad.error); return false; }
    setTasks((prev) => prev.map((t) => {
      const o = orders.find((x) => x.id === t.id);
      return o ? { ...t, sort_order: o.sort_order } : t;
    }));
    return true;
  }, [userId, fail, setTasks]);

  // ------------------------------------------------------------ open-loop writes

  /**
   * Adds one typed line under `parentId` (null = a new root), at the end or
   * right after the sibling `afterId` (the siblings below it are renumbered).
   * A "note" line is appended to the parent's notes instead, and the updated
   * parent is returned (a bare link also fills the parent's empty url); with no
   * parent a note becomes a plain step so the text is not lost.
   */
  const addNode = useCallback(async ({ boardId: targetBoard, parentId, line, afterId }: {
    boardId: string | null;
    parentId: string | null;
    line: ParsedLine;
    afterId?: string | null;
  }): Promise<PlanningTask | null> => {
    if (!userId) return null;
    const list = tasksRef.current;

    if (line.kind === "note" && parentId) {
      const text = line.title.trim();
      const parent = list.find((t) => t.id === parentId);
      if (!text || !parent) return null;
      const patch: Row = { notes: appendNote(parent.notes, text) };
      if (isBareUrl(text) && !parent.url) patch.url = linkOf(text);
      const { data, error } = await table().update(patch as never).eq("id", parentId).eq("user_id", userId).select("*").single();
      if (error || !data) { fail("Could not add the note", error); return null; }
      const updated = normalize(data as unknown as Row);
      setTasks((prev) => prev.map((t) => (t.id === parentId ? updated : t)));
      announce();
      return updated;
    }

    const fields = line.kind === "note"
      ? { ask: false, done: false, title: line.title.trim(), guess: null, outcome: null }
      : nodeFieldsOf(line);
    if (!fields.title) return null;

    const place = placeNew(list, parentId, targetBoard, afterId);

    const { data, error } = await table()
      .insert([{
        user_id: userId,
        board_id: targetBoard,
        parent_id: parentId,
        title: fields.title,
        ask: fields.ask,
        done: fields.done,
        dropped: false,
        guess: fields.guess,
        outcome: fields.outcome,
        closed_at: fields.done ? nowIso() : null,
        url: line.kind === "note" && isBareUrl(fields.title) ? linkOf(fields.title) : null,
        sort_order: place.sort_order,
      }])
      .select("*")
      .single();
    if (error || !data) { fail("Could not add it", error); return null; }
    const created = normalize(data as unknown as Row);
    setTasks((prev) => [...prev, created]);
    await writeOrders(place.orders, "Could not keep the order");
    announce();
    return created;
  }, [userId, fail, announce, writeOrders, setTasks]);

  /**
   * Inserts a pasted tree under `parentId` in ONE insert: client UUIDs, parent
   * ids resolved by depth (planTree). Note rows go to their parent's notes.
   * The top-level rows go at the end, or right after the sibling `afterId`
   * (where a draft row was being typed; the siblings below are renumbered).
   * Returns the inserted rows in outline order, or null when nothing was saved.
   */
  const insertTree = useCallback(async (
    targetBoard: string | null,
    parentId: string | null,
    rows: PasteRow[],
    afterId?: string | null,
  ): Promise<PlanningTask[] | null> => {
    if (!userId) return null;
    const list = tasksRef.current;
    const shape = pasteStructure(rows, parentId !== null);
    const top = shape.node.filter((isNode, i) => isNode && shape.parent[i] === null).length;
    const place = placeNew(list, parentId, targetBoard, afterId, top);
    const plan = planTree(rows, parentId, place.sort_order, newId);
    const now = nowIso();

    let inserted: PlanningTask[] = [];
    if (plan.rows.length > 0) {
      const { data, error } = await table()
        .insert(plan.rows.map((r) => ({
          id: r.id,
          user_id: userId,
          board_id: targetBoard,
          parent_id: r.parent_id,
          title: r.title,
          ask: r.ask,
          done: r.done,
          dropped: false,
          guess: r.guess,
          outcome: r.outcome,
          closed_at: r.done ? now : null,
          notes: r.notes,
          url: r.url,
          sort_order: r.sort_order,
        })))
        .select("*");
      if (error || !data) { fail("Could not insert the list", error); return null; }
      const byId = new Map((data as unknown as Row[]).map((d) => [String(d.id), normalize(d)]));
      inserted = plan.rows.map((r) => byId.get(r.id)).filter((t): t is PlanningTask => !!t);
      setTasks((prev) => [...prev, ...inserted]);
      await writeOrders(place.orders, "Could not keep the order");
    }

    if (plan.parentNotes.length > 0 && parentId) {
      const parent = list.find((t) => t.id === parentId);
      if (parent) {
        const patch: Row = { notes: plan.parentNotes.reduce((acc, n) => appendNote(acc, n), parent.notes) };
        if (plan.parentUrl && !parent.url) patch.url = plan.parentUrl;
        if (await writePatches([{ ids: [parentId], patch }], "Could not add the notes")) {
          applyLocal([{ ids: [parentId], patch: patch as Partial<PlanningTask> }]);
        }
      }
    }
    announce();
    return inserted;
  }, [userId, fail, announce, writePatches, writeOrders, applyLocal, setTasks]);

  /**
   * Edits a node. A title is re-parsed (editPatch): "X? ~ g" on a step makes it
   * a question with a guess, "= text" makes it a settled rule, and a record is
   * never turned into a step. "X? = a" on an open node settles it the way the
   * answer field does (titleSettle): an answer naming one of its options drops
   * the others as "chosen over", in the same writes. The view that sent the
   * title asks for the grade of a written guess afterwards.
   */
  const updateNode = useCallback(async (id: string, patch: NodePatch): Promise<boolean> => {
    if (!userId) return false;
    const list = tasksRef.current;
    const node = list.find((t) => t.id === id);
    if (!node) return false;
    const now = nowIso();
    const settle = patch.title !== undefined ? titleSettle(node, patch.title) : null;
    const writes: { ids: string[]; patch: Row }[] = [];
    let db: Row;
    if (settle) {
      const asQuestion = { ...node, ask: true };
      const choice = matchChoice(settle.outcome, answerChoices(id, list));
      db = {
        ...(settle.title !== node.title ? { title: settle.title } : {}),
        ...(node.ask ? {} : { ask: true }),
        ...statePatch(asQuestion, "settled", { outcome: choice ? choice.title : settle.outcome, verdict: null }, now),
      };
      const drops = choice ? settleDrops(id, choice.id, list) : [];
      if (drops.length) writes.push({ ids: drops, patch: { done: true, dropped: true, closed_at: db.closed_at } });
    } else {
      db = { ...editPatch(node, { title: patch.title, ask: patch.ask, guess: patch.guess }, now) };
    }
    if (patch.notes !== undefined) db.notes = patch.notes ?? "";
    if (patch.url !== undefined) db.url = patch.url?.trim() || null;
    if (patch.mentions !== undefined) db.mentions = (patch.mentions ?? []) as unknown as Json;
    if (patch.position_x !== undefined) db.position_x = patch.position_x;
    if (patch.position_y !== undefined) db.position_y = patch.position_y;
    if (Object.keys(db).length === 0) return true;
    writes.push({ ids: [id], patch: db });
    if (!(await writePatches(writes, settle ? "Could not settle the question" : "Could not save the change"))) return false;
    applyLocal(writes as { ids: string[]; patch: Partial<PlanningTask> }[]);
    announce();
    return true;
  }, [userId, writePatches, applyLocal, announce]);

  /**
   * Clears the stored Map positions of `ids` in ONE update (the Map's Organize),
   * so the other mounted instances refetch once rather than once per node.
   */
  const clearPositions = useCallback(async (ids: string[]): Promise<boolean> => {
    if (!userId) return false;
    if (ids.length === 0) return true;
    const patch = { position_x: null, position_y: null };
    if (!(await writePatches([{ ids, patch }], "Could not reset the layout"))) return false;
    applyLocal([{ ids, patch }]);
    announce();
    return true;
  }, [userId, writePatches, applyLocal, announce]);

  /**
   * Opens, ticks, settles or drops a node: done, dropped, outcome, verdict and
   * closed_at in ONE update. `dropOpenChildren` also drops the open nodes below
   * it (same closed_at), `dropIds` just the listed ones among them. Reopening clears done, dropped, closed_at and the
   * verdict (the outcome too, unless a question asks to keep it), and brings
   * back what was dropped with it in the same write (settleWithChild's
   * "chosen over" siblings, or the children "close and drop" took along).
   */
  const setNodeState = useCallback(async (id: string, state: NodeState, opts: StateOptions = {}): Promise<boolean> => {
    if (!userId) return false;
    const list = tasksRef.current;
    const node = list.find((t) => t.id === id);
    if (!node) return false;
    const patch = statePatch(node, state, opts, nowIso());
    // The rows below first and the node last: a failure in between leaves the
    // node as it was, so trying again finishes the job.
    const writes: { ids: string[]; patch: Row }[] = [];
    if (state === "open") {
      const restore = droppedWith(id, list);
      if (restore.length) writes.push({ ids: restore, patch: { done: false, dropped: false, closed_at: null, verdict: null } });
    } else if (opts.dropOpenChildren || opts.dropIds?.length) {
      const only = opts.dropIds?.length ? new Set(opts.dropIds) : null;
      const below = openDescendants(id, list).filter((i) => !only || only.has(i));
      if (below.length) writes.push({ ids: below, patch: { done: true, dropped: true, closed_at: patch.closed_at } });
    }
    writes.push({ ids: [id], patch: { ...patch } });
    if (!(await writePatches(writes, "Could not update it"))) return false;
    applyLocal(writes as { ids: string[]; patch: Partial<PlanningTask> }[]);
    announce();
    return true;
  }, [userId, writePatches, applyLocal, announce]);

  /**
   * Settles a question by picking one of its children: outcome = the child's
   * title, the question settles, its OTHER open direct children are dropped with
   * their open subtrees (they stay visible, faded: "chosen over"), and the
   * picked child stays open. The verdict is asked afterwards (setNodeState
   * with { verdict }), so it starts empty here.
   */
  const settleWithChild = useCallback(async (questionId: string, childId: string): Promise<boolean> => {
    if (!userId) return false;
    const list = tasksRef.current;
    const q = list.find((t) => t.id === questionId);
    const child = list.find((t) => t.id === childId);
    if (!q || !child || child.parent_id !== questionId || !q.ask) return false;
    const patch = statePatch(q, "settled", { outcome: child.title, verdict: null }, nowIso());
    // The options dropped first, the question last (see setNodeState).
    const writes: { ids: string[]; patch: Row }[] = [];
    const drops = settleDrops(questionId, childId, list);
    if (drops.length) writes.push({ ids: drops, patch: { done: true, dropped: true, closed_at: patch.closed_at } });
    writes.push({ ids: [questionId], patch: { ...patch } });
    if (!(await writePatches(writes, "Could not settle the question"))) return false;
    applyLocal(writes as { ids: string[]; patch: Partial<PlanningTask> }[]);
    announce();
    return true;
  }, [userId, writePatches, applyLocal, announce]);

  /**
   * Puts `id` under `newParentId` (null = a root) at `index` among its new
   * siblings. Refuses a cycle. Renumbers the siblings in both places and clears
   * position_x/position_y on the moved subtree so the Map lays it out again.
   */
  const moveNode = useCallback(async (id: string, newParentId: string | null, index: number): Promise<boolean> => {
    if (!userId) return false;
    const list = tasksRef.current;
    if (!list.some((t) => t.id === id)) return false;
    if (wouldCycle(id, newParentId, list)) {
      toast({ title: "Can't move it there", description: "A node can't go under itself or anything below it.", variant: "destructive" });
      return false;
    }
    const plan = planMove(list, id, newParentId, index);
    if (!plan) return false;
    const boardMove = plan.boardChanged ? { board_id: plan.board_id } : {};
    const writes: { ids: string[]; patch: Row }[] = [
      { ids: [id], patch: { parent_id: plan.parent_id, sort_order: plan.sort_order, position_x: null, position_y: null, ...boardMove } },
      { ids: plan.subtree, patch: { position_x: null, position_y: null, ...boardMove } },
    ];
    if (!(await writePatches(writes, "Could not move it"))) return false;
    applyLocal(writes as { ids: string[]; patch: Partial<PlanningTask> }[]);
    await writeOrders(plan.orders, "Could not keep the order");
    announce();
    return true;
  }, [userId, writePatches, applyLocal, writeOrders, announce]);

  /**
   * Hard-deletes nodes (and, by the FK cascade, everything below them). Refuses
   * the whole call when any of them holds a record (an answered question or a
   * scored guess, here or below): those are dropped, never deleted. The UI
   * confirms counts above one.
   */
  const deleteNodes = useCallback(async (ids: string[]): Promise<boolean> => {
    if (!userId || ids.length === 0) return false;
    const list = tasksRef.current;
    const blocked = ids.filter((i) => hasRecord(i, list));
    if (blocked.length) {
      toast({
        title: blocked.length === 1 && ids.length === 1 ? "This holds a record" : `${blocked.length} of these hold a record`,
        description: "An answered question or a scored guess is never deleted. Drop it instead.",
        variant: "destructive",
      });
      return false;
    }
    const gone = new Set(ids.flatMap((i) => [i, ...descendants(i, list)]));
    const q = table().delete().eq("user_id", userId);
    const { error } = await (ids.length === 1 ? q.eq("id", ids[0]) : q.in("id", ids));
    if (error) { fail("Could not delete it", error); return false; }
    setTasks((prev) => prev.filter((t) => !gone.has(t.id)));
    announce();
    return true;
  }, [userId, fail, announce, setTasks]);

  /**
   * The rows as of the last write, before React re-renders: a key pressed
   * while an add is in flight (Enter, then Tab) can wait for it and then see
   * the new row.
   */
  const peek = useCallback(() => tasksRef.current, []);

  return {
    tasks,
    loading,
    peek,
    addNode,
    insertTree,
    updateNode,
    clearPositions,
    setNodeState,
    settleWithChild,
    moveNode,
    deleteNodes,
    refetch: fetchTasks,
  };
}

export type { NodeState, ParsedLine, PasteRow, PlanNode, StateOptions, Verdict };
