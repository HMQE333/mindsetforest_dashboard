import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import type { ArchiveBlock } from "@/lib/archive-data";
import ArchiveEditModal from "./ArchiveEditModal";

const IMAGE_TAG_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;
const BARE_IMG_REGEX = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)/gi;

interface ImageItem {
  url: string;
  block: ArchiveBlock;
}

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
}

function extractImages(blocks: ArchiveBlock[]): ImageItem[] {
  const items: ImageItem[] = [];
  for (const block of blocks) {
    const urls = new Set<string>();
    let m: RegExpExecArray | null;
    const r1 = new RegExp(IMAGE_TAG_REGEX);
    while ((m = r1.exec(block.content))) urls.add(m[1]);
    const r2 = new RegExp(BARE_IMG_REGEX);
    while ((m = r2.exec(block.content))) urls.add(m[0]);
    for (const url of urls) items.push({ url, block });
  }
  return items;
}

const ArchiveImagesView = ({ blocks, loading, updateBlock, deleteBlock }: Props) => {
  const pillars = usePillars();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);

  const allImages = useMemo(() => extractImages(blocks), [blocks]);

  const filtered = filterPillar
    ? allImages.filter((img) => img.block.pillars.includes(filterPillar))
    : allImages;

  const lightboxUrl = lightboxIndex !== null ? filtered[lightboxIndex]?.url : null;

  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i < filtered.length - 1 ? i + 1 : i));
  }, [filtered.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setLightboxIndex(null);
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft") goPrev();
  }, [goNext, goPrev]);

  useEffect(() => {
    if (lightboxIndex !== null) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [lightboxIndex, handleKeyDown]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-2xl animate-pulse">🖼️</span>
        <p className="mt-2">Loading images...</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterPillar(null)}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
              !filterPillar ? "gradient-purple text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {pillars.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilterPillar(filterPillar === p.id ? null : p.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1 ${
                filterPillar === p.id ? "text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
              style={filterPillar === p.id ? { backgroundColor: p.color } : undefined}
            >
              <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={14} className="inline-block" /> {p.name}
            </button>
          ))}
          <span className="ml-auto text-sm text-muted-foreground">{filtered.length} images</span>
        </div>

        {/* Gallery grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-4xl mb-4 block">🖼️</span>
            <p className="text-muted-foreground">{allImages.length === 0 ? "No images yet" : "No images match your filter"}</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
            {filtered.map((img, i) => {
              const pillarColors = img.block.pillars
                .map((p) => pillars.find((pl) => pl.id === p))
                .filter(Boolean);
              const displayTitle = /^\[image\]\s*https?:\/\/\S+$/i.test(img.block.title?.trim() || "")
                ? "Image block"
                : img.block.title || "Untitled";

              return (
                <motion.div
                  key={`${img.block.id}-${img.url}-${i}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="break-inside-avoid glass-card overflow-hidden group"
                >
                  <button
                    onClick={() => setLightboxIndex(i)}
                    className="w-full block overflow-hidden"
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
                    />
                  </button>
                  <div className="p-3 space-y-1.5">
                    <button
                      onClick={() => setEditBlock(img.block)}
                      className="text-xs font-semibold text-foreground hover:text-primary transition-colors truncate block w-full text-left"
                    >
                      {displayTitle}
                    </button>
                    <div className="text-[10px] text-muted-foreground/60">
                      {new Date(img.block.created_at).toLocaleDateString()}
                    </div>
                    {pillarColors.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {pillarColors.map((p) => (
                          <span
                            key={p!.id}
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"
                            style={{ backgroundColor: p!.color + "22", color: p!.color }}
                          >
                            <PillarIcon icon={p!.icon} iconUrl={p!.iconUrl} size={10} className="inline-block" />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxIndex(null)}
          >
            <button onClick={() => setLightboxIndex(null)} className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
              <X size={20} />
            </button>
            <a href={lightboxUrl} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute top-4 right-16 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
              <Download size={20} />
            </a>
            <span className="absolute top-5 left-4 z-10 text-sm text-white/60 font-medium">
              {lightboxIndex + 1} / {filtered.length}
            </span>
            {lightboxIndex > 0 && (
              <button onClick={(e) => { e.stopPropagation(); goPrev(); }} className="absolute left-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
                <ChevronLeft size={24} />
              </button>
            )}
            {lightboxIndex < filtered.length - 1 && (
              <button onClick={(e) => { e.stopPropagation(); goNext(); }} className="absolute right-4 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors">
                <ChevronRight size={24} />
              </button>
            )}
            <motion.img
              key={lightboxUrl}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={lightboxUrl}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ArchiveEditModal
        block={editBlock}
        open={!!editBlock}
        onClose={() => setEditBlock(null)}
        onSave={async (id, updates) => {
          await updateBlock(id, updates);
          setEditBlock(null);
        }}
        onDelete={async (id) => {
          await deleteBlock(id);
          setEditBlock(null);
        }}
      />
    </>
  );
};

export default ArchiveImagesView;
