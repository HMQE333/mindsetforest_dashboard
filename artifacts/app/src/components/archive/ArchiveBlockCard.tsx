import { useState, useEffect, useCallback, memo, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, RefreshCw } from "lucide-react";
import type { Pillar } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import type { ArchiveBlock } from "@/lib/archive-data";
import type { TypeTag } from "@/lib/archive-tags";
import { cardView, noteTags } from "./archive-index";
import { DeleteConfirmButton, type Armed } from "./DeleteConfirm";
import { NoteTagChips } from "./TagChips";

/** How a press on a card was meant: Ctrl/Cmd toggles it in the selection, Shift selects up to it. */
export interface CardPress {
  shift: boolean;
  toggle: boolean;
}

interface Props {
  block: ArchiveBlock;
  /** Every pillar by id (from the list, so each card does not read the settings itself). */
  pillars: ReadonlyMap<string, Pillar>;
  selected: boolean;
  /** Something is selected (or a phone is in Select mode): every checkbox shows. */
  selecting: boolean;
  /** Shown in the peek. */
  peeked: boolean;
  /** The card the list's arrow keys stand on: the list's one tab stop. */
  focused: boolean;
  /** The trash says "Delete?" (a second press, or Enter, deletes). */
  armed: Armed | null;
  /** Folders are on and the device has a mouse: the card can be dropped on a folder. */
  draggable: boolean;
  /** The folder the Library is showing: its chip is drawn as such. */
  activeFolder?: string | null;
  /** A press on the card: the list decides (peek, select, range). */
  onPress: (block: ArchiveBlock, how: CardPress) => void;
  /** A double press: the full reader. */
  onOpenFull: (block: ArchiveBlock) => void;
  onToggleSelect: (id: string) => void;
  onArmDelete: (id: string) => void;
  onDisarmDelete: () => void;
  onConfirmDelete: (block: ArchiveBlock) => void;
  onFilterTag: (tag: string) => void;
  onFilterType: (type: TypeTag) => void;
  onFocusCard: (id: string) => void;
  onDragNote?: (block: ArchiveBlock, e: DragEvent) => void;
  onDragEndNote?: () => void;
  similarityScore?: number;
  updateAvailable?: boolean;
  /** Re-sync a note saved from the Forest, by its seed id. */
  onResync?: (seedId: string) => void;
}

/**
 * One note in the Library. A press peeks at it, a double press opens the
 * full reader, Ctrl/Cmd and Shift select. The card itself only carries the
 * checkbox and, on hover, the trash (two presses: "Delete?" then delete);
 * the note's actions are in the peek and in the selection bar.
 *
 * Memoised, and every callback it takes keeps its identity, so typing in the
 * search, peeking or moving the keyboard re-renders only the cards that change.
 */
