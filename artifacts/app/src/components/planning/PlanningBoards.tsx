import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_BOARD_EMOJI, type PlanningBoard } from "@/hooks/useBoards";

/**
 * Boards are the 📁 folder above one tree. They live in the Planning header as
 * a switcher; the only full-page board UI left is the empty state that creates
 * the first one.
 */

const EMOJI_CHOICES = ["📁", "🎯", "🚀", "🧭", "💡", "📌", "🌱", "🔥", "⚡", "🏆", "📥", "🗂️"];

/** Name + emoji, used to create and to rename a board. */
function BoardForm({ initialName = "", initialEmoji = DEFAULT_BOARD_EMOJI, submitLabel, onSubmit, onCancel, autoFocus = true }: {
  initialName?: string;
  initialEmoji?: string;
  submitLabel: string;
  onSubmit: (name: string, emoji: string) => Promise<void> | void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await onSubmit(name.trim(), emoji.trim() || DEFAULT_BOARD_EMOJI); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <input
          value={emoji}
          onChange={e => setEmoji(e.target.value.slice(0, 8))}
          className="w-12 text-center bg-muted/30 border border-white/10 rounded-xl px-1 py-2 text-lg outline-none focus:border-primary/50"
          aria-label="Board emoji"
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") void submit(); if (e.key === "Escape") onCancel?.(); }}
          placeholder="Board name…"
          className="flex-1 min-w-0 bg-muted/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
          autoFocus={autoFocus}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {EMOJI_CHOICES.map(e => (
          <button
            key={e}
            type="button"
            onClick={() => setEmoji(e)}
            className={`w-7 h-7 rounded-lg text-sm transition-all ${emoji === e ? "bg-primary/20 ring-1 ring-primary/50" : "bg-muted/30 hover:bg-muted/50"}`}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => void submit()} disabled={!name.trim() || busy} className="px-3.5 py-1.5 rounded-xl gradient-purple text-primary-foreground font-bold text-xs disabled:opacity-50">{submitLabel}</button>
        {onCancel && <button onClick={onCancel} className="px-3.5 py-1.5 rounded-xl bg-muted/30 text-muted-foreground text-xs">Cancel</button>}
      </div>
    </div>
  );
}

/** The header switcher: emoji + name ▾, the other boards, + New board, rename, delete. */
export function BoardSwitcher({ boards, current, onSelect, onCreate, onRename, onDelete }: {
  boards: PlanningBoard[];
  current: PlanningBoard;
  onSelect: (id: string) => void;
  onCreate: (name: string, emoji: string) => Promise<boolean>;
  onRename: (name: string, emoji: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create" | "rename">("list");

  const close = () => { setOpen(false); setMode("list"); };

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setMode("list"); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 min-w-0 max-w-full px-3 py-2 rounded-xl bg-muted/30 border border-white/10 hover:bg-muted/50 transition-all">
          <span className="text-lg leading-none">{current.emoji}</span>
          <span className="text-sm font-bold text-foreground truncate">{current.name}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 rounded-xl border-white/10 bg-background/95 backdrop-blur-xl">
        {mode === "list" && (
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground px-2 pt-1 pb-0.5 font-medium uppercase tracking-wider">Boards</p>
            <div className="max-h-64 overflow-y-auto space-y-0.5" onWheel={e => e.stopPropagation()}>
              {boards.map(b => (
                <button
                  key={b.id}
                  onClick={() => { onSelect(b.id); close(); }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${b.id === current.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
                >
                  <span className="text-base leading-none">{b.emoji}</span>
                  <span className="truncate flex-1 text-left">{b.name}</span>
                  {b.id === current.id && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
            <div className="h-px bg-white/10 my-1" />
            <button onClick={() => setMode("create")} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-foreground hover:bg-white/5 transition-all">
              <Plus className="h-3.5 w-3.5 text-primary" /> New board
            </button>
            <button onClick={() => setMode("rename")} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all">
              <Pencil className="h-3.5 w-3.5" /> Rename “{current.name}”
            </button>
            <button onClick={() => { close(); onDelete(); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all">
              <Trash2 className="h-3.5 w-3.5" /> Delete board…
            </button>
          </div>
        )}
        {mode === "create" && (
          <div className="p-1.5">
            <p className="text-xs font-semibold text-foreground mb-2">New board</p>
            <BoardForm
              submitLabel="Create"
              onSubmit={async (name, emoji) => { if (await onCreate(name, emoji)) close(); }}
              onCancel={() => setMode("list")}
            />
          </div>
        )}
        {mode === "rename" && (
          <div className="p-1.5">
            <p className="text-xs font-semibold text-foreground mb-2">Rename board</p>
            <BoardForm
              initialName={current.name}
              initialEmoji={current.emoji}
              submitLabel="Save"
              onSubmit={async (name, emoji) => { if (await onRename(name, emoji)) close(); }}
              onCancel={() => setMode("list")}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** No board yet: create the first one. */
export default function PlanningBoards({ onCreate }: { onCreate: (name: string, emoji: string) => Promise<boolean> }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto glass-card p-6 space-y-4">
      <div className="text-center space-y-2">
        <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
        <h2 className="text-lg font-bold text-foreground">Start your first board</h2>
        <p className="text-sm text-muted-foreground">
          A board holds one plan: steps to do and questions to answer. Name it after what you're aiming at.
        </p>
      </div>
      <BoardForm submitLabel="Create board" onSubmit={async (name, emoji) => { await onCreate(name, emoji); }} autoFocus={false} />
    </motion.div>
  );
}
