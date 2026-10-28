import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, ChevronLeft, ChevronRight, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import type { ArchiveBlock } from "@/lib/archive-data";
import ArchiveEditModal from "./ArchiveEditModal";
import { blockImages } from "./archive-index";
import { useRemembered } from "./remembered";
import TagFolderChips, { inTagFolder } from "@/components/shared/TagFolderChips";
import DateFilterRow from "@/components/shared/DateFilterRow";
import { ALL_DATES, filterByDate, type DateFilter } from "@/lib/date-filter";
import NoteReader, { preloadNoteReader, readerRequest, type ReaderRequest } from "./NoteReader";


interface ImageItem {
  url: string;
  block: ArchiveBlock;
}

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  deleteBlock: (id: string) => Promise<unknown>;
  /** New notes, one per uploaded picture. */
  addBlock?: (block: Partial<ArchiveBlock>) => Promise<unknown>;
}

/** Every image in the notes; each note is read once per version (archive-index). */
function extractImages(blocks: ArchiveBlock[]): ImageItem[] {
  const items: ImageItem[] = [];
  for (const block of blocks) for (const url of blockImages(block)) items.push({ url, block });
  return items;
}

const ArchiveImagesView = ({ blocks, loading, updateBlock, deleteBlock, addBlock }: Props) => {
  const { user } = useAuth();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const pillars = usePillars();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);
  const [reading, setReading] = useState<ReaderRequest | null>(null);

  const allImages = useMemo(() => extractImages(blocks), [blocks]);

  /** Each picture becomes its own note, in the folder being viewed. */
  const upload = async (files: FileList | null) => {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    if (uploadRef.current) uploadRef.current.value = "";
    if (!user || !addBlock || list.length === 0) {
      if (files?.length) toast.error("Only pictures under 10 MB");
      return;
    }
    setUploading(list.length);
    let done = 0;
    for (const file of list) {
      const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("archive-images").upload(path, file);
      if (!error) {
        const url = supabase.storage.from("archive-images").getPublicUrl(path).data.publicUrl;
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image";
        if (await addBlock({ title: name, content: `[image] ${url}`, tags: folder ? [folder] : [], pillars: filterPillar ? [filterPillar] : [] })) done++;
      }
      setUploading((n) => n - 1);
    }
    setUploading(0);
    if (done) toast.success(`${done} picture${done === 1 ? "" : "s"} added${folder ? ` to #${folder}` : ""}`);
    if (done < list.length) toast.error(`${list.length - done} could not be uploaded`);
  };
  // Folders counted per note with images (a note with three pictures counts once).
  const imageNoteTags = useMemo(() => [...new Map(allImages.map((i) => [i.block.id, i.block.tags ?? []])).values()], [allImages]);

  const [folder, setFolder] = useRemembered("images.folder", "");
  const [dateFilter, setDateFilter] = useRemembered<DateFilter>("images.date", ALL_DATES);
  const filtered = useMemo(() => {
    let l = filterPillar ? allImages.filter((img) => img.block.pillars.includes(filterPillar)) : allImages;
    if (folder) l = l.filter((img) => inTagFolder(img.block.tags, folder));
    return filterByDate(l, dateFilter, (img) => img.block.created_at);
  }, [allImages, filterPillar, folder, dateFilter]);

  /** A note opened from under one of its images: the reader steps through the notes in the gallery's order. */
  const readNote = (block: ArchiveBlock) => {
    const notes = [...new Map(filtered.map((img) => [img.block.id, img.block])).values()];
    setReading(readerRequest(block, notes));
  };

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
    return undefined;
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
          {addBlock && (
            <>
              <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
              <button
                onClick={() => uploadRef.current?.click()}
                disabled={uploading > 0}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-muted/60 text-foreground hover:bg-primary/20 transition-all flex items-center gap-1.5 disabled:opacity-60"
                title={folder ? `Each picture becomes a note in #${folder}` : "Each picture becomes a note"}
              >
                {uploading > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {uploading > 0 ? `Uploading ${uploading}…` : folder ? `Add to #${folder.split("/").pop()}` : "Add pictures"}
              </button>
            </>
          )}
        </div>

        <TagFolderChips tagLists={imageNoteTags} value={folder} onChange={setFolder} />
        <DateFilterRow value={dateFilter} onChange={setDateFilter} />

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
                      onClick={() => readNote(img.block)}
                      onPointerEnter={preloadNoteReader}
                      data-note-id={img.block.id}
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

      <NoteReader
        request={reading}
        blocks={blocks}
        from="Images"
        onClose={() => setReading(null)}
        onEdit={setEditBlock}
        onUpdate={updateBlock}
        onDelete={deleteBlock}
      />

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