const ArchiveBlockCard = ({
  block,
  pillars,
  selected,
  selecting,
  peeked,
  focused,
  armed,
  draggable,
  activeFolder,
  onPress,
  onOpenFull,
  onToggleSelect,
  onArmDelete,
  onDisarmDelete,
  onConfirmDelete,
  onFilterTag,
  onFilterType,
  onFocusCard,
  onDragNote,
  onDragEndNote,
  similarityScore,
  updateAvailable,
  onResync,
}: Props) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // The lightbox mounts the first time it opens, not with every card.
  const [overlays, setOverlays] = useState(false);
  const view = cardView(block);
  const tags = noteTags(block);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setLightboxUrl(null);
  }, []);

  useEffect(() => {
    if (lightboxUrl) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
    return undefined;
  }, [lightboxUrl, handleKeyDown]);

  const pillarChips = block.pillars.map((p) => pillars.get(p)).filter((p): p is Pillar => !!p);
  const openLightbox = (url: string) => { setOverlays(true); setLightboxUrl(url); };

  const tone = peeked
    ? "border-primary/70 ring-1 ring-primary/50 bg-primary/[0.04]"
    : selected
      ? "border-primary/60 glow-sm"
      : "hover:border-primary/30";

  return (
    <>
      <article
        data-note-id={block.id}
        tabIndex={focused ? 0 : -1}
        aria-label={view.title}
        aria-current={peeked ? "true" : undefined}
        onClick={(e) => {
          // The second press of a double press: the reader opens instead (onDoubleClick).
          if (e.detail > 1) return;
          // Shift-click selects a range of notes, not the text between two clicks.
          if (e.shiftKey) window.getSelection()?.removeAllRanges();
          onPress(block, { shift: e.shiftKey, toggle: e.metaKey || e.ctrlKey });
        }}
        onMouseDown={(e) => {
          // No word selected by a double press. With Shift a card that can be dragged must keep its
          // mousedown, or Shift held first ("hold Shift to move it") would cancel the drag; its text
          // is not selectable (select-none) and the click clears any selection.
          if (e.detail > 1 || (e.shiftKey && !draggable)) e.preventDefault();
        }}
        onDoubleClick={() => onOpenFull(block)}
        onFocus={(e) => {
          if (e.target === e.currentTarget) onFocusCard(block.id);
        }}
        draggable={draggable || undefined}
        onDragStart={draggable && onDragNote ? (e) => onDragNote(block, e) : undefined}
        onDragEnd={draggable ? onDragEndNote : undefined}
        className={`relative glass-card p-4 space-y-2.5 cursor-pointer group transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${draggable ? "select-none" : ""} ${tone} ${block.is_pinned ? "border-l-2 border-l-primary/50" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(block.id); }}
            aria-label={selected ? "Remove from the selection" : "Select"}
            aria-pressed={selected}
            className={`mt-0.5 w-5 h-5 [@media(hover:none)]:w-7 [@media(hover:none)]:h-7 rounded border-2 flex-shrink-0 flex items-center justify-center transition-[opacity,background-color,border-color] ${
              selected
                ? "bg-primary border-primary text-primary-foreground opacity-100"
                : // Touch screens have no hover: the box is always shown, a bit larger, so it can be tapped.
                  `border-white/25 hover:border-white/50 ${selecting ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"}`
            }`}
          >
            {selected && <span className="text-xs">✓</span>}
          </button>
          <div className="flex-1 min-w-0 pr-7">
            <div className="flex items-center gap-1.5">
              <h4 className="min-w-0 truncate font-semibold text-sm">{view.title}</h4>
              <span className="ml-auto flex flex-shrink-0 items-center gap-1">
                {similarityScore !== undefined && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">{Math.round(similarityScore * 100)}%</span>
                )}
                {block.is_pinned && <span className="text-xs" title="Pinned to the top" aria-label="Pinned">📌</span>}
                {block.is_starred && <span className="text-xs text-amber-400" title="Bookmarked" aria-label="Bookmarked">★</span>}
              </span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
              {/* Three lines show; the rest of a long block (a pasted list of links) stays out of the page. */}
              {view.preview}
            </p>
          </div>
        </div>

        {/* The trash, in the same corner as its "Delete?" (which grows to the left over the badges). */}
        <div
          className={`absolute right-2 top-2 z-[1] flex justify-end ${armed ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:hidden"}`}
        >
          <DeleteConfirmButton
            variant="card"
            armed={armed}
            onArm={() => onArmDelete(block.id)}
            onDisarm={onDisarmDelete}
            onConfirm={() => onConfirmDelete(block)}
            className={armed ? "" : "bg-background/70"}
          />
        </div>

        {/* Image thumbnails */}
        {view.imageCount > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {view.images.map((url, i) => (
              <button
                key={i}
                type="button"
                tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); openLightbox(url); }}
                className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted/50 border border-white/10 hover:border-primary/50 transition-colors"
              >
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => (e.currentTarget.style.display = "none")} />
              </button>
            ))}
            {view.imageCount > 4 && (
              <div className="shrink-0 w-16 h-16 rounded-lg bg-muted/50 border border-white/10 flex items-center justify-center text-xs text-muted-foreground">
                +{view.imageCount - 4}
              </div>
            )}
          </div>
        )}

        {/* Type, tags and pillars */}
        {(tags.shown.length > 0 || pillarChips.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <NoteTagChips tags={tags.shown} onTag={onFilterTag} onType={onFilterType} max={5} active={activeFolder} />
            {pillarChips.map((p) => (
              <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5" style={{ backgroundColor: p.color + "22", color: p.color }}>
                <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={12} className="inline-block" /> {p.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
          <span>{view.date}</span>
          {updateAvailable && onResync && block.from_seed_id && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onResync(block.from_seed_id!); }}
              className="ml-auto px-1.5 py-0.5 rounded-md bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-all flex items-center gap-1 text-[10px] font-bold animate-pulse"
              title="Author updated this seed. Re-sync to get the latest version"
            >
              <RefreshCw className="w-3 h-3" /> Update
            </button>
          )}
        </div>
      </article>

      {overlays && (<>
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxUrl(null)}
          >
            <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
              <X size={20} />
            </button>
            <a href={lightboxUrl} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute top-4 right-16 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
              <Download size={20} />
            </a>
            <motion.img initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} src={lightboxUrl} alt="" className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
      </>)}
    </>
  );
};

export default memo(ArchiveBlockCard);
