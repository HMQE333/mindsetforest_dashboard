import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, MoreHorizontal, Plus, StickyNote } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { usePlanningState, type PlanningTask } from "@/hooks/usePlanningState";
import {
  descendants, editPatch, frontier, hasRecord, isRecord, isWaiting, nextPerRoot, openDescendants, parseLine, parsePaste,
  placeholderFor, recordIds, siblingsAt, stateOf, titleSettle, type PasteRow, type Verdict,
} from "@/lib/planning-model";
import {
  answerChoices, childCounts, draftIndex, indentTarget, isMultiline, listItems, matchChoice, outdentTarget,
  parentKey, rowKeyAction, rowTails, stepTarget, type KeyLike, type ListItem, type MoveTarget,
} from "@/lib/planning-list";
import PlanningMarker from "./PlanningMarker";
import PlanningNodeDetail from "./PlanningNodeDetail";
import PlanningPastePreview from "./PlanningPastePreview";
import PlanningToHome from "./PlanningToHome";
import { reopenNode } from "./planning-reopen";

// useLayoutEffect in the browser (focus before paint), useEffect when rendered on a server or in tests.
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const INDENT = 22;
const LONG_PRESS_MS = 450;

/**
 * A row being typed that is not saved yet: under `parentId`, after `afterId`
 * (null = at the end). `under`: Tab was pressed while the row above was still
 * being saved, so the text goes under that row (at its end) once it exists.
 */
type Draft = { parentId: string | null; afterId: string | null; text: string; under?: Promise<string | null> };
type FocusTarget = "edit" | "draft" | "root" | null;

const keyOf = (e: KeyboardEvent<HTMLInputElement>): KeyLike => ({
  key: e.key, code: e.code, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
  isComposing: e.nativeEvent.isComposing, repeat: e.repeat,
});

/**
 * True while the window itself loses focus (Alt+Tab to copy a line, another
 * app on the phone): the input's blur then is not him leaving the row, and the
 * browser hands focus back to it when he returns.
 */
const windowBlur = () =>
  typeof document !== "undefined" && (document.visibilityState === "hidden" || !document.hasFocus());

