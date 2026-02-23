import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PILLARS } from "@/lib/archive-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

const IMAGE_TAG_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;
const BARE_IMG_REGEX = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)/gi;

interface Props {
  block: ArchiveBlock;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onUpdate: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>;
}

const ArchiveBlockCard = ({ block, selected, onToggleSelect, onEdit, onUpdate }: Props) => {
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const handleAIAction = async (action: string) => {
    setAiLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke("ai-archive-expand", {
        body: { content: block.content, title: block.title, action, pillars: block.pillars, directions: block.directions },
      });
      if (error) throw error;
      if (action === "organize" && data?.pillars) {
        await onUpdate(block.id, { pillars: data.pillars, directions: data.directions || block.directions, tags: data.tags || block.tags });
        toast.success("Tags updated by AI");
      } else if (data?.content) {
        await onUpdate(block.id, { content: data.content, title: data.title || block.title });
        toast.success(`Block ${action}ed`);
      }
    } catch (e: any) {
      toast.error(e?.message || "AI action failed");
    }
    setAiLoading(null);
  };

  // Close lightbox on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setLightboxUrl(null);
  }, []);

  useEffect(() => {
    if (lightboxUrl) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [lightboxUrl, handleKeyDown]);

  const pillarColors = block.pillars.map((p) => PILLARS.find((pl) => pl.id === p)).filter(Boolean);

  // Clean title: if it's just "[image] <url>", show "Image block"
  const displayTitle = /^\[image\]\s*https?:\/\/\S+$/i.test(block.title?.trim() || "")
    ? "Image block"
    : block.title || "Untitled";

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`glass-card-hover p-4 space-y-3 cursor-pointer ${selected ? "border-primary/60 glow-sm" : ""}`}
      >
        <div className="flex items-start gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`mt-1 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
              selected ? "bg-primary border-primary text-primary-foreground" : "border-white/20 hover:border-white/40"
            }`}
          >
            {selected && <span className="text-xs">✓</span>}
          </button>
          <div className="flex-1 min-w-0" onClick={onEdit}>
            <h4 className="font-semibold text-sm truncate">{displayTitle}</h4>
            <p className="text-xs text-muted-foreground line-clamp-3 mt-1">
              {block.content.replace(IMAGE_TAG_REGEX, "").trim() || "Image block"}
            </p>
          </div>
        </div>

        {/* Image thumbnails - clickable */}
        {(() => {
          const imgs: string[] = [];
          let m: RegExpExecArray | null;
          const r1 = new RegExp(IMAGE_TAG_REGEX);
          while ((m = r1.exec(block.content))) imgs.push(m[1]);
          const r2 = new RegExp(BARE_IMG_REGEX);
          while ((m = r2.exec(block.content))) { if (!imgs.includes(m[0])) imgs.push(m[0]); }
          if (imgs.length === 0) return null;
          return (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {imgs.slice(0, 4).map((url, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setLightboxUrl(url); }}
                  className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-muted/50 border border-white/10 hover:border-primary/50 transition-all hover:scale-105"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                </button>
              ))}
              {imgs.length > 4 && (
                <div className="shrink-0 w-16 h-16 rounded-lg bg-muted/50 border border-white/10 flex items-center justify-center text-xs text-muted-foreground">
                  +{imgs.length - 4}
                </div>
              )}
            </div>
          );
        })()}

        {/* Tags */}
        {(pillarColors.length > 0 || block.directions.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {pillarColors.map((p) => (
              <span key={p!.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: p!.color + "22", color: p!.color }}>
                {p!.icon} {p!.name}
              </span>
            ))}
            {block.directions.map((d) => (
              <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground font-semibold">
                {d}
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
          {new Date(block.created_at).toLocaleDateString()}
        </div>
      </motion.div>

      {/* Lightbox overlay */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => setLightboxUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={lightboxUrl}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ArchiveBlockCard;
