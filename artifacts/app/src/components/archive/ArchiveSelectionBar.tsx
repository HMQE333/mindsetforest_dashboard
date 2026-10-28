import { useMemo, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { FolderInput, Pin, PinOff, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePillars } from "@/hooks/usePillars";
import { shortTitle, type ArchiveBlock } from "@/lib/archive-data";
import { AI_ACTIONS } from "@/lib/archive-ai";
import { ArchiveAIMenu, useArchiveAI } from "./ArchiveAIProvider";
import FolderPicker from "./FolderPicker";
import { sameList, undoOnto } from "./folder-ops";
import { readNoteLists } from "./folder-store";
import { PillarRow } from "./TagChips";
import { deleteWithUndo } from "./pending-deletes";
import { getRemembered } from "./remembered";
import TagSuggestionList from "./TagSuggestionList";

type UpdateBlock = (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;

/**
 * One bar for one note or many (it shows from 1 selected). Its actions adapt
 * to the count: AI… (Shorten / Expand / Clean / own prompt on each, through
 * the preview; for 2+ also a prompt on all together), ✨ Suggest (type, tags
 * and pillars for each, accepted with Enter), Folder… (add to / move to),
 * Pillar… (toggle one pillar on all: if every note has it, it comes off),
 * Pin / Unpin, Plant, Delete (a confirmation naming the count, then the Undo
 * toast); Merge and Summarize from 2 notes (a new note through the preview),
 * shown disabled with "select 2+" for one. Every write has an Undo.
 * "Organize All" is gone: it wrote pillars and tags without asking.
 */

/** The Library's folder being viewed (ArchiveLibrary keeps it under this key): Move takes notes out of it. */
const VIEWED_FOLDER_KEY = "library.folder";

interface Change {
  id: string;
  before: Partial<ArchiveBlock>;
  after: Partial<ArchiveBlock>;
}

/** Write each note's change, a few at a time; resolves the ones saved (updateBlock toasts a failure). */
async function applyChanges(list: readonly Change[], updateBlock: UpdateBlock): Promise<Change[]> {
  const saved: Change[] = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const c = list[next++];
      if ((await updateBlock(c.id, c.after)) !== false) saved.push(c);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
  return saved;
}

async function applyWithUndo(list: readonly Change[], updateBlock: UpdateBlock, message: (n: number) => string) {
  if (!list.length) return;
  const saved = await applyChanges(list, updateBlock);
  if (!saved.length) return;
  toast.success(message(saved.length), {
    className: "[overflow-wrap:anywhere]",
    action: { label: "Undo", onClick: () => void undoChanges(saved, updateBlock) },
  });
}

/**
 * Undo on the notes as they are now, not by writing the old pillars back: the
 * toggled pillar comes off (or back), and a pillar toggled on one of them
 * since (the peek's row, an accepted chip) stays (undoOnto). Pin goes back.
 */
async function undoChanges(saved: readonly Change[], updateBlock: UpdateBlock) {
  const lists = saved.filter((c) => c.before.pillars && c.after.pillars);
  const now = lists.length ? await readNoteLists(lists.map((c) => c.id), "pillars") : new Map<string, string[]>();
  if (!now) {
    toast.error("Couldn't undo: the notes could not be read");
    return;
  }
  const back: Change[] = [];
  for (const c of saved) {
    if (c.before.pillars && c.after.pillars) {
      const current = now.get(c.id);
      if (!current) continue;
      const next = undoOnto(current, { before: c.before.pillars, after: c.after.pillars });
      if (!sameList(next, current)) back.push({ id: c.id, before: { pillars: current }, after: { pillars: next } });
    } else back.push({ id: c.id, before: c.after, after: c.before });
  }
  const done = await applyChanges(back, updateBlock);
  if (done.length === back.length) toast("Undone");
}

export default function ArchiveSelectionBar({
  selected,
  blocks,
  updateBlock,
  deleteBlock,
  onClear,
  onPlant,
}: {
  /** The selected notes, as they are now. */
  selected: readonly ArchiveBlock[];
  /** Every note (the folders to offer). */
  blocks: readonly ArchiveBlock[];
  updateBlock: UpdateBlock;
  deleteBlock: (id: string) => Promise<unknown>;
  onClear: () => void;
  onPlant: () => void;
}) {
  const ai = useArchiveAI();
  const pillars = usePillars();
  const [suggesting, setSuggesting] = useState<readonly ArchiveBlock[] | null>(null);
  const [pillarOpen, setPillarOpen] = useState(false);
  // Read when the folder menu opens: the folder the Library shows at that moment.
  const [viewed, setViewed] = useState<string | null>(null);
  const n = selected.length;
  const one = n === 1;
  const what = (k: number) => (k === 1 ? "1 note" : `${k} notes`);

  const allPinned = n > 0 && selected.every((b) => b.is_pinned);
  const pillarsOnAll = useMemo(() => pillars.filter((p) => n > 0 && selected.every((b) => (b.pillars ?? []).includes(p.id))).map((p) => p.id), [pillars, selected, n]);

  const togglePillar = (id: string) => {
    const name = pillars.find((p) => p.id === id)?.name ?? id;
    const remove = pillarsOnAll.includes(id);
    const list: Change[] = selected
      .filter((b) => remove || !(b.pillars ?? []).includes(id))
      .map((b) => {
        const before = [...(b.pillars ?? [])];
        return { id: b.id, before: { pillars: before }, after: { pillars: remove ? before.filter((p) => p !== id) : [...before, id] } };
      });
    void applyWithUndo(list, updateBlock, (k) => (remove ? `${name} removed from ${what(k)}` : `${name} added to ${what(k)}`));
  };

  const togglePin = () => {
    const pin = !allPinned;
    const list: Change[] = selected
      .filter((b) => !!b.is_pinned !== pin)
      .map((b) => ({ id: b.id, before: { is_pinned: !!b.is_pinned }, after: { is_pinned: pin } }));
    void applyWithUndo(list, updateBlock, (k) => (pin ? `Pinned ${what(k)}` : `Unpinned ${what(k)}`));
  };

  const doDelete = () => {
    const ids = selected.map((b) => b.id);
    deleteWithUndo(ids, deleteBlock, { label: one ? shortTitle(selected[0].title, 48) : undefined });
    onClear();
  };

  const btn =
    "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-white/10 bg-muted/50 px-2.5 py-1.5 text-[11px] font-bold transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";
  const sep = <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden />;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.18 }}
        role="toolbar"
        aria-label={`${n} selected`}
        lang="en"
        data-archive-selection-bar=""
        // Phones: two rows, the count with Delete and Clear always in sight, the other actions
        // scrolling under them. Wider: one row; the actions scroll if the window is narrow.
        // Above the toasts on every width: an action's Undo toast (bottom right) would cover
        // Delete and Clear on a laptop for as long as it shows.
        className="fixed inset-x-2 bottom-[5.25rem] z-50 mx-auto flex max-w-max flex-wrap items-center gap-1.5 rounded-2xl border border-white/20 px-3 py-2 glass-card glow-md sm:bottom-28 sm:flex-nowrap sm:px-4"
        // Nearly opaque: the cards scrolling under it must not show through its labels.
        style={{ "--card-opacity": 0.96 } as CSSProperties}
      >
        <span className="shrink-0 text-sm font-semibold tabular-nums">{n} selected</span>
        <div className="order-last flex min-w-0 basis-full items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&>*]:shrink-0 sm:order-none sm:flex-1 sm:basis-auto">
        <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden />
        <ArchiveAIMenu notes={selected} side="top" align="start" className={btn} />
        <button
          type="button"
          onClick={() => setSuggesting([...selected])}
          className={btn}
          title="✨ Suggest: type, tags and pillars from your similar notes, for each selected note. Nothing changes until you accept."
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Suggest
        </button>
        <FolderPicker notes={selected} blocks={blocks} viewed={viewed} updateBlock={updateBlock} align="center">
          <button
            type="button"
            onPointerDown={() => setViewed(getRemembered<string | null>(VIEWED_FOLDER_KEY, null))}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setViewed(getRemembered<string | null>(VIEWED_FOLDER_KEY, null))}
            className={btn}
            title="Add to a folder, or move into one"
          >
            <FolderInput className="h-3.5 w-3.5" aria-hidden /> Folder…
          </button>
        </FolderPicker>
        <Popover open={pillarOpen} onOpenChange={setPillarOpen}>
          <PopoverTrigger asChild>
            <button type="button" className={btn} title="Toggle a pillar on every selected note">
              <span aria-hidden>◐</span> Pillar…
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-[min(22rem,calc(100vw-2rem))] border-white/10 p-3" lang="en">
            <p className="mb-2 text-[11px] text-muted-foreground">
              {one ? "A press adds or removes the pillar." : `A press adds the pillar to all ${n}; lit when all ${n} have it, and then a press removes it from all.`}
            </p>
            <PillarRow pillars={pillars} active={pillarsOnAll} onToggle={togglePillar} />
          </PopoverContent>
        </Popover>
        <button type="button" onClick={togglePin} className={btn} title={allPinned ? "Unpin" : "Pin to the top of the Library"}>
          {allPinned ? <PinOff className="h-3.5 w-3.5" aria-hidden /> : <Pin className="h-3.5 w-3.5" aria-hidden />}
          {allPinned ? "Unpin" : "Pin"}
        </button>
        {sep}
        <button
          type="button"
          onClick={() => ai?.runMulti(selected, "merge")}
          onPointerEnter={ai?.preload}
          disabled={one || !ai || ai.busy}
          className={btn}
          title={one ? "Select 2+ notes to merge" : `${AI_ACTIONS.merge.icon} ${AI_ACTIONS.merge.border}`}
        >
          {AI_ACTIONS.merge.icon} Merge{one && <span className="font-normal opacity-70"> · select 2+</span>}
        </button>
        <button
          type="button"
          onClick={() => ai?.runMulti(selected, "summarize")}
          onPointerEnter={ai?.preload}
          disabled={one || !ai || ai.busy}
          className={btn}
          title={one ? "Select 2+ notes to summarize" : `${AI_ACTIONS.summarize.icon} ${AI_ACTIONS.summarize.border}`}
        >
          {AI_ACTIONS.summarize.icon} Summarize{one && <span className="font-normal opacity-70"> · select 2+</span>}
        </button>
        {sep}
        <button type="button" onClick={onPlant} className={`${btn} border-emerald-500/30 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30`}>
          🌱 Plant {n}
        </button>
        </div>
        <button type="button" onClick={doDelete} title="Move to Trash (kept 7 days)" className={`${btn} ml-auto border-destructive/30 bg-destructive/20 text-destructive hover:bg-destructive/30 sm:ml-0`}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
        <button type="button" onClick={onClear} className="ml-1 inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground" title="Clear the selection (Esc)">
          <X className="h-3.5 w-3.5" aria-hidden /> Clear
        </button>
      </motion.div>

      <Dialog open={suggesting !== null} onOpenChange={(o) => !o && setSuggesting(null)}>
        <DialogContent className="glass-card w-[calc(100vw-1rem)] max-w-2xl max-h-[85vh] overflow-hidden border-white/10" lang="en">
          <DialogHeader className="min-w-0 text-left">
            <DialogTitle className="text-gradient-purple">✨ Suggest: type, tags and pillars</DialogTitle>
            <DialogDescription className="text-[11px]">
              From your similar notes and the AI. Click a chip to leave it out; Enter accepts every note's chosen chips, Esc closes without recording anything.
            </DialogDescription>
          </DialogHeader>
          {suggesting && <TagSuggestionList notes={suggesting} onClose={() => setSuggesting(null)} variant="dialog" fresh autoFocus />}
        </DialogContent>
      </Dialog>
    </>
  );
}
