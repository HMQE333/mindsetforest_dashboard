import { useState } from "react";
import { motion } from "framer-motion";
import { PILLARS } from "@/lib/archive-data";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  block: ArchiveBlock;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onUpdate: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>;
}

const ArchiveBlockCard = ({ block, selected, onToggleSelect, onEdit, onUpdate }: Props) => {
  const [aiLoading, setAiLoading] = useState<string | null>(null);

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

  const pillarColors = block.pillars.map((p) => PILLARS.find((pl) => pl.id === p)).filter(Boolean);

  return (
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
          <h4 className="font-semibold text-sm truncate">{block.title || "Untitled"}</h4>
          <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{block.content}</p>
        </div>
      </div>

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
  );
};

export default ArchiveBlockCard;
