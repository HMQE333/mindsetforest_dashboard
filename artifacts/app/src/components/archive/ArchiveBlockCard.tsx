import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Eye, Sprout, RefreshCw } from "lucide-react";
import type { Pillar } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";
import ArchiveAIPreviewModal from "./ArchiveAIPreviewModal";
import { cardView } from "./archive-index";

interface Props {
  block: ArchiveBlock;
  /** Every pillar by id (from the list, so each card does not read the settings itself). */
  pillars: ReadonlyMap<string, Pillar>;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  /** A click on the card (or Enter on it): the list decides what opening a note means (the reader, or the editor). */
  onOpen: (block: ArchiveBlock) => void;
  onUpdate: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  similarityScore?: number;
  onPlant?: (block: ArchiveBlock) => void;
  updateAvailable?: boolean;
  /** Re-sync a note saved from the Forest, by its seed id. */
  onResync?: (seedId: string) => void;
}

/**
 * One note in the Library. Memoised, and every callback it takes keeps its
 * identity, so typing in the search or ticking another card re-renders only
 * the cards that change. No layout animation: measuring every card on every
 * change forced a layout of the whole list inside each click.
 */
const ArchiveBlockCard = ({ block, pillars, selected, onToggleSelect, onOpen, onUpdate, similarityScore, onPlant, updateAvailable, onResync }: Props) => {
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // The lightbox mounts the first time it opens, not with every card.
  const [overlays, setOverlays] = useState(false);
  const [previewData, setPreviewData] = useState<{
    action: string;
    original: { title: string; content: string; pillars?: string[]; tags?: string[] };
    proposed: { title?: string; content?: string; pillars?: string[]; tags?: string[] };
  } | null>(null);
  const view = cardView(block);

  const handleAIAction = async (action: string) => {
    setAiLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke("ai-archive-expand", {
        body: { content: block.content, title: block.title, action, pillars: block.pillars },
      });
      if (error) throw error;

      if (action === "organize" && data?.pillars) {
        setPreviewData({
          action,
          original: { title: block.title, content: block.content, pillars: block.pillars, tags: block.tags },
          proposed: { pillars: data.pillars, tags: data.tags || [] },
        });
      } else if (data?.content) {
        setPreviewData({
          action,
          original: { title: block.title, content: block.content },
          proposed: { title: data.title, content: data.content },
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "AI action failed");
    }
    setAiLoading(null);
  };

  const handlePreviewAccept = async (proposed: Record<string, any>) => {
    const updates: Partial<ArchiveBlock> = {};
    if (proposed.content) updates.content = proposed.content;
    if (proposed.title) updates.title = proposed.title;
    if (proposed.pillars) updates.pillars = proposed.pillars;
    if (proposed.tags) updates.tags = proposed.tags;
    await onUpdate(block.id, updates);
    toast.success(`Block updated ✅`);
    setPreviewData(null);
  };

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

  const pillarColors = block.pillars.map((p) => pillars.get(p)).filter(Boolean);
  const displayTitle = view.title;
  const openLightbox = (url: string) => { setOverlays(true); setLightboxUrl(url); };

  return (
    <>
      {/* A press anywhere on the card reads the note (its own buttons stop the press); the title
          is the one button for the keyboard and a screen reader, inside its heading. */}
      <div
        onClick={() => onOpen(block)}
        className={`glass-card p-4 space-y-3 cursor-pointer group transition-colors duration-150 ${selected ? "border-primary/60 glow-sm" : "hover:border-primary/30"} ${block.is_pinned ? "border-l-2 border-l-primary/50" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(block.id); }}
            aria-label="Select for a bulk action"
            aria-pressed={selected}
            className={`mt-1 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
              selected ? "bg-primary border-primary text-primary-foreground" : "border-white/20 hover:border-white/40"
            }`}
          >
            {selected && <span className="text-xs">✓</span>}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="min-w-0 font-semibold text-sm">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onOpen(block); }}
                  data-note-id={block.id}
                  className="block max-w-full truncate text-left rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {displayTitle}
                </button>
              </h4>
              {similarityScore !== undefined && (
                <span className="ml-auto flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
                  {Math.round(similarityScore * 100)}%
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
              {/* Three lines show; the rest of a long block (a pasted list of links) stays out of the page. */}
              {view.preview}
            </p>
          </div>
          {/* Two separate things: the pin keeps a note at the top here, the star lists it in Bookmarks. */}
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate(block.id, { is_pinned: !block.is_pinned }); }}
            className={`mt-1 text-sm transition-opacity ${block.is_pinned ? "opacity-100" : "opacity-0 grayscale group-hover:opacity-60 [@media(hover:none)]:opacity-40 hover:!opacity-100"}`}
            title={block.is_pinned ? "Unpin" : "Pin to the top"}
            aria-label={block.is_pinned ? "Unpin" : "Pin this note"}
          >
            📌
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onUpdate(block.id, { is_starred: !block.is_starred }); }}
            className={`mt-1 text-sm transition-opacity ${block.is_starred ? "opacity-100 text-amber-400" : "opacity-0 group-hover:opacity-60 [@media(hover:none)]:opacity-40 hover:!opacity-100 text-muted-foreground"}`}
            title={block.is_starred ? "Remove bookmark" : "Bookmark"}
            aria-label={block.is_starred ? "Remove bookmark" : "Bookmark this note"}
          >
            {block.is_starred ? "★" : "☆"}
          </button>
          {onPlant && (
            <button
              onClick={(e) => { e.stopPropagation(); onPlant(block); }}
              className="mt-1 p-1 rounded-md text-emerald-400/80 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all opacity-0 group-hover:opacity-100"
              title="Plant in the Forest"
            >
              <Sprout className="w-4 h-4" />
            </button>
          )}
          {updateAvailable && onResync && block.from_seed_id && (
            <button
              onClick={(e) => { e.stopPropagation(); onResync(block.from_seed_id!); }}
              className="mt-1 px-1.5 py-1 rounded-md bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 transition-all flex items-center gap-1 text-[10px] font-bold animate-pulse"
              title="Author updated this seed. Re-sync to get the latest version"
            >
              <RefreshCw className="w-3 h-3" /> Update
            </button>
          )}
          {/* A hint for the mouse; the title is the keyboard's way in, so this is not a second tab stop. */}
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(block); }}
            className="mt-1 p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all opacity-0 group-hover:opacity-100"
            title="Read"
            tabIndex={-1}
            aria-hidden="true"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>

        {/* Image thumbnails */}
        {view.imageCount > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {view.images.map((url, i) => (
              <button
                key={i}
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

        {/* Tags */}
        {pillarColors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pillarColors.map((p) => (
              <span key={p!.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5" style={{ backgroundColor: p!.color + "22", color: p!.color }}>
                <PillarIcon icon={p!.icon} iconUrl={p!.iconUrl} size={12} className="inline-block" /> {p!.name}
              </span>
            ))}
          </div>
        )}

        {/* AI action buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { key: "expand", label: "💡 Expand" },
            { key: "shorten", label: "✂️ Shorten" },
            { key: "summarize", label: "📝 Summary" },
            { key: "organize", label: "🏷️ Organize" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={(e) => { e.stopPropagation(); handleAIAction(key); }}
              disabled={aiLoading !== null}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-all disabled:opacity-40"
            >
              {aiLoading === key ? "⏳" : label}
            </button>
          ))}
        </div>

        <div className="text-[10px] text-muted-foreground/60">
          {view.date}
        </div>
      </div>

      {previewData && (
        <ArchiveAIPreviewModal
          open
          data={previewData}
          onAccept={handlePreviewAccept}
          onReject={() => setPreviewData(null)}
        />
      )}

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
