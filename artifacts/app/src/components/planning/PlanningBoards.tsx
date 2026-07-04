import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, ChevronRight, LayoutDashboard, Trash2, Link2 } from "lucide-react";
import { useBoards } from "@/hooks/useBoards";
import { usePlanningState } from "@/hooks/usePlanningState";

interface Props {
  onOpenBoard: (id: string) => void;
}

const EMOJI_CHOICES = ["🗂️", "🎯", "🚀", "🧭", "💡", "📌", "🌱", "🔥", "⚡", "🏆"];

export default function PlanningBoards({ onOpenBoard }: Props) {
  const { boards, links, addBoard, deleteBoard, loading } = useBoards();
  const { tasks } = usePlanningState();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🗂️");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const board = await addBoard(newName.trim(), newEmoji);
    setNewName("");
    setNewEmoji("🗂️");
    setShowAdd(false);
    if (board) onOpenBoard(board.id);
  };

  const boardStats = (boardId: string) => {
    const linkedProjectIds = links.filter(l => l.board_id === boardId).map(l => l.project_id);
    const boardTasks = tasks.filter(t =>
      t.level !== "link" && (t.board_id === boardId || (t.project_id && linkedProjectIds.includes(t.project_id)))
    );
    const done = boardTasks.filter(t => t.done).length;
    const total = boardTasks.length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0, linkedCount: linkedProjectIds.length };
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Boards</h2>
          <p className="text-sm text-muted-foreground">Independent planning spaces — link projects or plan freely</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          <Plus className="h-4 w-4" /> New Board
        </button>
      </div>

      {showAdd && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={newEmoji}
              onChange={e => setNewEmoji(e.target.value.slice(0, 2) || "🗂️")}
              className="w-14 text-center bg-muted/30 border border-white/10 rounded-xl px-2 py-2 text-lg outline-none focus:border-primary/50"
              aria-label="Board emoji"
            />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
              placeholder="Board name..."
              className="flex-1 bg-muted/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              autoFocus
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CHOICES.map(e => (
              <button
                key={e}
                onClick={() => setNewEmoji(e)}
                className={`w-8 h-8 rounded-lg text-base transition-all ${newEmoji === e ? "bg-primary/20 ring-1 ring-primary/50" : "bg-muted/30 hover:bg-muted/50"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-xs">Create</button>
            <button onClick={() => { setShowAdd(false); setNewName(""); setNewEmoji("🗂️"); }} className="px-4 py-2 rounded-xl bg-muted/30 text-muted-foreground text-xs">Cancel</button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">Loading boards…</p>
      ) : boards.length === 0 ? (
        <div className="glass-card p-10 text-center space-y-3">
          <LayoutDashboard className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">No boards yet. Create your first board to start planning.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {boards.map(board => {
            const { done, total, pct, linkedCount } = boardStats(board.id);
            return (
              <button
                key={board.id}
                onClick={() => onOpenBoard(board.id)}
                className="glass-card p-5 text-left group hover:border-primary/30 transition-all relative"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{board.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{board.name}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Link2 className="h-3 w-3" />{linkedCount} linked</span>
                      {total > 0 && <span className="font-mono">{done}/{total} done</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all" />
                </div>
                {total > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div className="h-full rounded-full gradient-purple transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete board "${board.name}"? This removes the board and any tasks created directly on it. Linked projects are not affected.`)) deleteBoard(board.id); }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