const VERDICT_BUTTONS: { v: Verdict; label: string; cls: string }[] = [
  { v: "right", label: "It held", cls: "border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20" },
  { v: "wrong", label: "It didn't", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20" },
  { v: "unknown", label: "Can't tell", cls: "border-white/12 bg-white/[0.03] text-muted-foreground hover:text-foreground" },
];

const VERDICT_CHIP: Record<Verdict, { label: string; cls: string }> = {
  right: { label: "held", cls: "bg-green-500/15 text-green-300" },
  wrong: { label: "missed", cls: "bg-amber-500/15 text-amber-300" },
  unknown: { label: "unclear", cls: "bg-white/10 text-muted-foreground" },
};

function domainOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

interface Props {
  boardId: string;
  /** The header's [Open loops] filter: only frontier nodes and the ancestors that place them. */
  openLoopsOnly?: boolean;
  /** The board's display name, for Add to Home's "From Planning: board › parent" line (read when absent). */
  boardName?: string | null;
  /** Accepted from older callers; the Planning header owns navigation now. */
  onBack?: () => void;
}

/**
 * The List: one outline of open loops. A row is a Step (○, tick it) or a
 * Question (?, answer it, after an optional guess); indent is depth, never a
 * level. Typing is an outliner's (Enter, Tab, Shift+Tab, Alt+arrows), a
 * multi-line paste opens a preview, and every row has a menu ("…" or a long
 * press) because phones have no Tab. Every write goes through usePlanningState.
 */
export default function PlanningStack({ boardId, openLoopsOnly = false, boardName }: Props) {
  const {
    tasks, loading, peek, addNode, insertTree, updateNode, setNodeState, settleWithChild, moveNode, deleteNodes,
  } = usePlanningState(undefined, { boardId });

  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [rootText, setRootText] = useState("");
  const [answering, setAnswering] = useState<{ id: string; text: string; dropOpen: boolean } | null>(null);
  const [grading, setGrading] = useState<string | null>(null);
  const [dropping, setDropping] = useState<{ id: string; text: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState<Set<string>>(() => new Set());
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [justClosed, setJustClosed] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [homeId, setHomeId] = useState<string | null>(null);
  const [paste, setPaste] = useState<{
    rows: PasteRow[]; parentId: string | null; afterId: string | null; target: string; parentTitle: string | null;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string; below: number } | null>(null);

  const editRef = useRef<HTMLInputElement | null>(null);
  const draftRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLInputElement | null>(null);
  // Which input keeps the caret while keyboard moves re-order the rows under it.
  const holdFocus = useRef<FocusTarget>(null);
  // > 0 while a keyboard move is in flight: a blur then is the DOM moving, not the user leaving.
  const quiet = useRef(0);
  // Adds run one after another, so fast typing keeps its order; an add queued
  // after a row that is itself still being added waits for that row's id.
  const addChain = useRef<Promise<unknown>>(Promise.resolve());
  const pendingAfter = useRef(new Map<string, Promise<string | null>>());
  // The row the draft last sent (Enter) and the root box's last add, until they
  // are saved: Tab right after Enter must indent under that row, not the one
  // above it, even before the insert returns.
  const lastAdd = useRef<{ parentId: string | null; afterId: string | null; done: Promise<string | null> } | null>(null);
  const rootAdd = useRef<Promise<string | null> | null>(null);
  // Tab in the root box while that root is still being saved: Enter meanwhile puts the text under it.
  const rootIndent = useRef<Promise<string | null> | null>(null);
  // A menu item that moves the caret elsewhere (a new row, the answer field) stops
  // the menu from handing focus back to its trigger.
  const menuMovesFocus = useRef(false);
  // A title save in flight per row: the key handler and the blur that follows it
  // send the same text, and only one write should go out.
  const saving = useRef(new Map<string, { text: string; done: Promise<boolean> }>());
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Another board: nothing typed or open on the old one carries over.
  useEffect(() => {
    setEditing(null); setDraft(null); setRootText(""); setAnswering(null); setGrading(null); setDropping(null);
    setMenuFor(null); setShowClosed(new Set()); setFolded(new Set()); setJustClosed(new Set());
    setDetailId(null); setHomeId(null); setPaste(null); setConfirmDelete(null);
    holdFocus.current = null;
    saving.current.clear();
    pendingAfter.current.clear();
    lastAdd.current = null;
    rootAdd.current = null;
    rootIndent.current = null;
  }, [boardId]);

  useClientLayoutEffect(() => {
    const target = holdFocus.current;
    if (!target) return;
    const el = target === "edit" ? editRef.current : target === "draft" ? draftRef.current : rootRef.current;
    if (el && document.activeElement !== el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
  });

  // ------------------------------------------------------------ derived

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const frontierIds = useMemo(() => new Set(frontier(tasks).map((n) => n.id)), [tasks]);
  const nextIds = useMemo(() => nextPerRoot(tasks), [tasks]);
  const records = useMemo(() => recordIds(tasks), [tasks]);
  const counts = useMemo(() => childCounts(tasks), [tasks]);
  const keep = useMemo(() => {
    const s = new Set(justClosed);
    for (const id of [editing?.id, answering?.id, grading, dropping?.id, detailId, menuFor, homeId]) if (id) s.add(id);
    return s;
  }, [justClosed, editing?.id, answering?.id, grading, dropping?.id, detailId, menuFor, homeId]);
  const items = useMemo(
    () => listItems(tasks, { showClosed, folded, keep, openLoopsOnly }),
    [tasks, showClosed, folded, keep, openLoopsOnly],
  );
  const rowItems = useMemo(
    () => items.filter((it): it is Extract<ListItem<PlanningTask>, { kind: "row" }> => it.kind === "row"),
    [items],
  );
  const visible = useMemo(() => new Set(rowItems.map((it) => it.node.id)), [rowItems]);
  const isVisible = (id: string) => visible.has(id);
  const depthOf = (id: string | null) => {
    if (!id) return -1;
    const it = rowItems.find((r) => r.node.id === id);
    return it ? it.depth : -1;
  };

  const draftAt = draft ? draftIndex(items, draft.parentId, draft.afterId) : -1;

  // ------------------------------------------------------------ small helpers

  const markClosed = (...ids: string[]) =>
    setJustClosed((prev) => { const s = new Set(prev); ids.forEach((i) => s.add(i)); return s; });
  const unfold = (id: string | null) => {
    if (!id) return;
    setFolded((prev) => { if (!prev.has(id)) return prev; const s = new Set(prev); s.delete(id); return s; });
  };
  const rowNeighbour = (id: string, dir: -1 | 1): PlanningTask | null => {
    const at = rowItems.findIndex((r) => r.node.id === id);
    const it = at < 0 ? undefined : rowItems[at + dir];
    return it ? it.node : null;
  };
  const labelUnder = (parentId: string | null) => {
    const p = parentId ? byId.get(parentId) : null;
    return p ? `under “${p.title}”` : "at the top level";
  };

  const startEdit = (node: PlanningTask) => {
    setDraft((d) => (d && !d.text.trim() ? null : d));
    setEditing({ id: node.id, text: node.title });
    holdFocus.current = "edit";
  };
  const stopEdit = () => {
    setEditing(null);
    if (holdFocus.current === "edit") holdFocus.current = null;
  };
  const openDraft = (parentId: string | null, afterId: string | null, text = "") => {
    unfold(parentId);
    setEditing(null);
    setDraft({ parentId, afterId, text });
    holdFocus.current = "draft";
    lastAdd.current = null;
  };
  const closeDraft = () => {
    setDraft(null);
    if (holdFocus.current === "draft") holdFocus.current = null;
    lastAdd.current = null;
  };
  /** The open draft goes under `parentId` as its last child, keeping what is typed in it now. */
  const moveDraftUnder = (parentId: string) => {
    unfold(parentId);
    setEditing(null);
    setDraft((cur) => (cur ? { parentId, afterId: null, text: cur.text } : cur));
    holdFocus.current = "draft";
    lastAdd.current = null;
  };

  /**
   * Saves an edited title (the hook re-parses it, see editPatch). Compared with
   * the rows as last written, so a later edit back to an earlier text is never
   * mistaken for a repeat; only a save of the same text still in flight is.
   * "X? = a" on an open question settles it like the answer field, so the row
   * stays in view and a written guess is graded.
   */
  const saveTitle = async (id: string, text: string): Promise<boolean> => {
    const node = peek().find((t) => t.id === id);
    const t = text.trim();
    if (!node || !t || t === node.title) return true;
    const inFlight = saving.current.get(id);
    if (inFlight && inFlight.text === t) return inFlight.done;
    const settles = !!titleSettle(node, t);
    const parsed = parseLine(t);
    const done = updateNode(id, { title: t });
    saving.current.set(id, { text: t, done });
    let ok = false;
    try {
      ok = await done;
    } finally {
      if (saving.current.get(id)?.done === done) saving.current.delete(id);
    }
    if (!ok) return false;
    if (settles) {
      markClosed(id);
      const after = peek().find((x) => x.id === id);
      if (after && stateOf(after) === "settled" && after.guess?.trim()) setGrading(id);
    }
    if (parsed.kind !== "note" && parsed.title !== t) {
      // Markers were split off into the guess or the answer: keep editing just the title.
      setEditing((e) => (e && e.id === id && e.text.trim() === t ? { id, text: parsed.title } : e));
    }
    return ok;
  };

  /** Runs a move that keeps the caret in the row being edited. */
  const moveKeepingFocus = async (id: string, target: MoveTarget) => {
    unfold(target.parentId);
    quiet.current++;
    try {
      await moveNode(id, target.parentId, target.index);
    } finally {
      quiet.current--;
    }
  };

  // ------------------------------------------------------------ closing

  const openAnswer = (node: PlanningTask) => {
    setEditing(null);
    setDropping(null);
    // A reopened question keeps its old answer: it comes back prefilled.
    setAnswering({ id: node.id, text: node.outcome ?? "", dropOpen: true });
  };

  /** Ctrl+Enter or the marker: a Step ticks (and back), a Question opens its answer field. */
  const closeRow = async (node: PlanningTask) => {
    const state = stateOf(node);
    if (node.ask) {
      if (state === "open") openAnswer(node);
      else setDetailId(node.id);
      return;
    }
    if (state === "done") { await setNodeState(node.id, "open"); return; }
    if (state === "dropped") { setDetailId(node.id); return; }
    const below = openDescendants(node.id, tasksRef.current);
    const ok = await setNodeState(node.id, "done", below.length ? { dropOpenChildren: true } : undefined);
    if (!ok) return;
    markClosed(node.id);
    if (below.length) {
      toast({
        title: `Ticked, and ${below.length} open under it dropped`,
        description: "Reopening it brings them back.",
        action: <ToastAction altText="Undo" onClick={() => { void setNodeState(node.id, "open"); }}>Undo</ToastAction>,
      });
    }
  };

  const afterSettle = (q: PlanningTask) => {
    setAnswering(null);
    markClosed(q.id);
    if (q.guess?.trim()) setGrading(q.id);
  };

  const pickAnswer = async (q: PlanningTask, child: PlanningTask) => {
    if (await settleWithChild(q.id, child.id)) afterSettle(q);
  };

  const submitAnswer = async () => {
    if (!answering) return;
    const q = byId.get(answering.id);
    const text = answering.text.trim();
    if (!q || !text) return;
    const choice = matchChoice(text, answerChoices(q.id, tasksRef.current));
    if (choice) { await pickAnswer(q, choice); return; }
    const below = openDescendants(q.id, tasksRef.current).length;
    const ok = await setNodeState(q.id, "settled", { outcome: text, dropOpenChildren: answering.dropOpen && below > 0 });
    if (ok) afterSettle(q);
  };

  const grade = async (id: string, verdict: Verdict) => {
    setGrading(null);
    await setNodeState(id, "settled", { verdict });
  };

  const drop = async () => {
    if (!dropping) return;
    const why = dropping.text.trim();
    const id = dropping.id;
    setDropping(null);
    // Without a why, a settled question keeps its answer as the record.
    if (await setNodeState(id, "dropped", { outcome: why || undefined, dropOpenChildren: true })) markClosed(id);
  };

  /** A settled question is dropped as it stands: the answer and its grade stay as the record. */
  const dropSettled = async (node: PlanningTask) => {
    if (await setNodeState(node.id, "dropped", { dropOpenChildren: true })) markClosed(node.id);
  };

  const reopen = async (node: PlanningTask) => {
    await reopenNode(node, setNodeState, tasksRef.current);
  };

  // ------------------------------------------------------------ deleting

  const askDelete = (node: PlanningTask) => {
    const below = descendants(node.id, tasksRef.current).length;
    if (below > 0 || node.notes?.trim() || node.url) setConfirmDelete({ id: node.id, title: node.title, below });
    else void deleteNodes([node.id]);
  };

  /** Backspace on an emptied row: delete it and edit the row above. */
  const deleteEmptyRow = async (node: PlanningTask) => {
    const list = tasksRef.current;
    if (list.some((t) => t.parent_id === node.id)) {
      toast({ title: "It has rows under it", description: "Move or delete them first, or use Drop." });
      return;
    }
    if (hasRecord(node.id, list)) { await deleteNodes([node.id]); return; }
    if (node.notes?.trim() || node.url) { askDelete(node); return; }
    const above = rowNeighbour(node.id, -1);
    if (await deleteNodes([node.id])) {
      if (above) startEdit(above);
      else stopEdit();
    }
  };

  // ------------------------------------------------------------ adding

  /**
   * Queues one add under `parentId` after `afterId` (null = at the end). A
   * second Enter before the first row is saved names the same `afterId`; it
   * waits for that row and goes below it, so the order is the order typed.
   * On failure the text comes back (to the root box, or as a draft).
   */
  const queueAdd = (
    parentId: string | null, afterId: string | null, text: string, from: "draft" | "root" = "draft",
    under?: Promise<string | null>,
  ): Promise<string | null> => {
    const line = parseLine(text);
    const key = `${parentId ?? ""}|${afterId ?? ""}`;
    // A row going under a row still being saved takes no place among parentId's children.
    const prior = afterId && !under ? pendingAfter.current.get(key) : undefined;
    let settle: (id: string | null) => void = () => {};
    const mine = new Promise<string | null>((r) => { settle = r; });
    if (afterId && !under) {
      pendingAfter.current.set(key, mine);
      void mine.then(() => { if (pendingAfter.current.get(key) === mine) pendingAfter.current.delete(key); });
    }
    const job = async (): Promise<string | null> => {
      // Tab before the row above was saved: under that row, at its end (where it was typed if that add failed).
      const host = under ? await under : null;
      const parent = host ?? parentId;
      const after = host ? null : prior ? (await prior) ?? afterId : afterId;
      let created: PlanningTask | null = null;
      try {
        created = await addNode({ boardId, parentId: parent, line, afterId: after });
      } finally {
        // Always settle, so an add queued behind this one never waits forever.
        settle(created && !(line.kind === "note" && parent) ? created.id : after);
      }
      const madeRow = !!created && !(line.kind === "note" && parent);
      if (!created) {
        // The hook showed why; give the text back so nothing typed is lost.
        if (from === "root") setRootText((cur) => cur || text);
        else setDraft((cur) => (cur ? (cur.text ? cur : { ...cur, text }) : { parentId: parent, afterId: after, text }));
        return null;
      }
      if (!madeRow) return null;
      if (created.done) markClosed(created.id);
      if (after) {
        setDraft((cur) => (cur && cur.parentId === parent && (cur.afterId === afterId || cur.afterId === after)
          ? { ...cur, afterId: created.id }
          : cur));
      }
      return created.id;
    };
    const run = addChain.current.then(job, job);
    addChain.current = run;
    return run;
  };

  const submitDraft = (d: Draft, text: string) => {
    setDraft({ ...d, text: "" });
    holdFocus.current = "draft";
    // A position taken by an add still in flight resolves to the row it creates.
    lastAdd.current = { parentId: d.parentId, afterId: d.afterId, done: queueAdd(d.parentId, d.afterId, text, "draft", d.under) };
  };

  const submitRoot = () => {
    const text = rootText.trim();
    if (!text) return;
    setRootText("");
    holdFocus.current = "root";
    const under = rootIndent.current ?? undefined;
    const done = queueAdd(null, null, text, "root", under);
    if (under) return;
    rootAdd.current = done;
    void done.finally(() => { if (rootAdd.current === done) rootAdd.current = null; });
  };

  /** A multi-line paste opens the preview; from a draft it lands where the draft is. */
  const onPasteInto = (e: ClipboardEvent<HTMLInputElement>, parentId: string | null, afterId: string | null = null) => {
    const text = e.clipboardData.getData("text/plain");
    if (!isMultiline(text)) return;
    const rows = parsePaste(text);
    if (rows.length < 2) return;
    e.preventDefault();
    const parentTitle = parentId ? byId.get(parentId)?.title ?? null : null;
    setPaste({ rows, parentId, afterId, target: labelUnder(parentId), parentTitle });
  };

  const insertPaste = async (rows: PasteRow[]): Promise<boolean> => {
    if (!paste) return false;
    const inserted = await insertTree(boardId, paste.parentId, rows, paste.afterId);
    if (!inserted) return false;
    unfold(paste.parentId);
    // Settled rules from a pasted spec stay in view instead of folding away at once.
    const closed = inserted.filter((t) => t.done).map((t) => t.id);
    if (closed.length) markClosed(...closed);
    if (draft && draft.parentId === paste.parentId) closeDraft();
    return true;
  };

  // ------------------------------------------------------------ keys

  const onRowKey = async (e: KeyboardEvent<HTMLInputElement>, node: PlanningTask) => {
    const text = e.currentTarget.value;
    const action = rowKeyAction(keyOf(e), text);
    if (!action) return;
    e.preventDefault();
    const list = tasksRef.current;
    switch (action) {
      case "stop":
        stopEdit();
        void saveTitle(node.id, text);
        return;
      case "newBelow":
        void saveTitle(node.id, text);
        openDraft(node.parent_id ?? null, node.id);
        return;
      case "indent": {
        const target = indentTarget(node.id, list, isVisible);
        if (!target) return;
        void saveTitle(node.id, text);
        await moveKeepingFocus(node.id, target);
        return;
      }
      case "outdent": {
        const target = outdentTarget(node.id, list);
        if (!target) return;
        void saveTitle(node.id, text);
        await moveKeepingFocus(node.id, target);
        return;
      }
      case "moveUp":
      case "moveDown": {
        const target = stepTarget(node.id, action === "moveUp" ? -1 : 1, list, isVisible);
        if (!target) return;
        void saveTitle(node.id, text);
        await moveKeepingFocus(node.id, target);
        return;
      }
      case "close": {
        stopEdit();
        const t = text.trim();
        // What the typed title makes of the row, by the same rules as the save.
        const edit = t && t !== node.title ? editPatch(node, { title: t }, new Date().toISOString()) : {};
        await saveTitle(node.id, text);
        // "X? = a" or "= text" just closed it: nothing more to close.
        if (edit.done) return;
        await closeRow({ ...node, ask: edit.ask ?? node.ask });
        return;
      }
      case "toggleKind": {
        await saveTitle(node.id, text);
        // The kind as saved, not as typed: a step titled "X?" turns into a question here.
        const now = peek().find((t) => t.id === node.id) ?? node;
        if (now.ask && isRecord(now)) {
          toast({ title: "A settled question stays a question", description: "Its answer and the grade of the guess are the record. Reopen it first." });
          return;
        }
        await updateNode(node.id, { ask: !now.ask });
        return;
      }
      case "deleteEmpty":
        await deleteEmptyRow(node);
        return;
      case "focusUp":
      case "focusDown": {
        const other = rowNeighbour(node.id, action === "focusUp" ? -1 : 1);
        void saveTitle(node.id, text);
        if (other) startEdit(other);
        else if (action === "focusDown") { stopEdit(); holdFocus.current = "root"; rootRef.current?.focus(); }
        return;
      }
    }
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>, d: Draft) => {
    const text = e.currentTarget.value;
    const action = rowKeyAction(keyOf(e), text);
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "newBelow":
        if (text.trim()) submitDraft(d, text);
        else closeDraft();
        return;
      case "indent": {
        // The sibling right above the draft (on screen) takes it as its last child.
        // Right after Enter that is the row just sent, maybe not saved yet: wait for it.
        const pending = lastAdd.current;
        const sent = pending && pending.parentId === d.parentId && pending.afterId === d.afterId ? pending.done : null;
        // Until that row exists, Enter (or leaving the draft) still puts the text under it.
        if (sent) setDraft((cur) => (cur ? { ...cur, under: sent } : cur));
        void (async () => {
          const fresh = sent ? await sent : null;
          const list = peek();
          const prev = fresh && list.some((t) => t.id === fresh)
            ? fresh
            : d.afterId && isVisible(d.afterId)
              ? d.afterId
              : siblingsAt(list, d.parentId, boardId).filter((s) => isVisible(s.id) || !byId.has(s.id)).at(-1)?.id;
          if (prev) moveDraftUnder(prev);
        })();
        return;
      }
      case "outdent": {
        const parent = d.parentId ? byId.get(d.parentId) : undefined;
        if (!parent) return;
        openDraft(parent.parent_id ?? null, parent.id, text);
        return;
      }
      case "toggleKind": {
        const t = text.trimEnd();
        setDraft({ ...d, text: t.endsWith("?") ? t.slice(0, -1) : `${t}?` });
        return;
      }
      case "stop":
        if (text.trim()) void queueAdd(d.parentId, d.afterId, text, "draft", d.under);
        closeDraft();
        return;
      case "deleteEmpty":
      case "focusUp": {
        if (text.trim()) return;
        const above = d.afterId ? byId.get(d.afterId) : d.parentId ? byId.get(d.parentId) : rowItems.at(-1)?.node;
        closeDraft();
        if (above) startEdit(above);
        return;
      }
      default:
        return;
    }
  };

  const onRootKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const action = rowKeyAction(keyOf(e), rootText);
    if (action === "newBelow") { e.preventDefault(); submitRoot(); return; }
    if (action === "indent") {
      // A root still being saved (typed, Enter, Tab at once) counts: wait for it.
      const pending = rootAdd.current;
      const shown = (s: PlanningTask) => isVisible(s.id) || !byId.has(s.id);
      if (!pending && !siblingsAt(peek(), null, boardId).some(shown)) return;
      e.preventDefault();
      if (pending) rootIndent.current = pending;
      void (async () => {
        const fresh = pending ? await pending : null;
        if (pending && rootIndent.current === pending) rootIndent.current = null;
        const last = siblingsAt(peek(), null, boardId).filter((s) => shown(s) || s.id === fresh).at(-1);
        if (!last) return;
        openDraft(last.id, null, rootRef.current?.value ?? "");
        setRootText("");
      })();
      return;
    }
    if (action === "toggleKind") {
      e.preventDefault();
      const t = rootText.trimEnd();
      setRootText(t.endsWith("?") ? t.slice(0, -1) : `${t}?`);
      return;
    }
    // ArrowUp only: Backspace in the add box must never run on into the last row.
    if (action === "focusUp" && !rootText) {
      const last = rowItems.at(-1)?.node;
      if (!last) return;
      e.preventDefault();
      startEdit(last);
      return;
    }
    if (action === "stop") { e.preventDefault(); holdFocus.current = null; e.currentTarget.blur(); }
  };

  // ------------------------------------------------------------ touch: long press opens the row menu

  const pressStart = (id: string) => {
    longPressed.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setMenuFor(id);
      try { navigator.vibrate?.(8); } catch { /* not supported */ }
    }, LONG_PRESS_MS);
  };
  const pressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  useEffect(() => () => pressEnd(), []);

  // ------------------------------------------------------------ rendering

  const inputCls =
    "flex-1 min-w-0 h-7 text-sm bg-muted/30 border border-white/10 rounded-lg px-2.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50";

  const renderDraft = () => {
    if (!draft) return null;
    const parent = draft.parentId ? byId.get(draft.parentId) ?? null : null;
    const depth = depthOf(draft.parentId) + 1;
    return (
      <div key="__draft__" className="flex items-center gap-2 py-1 px-2" style={{ paddingLeft: `${depth * INDENT + 8}px` }}>
        <span className="w-[18px] flex-shrink-0" />
        <PlanningMarker look={{ ask: draft.text.trimEnd().endsWith("?"), state: "open" }} className="opacity-60" />
        <input
          ref={draftRef}
          autoFocus
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => onDraftKey(e, draft)}
          onPaste={(e) => onPasteInto(e, draft.parentId, draft.afterId)}
          onBlur={() => {
            if (quiet.current || windowBlur()) return;
            // Typed text is never lost: leaving a filled draft adds it.
            if (draft.text.trim()) void queueAdd(draft.parentId, draft.afterId, draft.text, "draft", draft.under);
            closeDraft();
          }}
          placeholder={placeholderFor(parent)}
          className={inputCls}
        />
      </div>
    );
  };

  const renderPanel = (node: PlanningTask, depth: number) => {
    // Indented under the row, but capped on a phone so the field keeps its width.
    const pad = { ["--panel-pad" as string]: `${(depth + 1) * INDENT + 8 + 26}px` };
    const padCls = "pl-[min(var(--panel-pad),3.5rem)] sm:pl-[var(--panel-pad)]";
    if (answering?.id === node.id) {
      const choices = answerChoices(node.id, tasks);
      const openBelow = openDescendants(node.id, tasks).length;
      return (
        <div key={`${node.id}:answer`} className={`py-1.5 pr-2 space-y-1.5 ${padCls}`} style={pad}>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={answering.text}
              onChange={(e) => setAnswering({ ...answering, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void submitAnswer(); }
                if (e.key === "Escape") { e.preventDefault(); setAnswering(null); }
              }}
              placeholder="The answer, in one line…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => void submitAnswer()}
              disabled={!answering.text.trim()}
              className="h-7 px-3 rounded-lg text-xs font-bold gradient-purple text-primary-foreground disabled:opacity-40 flex-shrink-0"
            >
              Settle
            </button>
            <button
              type="button"
              onClick={() => setAnswering(null)}
              className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              Cancel
            </button>
          </div>
          {choices.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">or pick:</span>
              {choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void pickAnswer(node, c)}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-white/10 text-foreground/90 hover:border-primary/40 hover:bg-primary/10 transition-all max-w-full truncate"
                >
                  {c.title}
                </button>
              ))}
            </div>
          )}
          {openBelow > 0 && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={answering.dropOpen}
                onChange={(e) => setAnswering({ ...answering, dropOpen: e.target.checked })}
                className="accent-[hsl(var(--primary))]"
              />
              With a typed answer, drop the {openBelow} open under it
            </label>
          )}
        </div>
      );
    }
    if (grading === node.id && node.guess) {
      return (
        <div key={`${node.id}:grade`} className={`py-1.5 pr-2 ${padCls}`} style={pad}>
          <div className="p-2.5 rounded-xl border border-primary/25 bg-primary/5">
            <p className="text-xs text-muted-foreground mb-2">
              You guessed <span className="text-foreground">“{node.guess}”</span>. Did it hold?
            </p>
            <div className="flex flex-wrap gap-2">
              {VERDICT_BUTTONS.map(({ v, label, cls }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void grade(node.id, v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${cls}`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setGrading(null)}
                className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (dropping?.id === node.id) {
      return (
        <div key={`${node.id}:drop`} className={`py-1.5 pr-2 ${padCls}`} style={pad}>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={dropping.text}
              onChange={(e) => setDropping({ ...dropping, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void drop(); }
                if (e.key === "Escape") { e.preventDefault(); setDropping(null); }
              }}
              placeholder="Why drop it? (optional)"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => void drop()}
              className="h-7 px-3 rounded-lg text-xs font-bold border border-white/15 text-foreground hover:bg-white/5 flex-shrink-0"
            >
              Drop
            </button>
            <button
              type="button"
              onClick={() => setDropping(null)}
              className="h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderMenu = (node: PlanningTask) => {
    const state = stateOf(node);
    const list = tasks;
    // Worked out only for the open menu: each one walks the siblings, and a
    // pasted 300-row spec re-renders every row on each keystroke.
    const open = menuFor === node.id;
    const canIndent = open && !!indentTarget(node.id, list, isVisible);
    const canOutdent = open && !!outdentTarget(node.id, list);
    const canUp = open && !!stepTarget(node.id, -1, list, isVisible);
    const canDown = open && !!stepTarget(node.id, 1, list, isVisible);
    const record = records.has(node.id);
    // A record stays a question: becoming a step would wipe its guess and grade.
    const canToggle = !(node.ask && isRecord(node));
    return (
      <DropdownMenu open={menuFor === node.id} onOpenChange={(o) => setMenuFor(o ? node.id : null)}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Row menu"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onCloseAutoFocus={(e) => { if (menuMovesFocus.current) { e.preventDefault(); menuMovesFocus.current = false; } }}
        >
          <DropdownMenuItem disabled={!canIndent} onSelect={() => { const t = indentTarget(node.id, tasksRef.current, isVisible); if (t) void moveKeepingFocus(node.id, t); }}>
            Indent
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canOutdent} onSelect={() => { const t = outdentTarget(node.id, tasksRef.current); if (t) void moveKeepingFocus(node.id, t); }}>
            Outdent
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canUp} onSelect={() => { const t = stepTarget(node.id, -1, tasksRef.current, isVisible); if (t) void moveKeepingFocus(node.id, t); }}>
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canDown} onSelect={() => { const t = stepTarget(node.id, 1, tasksRef.current, isVisible); if (t) void moveKeepingFocus(node.id, t); }}>
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { menuMovesFocus.current = true; openDraft(node.id, null); }}>Add a row under it</DropdownMenuItem>
          {canToggle && (
            <DropdownMenuItem onSelect={() => void updateNode(node.id, { ask: !node.ask })}>
              {node.ask ? "Make it a step" : "Make it a question"}
            </DropdownMenuItem>
          )}
          {node.ask && state === "open" && (
            <DropdownMenuItem onSelect={() => { menuMovesFocus.current = true; openAnswer(node); }}>Answer…</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setDetailId(node.id)}>Details</DropdownMenuItem>
          {!node.ask && state === "open" && <DropdownMenuItem onSelect={() => setHomeId(node.id)}>Add to Home…</DropdownMenuItem>}
          <DropdownMenuSeparator />
          {state === "open" && (
            <DropdownMenuItem onSelect={() => { menuMovesFocus.current = true; setAnswering(null); setDropping({ id: node.id, text: "" }); }}>
              Drop…
            </DropdownMenuItem>
          )}
          {state === "settled" && (
            <DropdownMenuItem onSelect={() => void dropSettled(node)}>Drop (keeps the answer)</DropdownMenuItem>
          )}
          {state !== "open" && <DropdownMenuItem onSelect={() => void reopen(node)}>Reopen</DropdownMenuItem>}
          {!record && (
            <DropdownMenuItem onSelect={() => askDelete(node)} className="text-destructive focus:text-destructive">
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderRow = (item: Extract<ListItem<PlanningTask>, { kind: "row" }>) => {
    const node = item.node;
    const state = stateOf(node);
    const isEditing = editing?.id === node.id;
    const waiting = isWaiting(node, byId);
    const onFrontier = frontierIds.has(node.id);
    const isNext = nextIds.has(node.id);
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    const chosenOver = state === "dropped" && !!parent && stateOf(parent) === "settled";
    const count = counts.get(node.id);
    const tails = rowTails(node);
    const domain = node.url ? domainOf(node.url) : "";

    const titleCls =
      state === "dropped" ? "line-through text-muted-foreground/70"
        : state === "done" ? "text-muted-foreground"
          : state === "settled" ? "text-foreground/85"
            : waiting ? "text-muted-foreground"
              : "text-foreground";

    return (
      <div
        key={node.id}
        className={`group flex items-center gap-2 py-1 pr-2 rounded-lg transition-colors ${
          onFrontier && !isEditing ? "bg-primary/[0.06] shadow-[inset_2px_0_0_hsl(var(--primary)/0.55)]" : "hover:bg-white/5"
        } ${state === "dropped" ? "opacity-60" : waiting ? "opacity-70" : ""}`}
        style={{ paddingLeft: `${item.depth * INDENT + 8}px` }}
        title={waiting ? "Waiting: an open question above decides whether this is needed" : undefined}
        onContextMenu={(e) => { if (isEditing) return; e.preventDefault(); setMenuFor(node.id); }}
        onTouchStart={() => { if (!isEditing) pressStart(node.id); }}
        onTouchMove={pressEnd}
        onTouchEnd={pressEnd}
        onTouchCancel={pressEnd}
      >
        {item.hasChildren ? (
          <button
            type="button"
            aria-label={item.folded ? "Unfold" : "Fold"}
            aria-expanded={!item.folded}
            onClick={() => setFolded((prev) => {
              const s = new Set(prev);
              if (s.has(node.id)) s.delete(node.id); else s.add(node.id);
              return s;
            })}
            className="p-0.5 text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
          >
            {item.folded ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-[18px] flex-shrink-0" />
        )}

        <PlanningMarker
          look={{ ask: node.ask, state }}
          waiting={waiting}
          onClick={() => {
            if (longPressed.current) { longPressed.current = false; return; }
            void closeRow(node);
          }}
          title={
            state === "open" ? (node.ask ? "Answer it" : "Tick it")
              : state === "done" ? "Reopen" : "Details"
          }
        />

        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          {isEditing ? (
            <input
              ref={editRef}
              autoFocus
              value={editing.text}
              onChange={(e) => setEditing({ id: node.id, text: e.target.value })}
              onKeyDown={(e) => void onRowKey(e, node)}
              onPaste={(e) => onPasteInto(e, node.id)}
              onBlur={() => {
                if (quiet.current || windowBlur()) return;
                const text = editing.text;
                stopEdit();
                void saveTitle(node.id, text);
              }}
              className={inputCls}
            />
          ) : (
            <p
              className={`min-w-0 text-sm break-words cursor-text select-none sm:select-text ${titleCls}`}
              style={{ WebkitTouchCallout: "none" }}
              onClick={() => {
                if (longPressed.current) { longPressed.current = false; return; }
                startEdit(node);
              }}
            >
              {node.title}
              {tails.map((t, i) => (
                <span key={i} className="text-muted-foreground/80 font-normal">
                  {t.kind === "guess" ? ` ~ ${t.text}` : t.kind === "answer" ? ` = ${t.text}` : t.kind === "home" ? ` ${t.text}` : ` — ${t.text}`}
                </span>
              ))}
            </p>
          )}

          {!isEditing && (
            <>
              {state === "settled" && node.verdict && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0 ${VERDICT_CHIP[node.verdict].cls}`}>
                  {VERDICT_CHIP[node.verdict].label}
                </span>
              )}
              {chosenOver && (
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 flex-shrink-0">not chosen</span>
              )}
              {isNext && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full gradient-purple text-primary-foreground flex-shrink-0">
                  next
                </span>
              )}
              {node.ask && state === "open" && onFrontier && answering?.id !== node.id && (
                <button
                  type="button"
                  onClick={() => openAnswer(node)}
                  className="text-[10px] text-muted-foreground hover:text-primary flex-shrink-0 transition-colors"
                >
                  answer…
                </button>
              )}
              {node.url && (
                <a
                  href={/^https?:\/\//i.test(node.url) ? node.url : `https://${node.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={node.url}
                  className="flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
                    alt=""
                    className="w-3.5 h-3.5 rounded-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                </a>
              )}
              {node.notes?.trim() && (
                <button
                  type="button"
                  title="Notes"
                  onClick={() => setDetailId(node.id)}
                  className="text-muted-foreground/70 hover:text-foreground flex-shrink-0"
                >
                  <StickyNote className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>

        {count && count.total > 0 && (
          <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">{count.closed}/{count.total}</span>
        )}

        {!isEditing && (
          <button
            type="button"
            aria-label="Add a row under it"
            onClick={() => openDraft(node.id, null)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 hidden sm:block"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        {renderMenu(node)}
      </div>
    );
  };

  const renderClosedToggle = (item: Extract<ListItem<PlanningTask>, { kind: "closed" }>) => {
    const key = parentKey(item.parentId);
    return (
      <div key={`closed:${key}`} style={{ paddingLeft: `${item.depth * INDENT + 8 + 26}px` }} className="py-0.5">
        <button
          type="button"
          onClick={() => setShowClosed((prev) => {
            const s = new Set(prev);
            if (s.has(key)) s.delete(key); else s.add(key);
            return s;
          })}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {item.expanded ? `Hide ${item.count} closed` : `Show ${item.count} closed`}
        </button>
      </div>
    );
  };

  const body: ReactNode[] = [];
  items.forEach((item, i) => {
    if (i === draftAt) body.push(renderDraft());
    if (item.kind === "closed") body.push(renderClosedToggle(item));
    else {
      body.push(renderRow(item));
      const panel = renderPanel(item.node, item.depth);
      if (panel) body.push(panel);
    }
  });
  if (draft && draftAt >= items.length) body.push(renderDraft());

  const homeNode = homeId ? byId.get(homeId) ?? null : null;
  const homeParent = homeNode?.parent_id ? byId.get(homeNode.parent_id) ?? null : null;
  const empty = !loading && tasks.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto">
      <div className="glass-card p-3 sm:p-5">
        {loading && tasks.length === 0 && (
          <p className="text-xs text-muted-foreground px-2 pb-2">Loading…</p>
        )}
        {empty && !draft && (
          <p className="text-sm text-muted-foreground px-2 pb-3 leading-relaxed">
            Start with what you are aiming at. End a line with <span className="text-amber-300 font-semibold">?</span> to
            ask a question instead of planning a step, or paste a whole list to bring it in at once.
          </p>
        )}
        {openLoopsOnly && !empty && rowItems.length === 0 && (
          <p className="text-sm text-muted-foreground px-2 py-6 text-center">No open loops on this board.</p>
        )}

        <div className="space-y-px">{body}</div>

        {/* Hidden in Open loops, except on an empty board, where it is the only way in. */}
        {(!openLoopsOnly || empty) && (
          <div className="flex items-center gap-2 mt-2 py-1 px-2">
            <span className="w-[18px] flex-shrink-0" />
            <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              ref={rootRef}
              value={rootText}
              onChange={(e) => setRootText(e.target.value)}
              onKeyDown={onRootKey}
              onPaste={(e) => onPasteInto(e, null)}
              onFocus={() => { holdFocus.current = "root"; }}
              onBlur={() => { if (!quiet.current && holdFocus.current === "root") holdFocus.current = null; }}
              placeholder={placeholderFor(null)}
              className={inputCls}
            />
          </div>
        )}

        <p className="hidden sm:block text-[10px] text-muted-foreground/60 mt-3 px-2">
          Enter new row · Tab indent · Shift+Tab outdent · Alt+↑↓ move · Ctrl+Enter tick or answer · Ctrl+/ step ↔ question · paste a list
        </p>
      </div>

      <PlanningNodeDetail
        node={detailId ? byId.get(detailId) ?? null : null}
        open={!!detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null); }}
        onUpdate={updateNode}
        onSetState={setNodeState}
        nodes={tasks}
      />

      {paste && (
        <PlanningPastePreview
          open
          rows={paste.rows}
          target={paste.target}
          parentTitle={paste.parentTitle}
          onCancel={() => setPaste(null)}
          onInsert={insertPaste}
        />
      )}

      {homeNode && (
        <PlanningToHome
          node={homeNode}
          open
          onOpenChange={(o) => { if (!o) setHomeId(null); }}
          parentTitle={homeParent?.title ?? null}
          boardName={boardName}
          onAdded={async (outcome) => {
            if (await setNodeState(homeNode.id, "done", { outcome })) markClosed(homeNode.id);
          }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirmDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && confirmDelete.below > 0
                ? `The ${confirmDelete.below} ${confirmDelete.below === 1 ? "row" : "rows"} under it go too. `
                : "Its notes and link go too. "}
              Deleted rows are gone for good; Drop keeps them as a record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDelete) void deleteNodes([confirmDelete.id]); setConfirmDelete(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
