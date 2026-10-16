import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { List, Map as MapIcon, CircleDot } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBoards, type PlanningBoard } from "@/hooks/useBoards";
import { usePlanningState } from "@/hooks/usePlanningState";
import { getRememberedBoard, rememberBoard } from "@/lib/planning-board";
import { counts, frontier, stateOf } from "@/lib/planning-model";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PlanningBoards, { BoardSwitcher } from "./PlanningBoards";
import PlanningStack from "./PlanningStack";
import PlanningMap from "./PlanningMap";

type Mode = "list" | "map";

// Which view was open last (a per-browser convenience; the board is remembered in planning-board.ts).
const MODE_KEY = "mf-planning-mode";
function readMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === "map" ? "map" : "list"; } catch { return "list"; }
}
function saveMode(mode: Mode) {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage blocked */ }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Scope for the header's rows while no board is on screen: matches no row (an unscoped hook would read every row).
const NO_BOARD = "00000000-0000-0000-0000-000000000000";

/** The newest board (what ensureBoard falls back to, so the assistant writes where he looks). */
function newestBoard(boards: PlanningBoard[]): PlanningBoard | null {
  return boards.reduce<PlanningBoard | null>((best, b) => (!best || b.created_at > best.created_at ? b : best), null);
}

/**
 * Planning: one header over one tree. The header holds the board switcher (the
 * remembered board), [List | Map], the [Open loops] filter and the counts.
 * With no board yet, the page is the empty state that creates the first one.
 */
export default function PlanningView() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { boards, loading: boardsLoading, addBoard, renameBoard, deleteBoard } = useBoards();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [mode, setModeState] = useState<Mode>(readMode);
  const [openLoops, setOpenLoops] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setMode = (m: Mode) => { setModeState(m); saveMode(m); };

  const selectBoard = (id: string | null) => {
    setBoardId(id);
    if (userId) rememberBoard(userId, id);
  };

  // The board on screen: the current one while it exists, else the remembered
  // one, else the newest. Remembered so the assistant writes to the same board.
  useEffect(() => {
    if (boardsLoading || !userId) return;
    if (boardId && boards.some(b => b.id === boardId)) return;
    const remembered = getRememberedBoard(userId);
    const pick = boards.find(b => b.id === remembered) ?? newestBoard(boards);
    setBoardId(pick?.id ?? null);
    if (pick?.id !== remembered) rememberBoard(userId, pick?.id ?? null);
  }, [boards, boardsLoading, userId, boardId]);

  const board = boards.find(b => b.id === boardId) ?? null;
  // Scoped to the board on screen (the header's counts and the delete confirm).
  const { tasks } = usePlanningState(undefined, { boardId: board?.id ?? NO_BOARD });
  const boardTasks = useMemo(() => (board ? tasks.filter(t => t.board_id === board.id) : []), [tasks, board]);
  const header = useMemo(() => ({ ...counts(boardTasks), front: frontier(boardTasks).length }), [boardTasks]);
  const deleteStats = useMemo(() => ({
    total: boardTasks.length,
    open: boardTasks.filter(t => stateOf(t) === "open").length,
    settled: boardTasks.filter(t => stateOf(t) === "settled").length,
    graded: boardTasks.filter(t => t.verdict != null).length,
  }), [boardTasks]);

  const handleCreate = async (name: string, emoji: string) => {
    const created = await addBoard(name, emoji);
    if (!created) return false;
    selectBoard(created.id);
    return true;
  };

  const handleRename = async (name: string, emoji: string) => (board ? renameBoard(board.id, name, emoji) : false);

  const handleDelete = async () => {
    if (!board) return;
    const ok = await deleteBoard(board.id);
    // The effect above picks the next board (and remembers it) once the list updates.
    if (ok) selectBoard(null);
  };

  if (boardsLoading) {
    return <div className="flex items-center justify-center py-20"><div className="text-muted-foreground animate-pulse text-sm">Loading planning…</div></div>;
  }

  if (boards.length === 0) {
    return <PlanningBoards onCreate={handleCreate} />;
  }

  if (!board) return null;

  const deleteBody = deleteStats.total === 0
    ? "The board is empty. This can't be undone."
    : `This deletes ${plural(deleteStats.total, "node", "nodes")} with it: ${plural(deleteStats.open, "open loop", "open loops")} and ${plural(deleteStats.settled, "settled question", "settled questions")}${deleteStats.graded > 0 ? ` (${plural(deleteStats.graded, "graded guess", "graded guesses")})` : ""}. Missions already added to Home stay. This can't be undone.`;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* One header over one tree */}
      <div className={`flex flex-wrap items-center gap-2 ${mode === "list" ? "max-w-4xl mx-auto" : ""}`}>
        <div className="min-w-0 max-w-full">
          <BoardSwitcher
            boards={boards}
            current={board}
            onSelect={id => selectBoard(id)}
            onCreate={handleCreate}
            onRename={handleRename}
            onDelete={() => setConfirmDelete(true)}
          />
        </div>
        {boardTasks.length > 0 && (
          <span className="text-xs text-muted-foreground px-1">
            {header.next} next · {plural(header.openQuestions, "open question", "open questions")}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setOpenLoops(v => !v)}
            aria-pressed={openLoops}
            title="Only what can be worked on now, with the nodes above it"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              openLoops
                ? "gradient-purple text-primary-foreground border-transparent glow-sm"
                : "bg-muted/30 border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <CircleDot className="h-3.5 w-3.5" />
            Open loops
            {header.front > 0 && <span className={`font-mono ${openLoops ? "" : "text-foreground/70"}`}>{header.front}</span>}
          </button>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50 backdrop-blur-lg border border-white/10">
            {([["list", "List", List], ["map", "Map", MapIcon]] as const).map(([m, label, Icon]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                aria-label={label}
                title={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${
                  mode === m ? "gradient-purple text-primary-foreground glow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === "list"
        ? <PlanningStack key={board.id} boardId={board.id} openLoopsOnly={openLoops} boardName={board.name} />
        : <PlanningMap key={board.id} board={board} openLoops={openLoops} />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{board.emoji} {board.name}”?</AlertDialogTitle>
            <AlertDialogDescription>{deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Delete board
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
