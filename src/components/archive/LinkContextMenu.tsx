import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ExternalLink, Copy, Pencil, MessageSquarePlus, Tag, Trash2 } from "lucide-react";
import { PILLARS, DIRECTIONS } from "@/lib/archive-data";
import type { ArchiveBlock } from "@/lib/archive-data";

interface ContextMenuState {
  x: number;
  y: number;
  url: string;
  block: ArchiveBlock;
}

interface Props {
  menu: ContextMenuState | null;
  onClose: () => void;
  onEditBlock: (block: ArchiveBlock) => void;
  updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>;
}

const LinkContextMenu = ({ menu, onClose, onEditBlock, updateBlock }: Props) => {
  const [subView, setSubView] = useState<null | "note" | "tags">(null);
  const [noteText, setNoteText] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menu, onClose]);

  // Reset sub-view when menu changes
  useEffect(() => {
    setSubView(null);
    setNoteText("");
  }, [menu]);

  if (!menu) return null;

  const { x, y, url, block } = menu;

  // Ensure menu stays within viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 260),
    top: Math.min(y, window.innerHeight - 350),
    zIndex: 9999,
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(url);
    toast.success("URL copied");
    onClose();
  };

  const handleOpenLink = () => {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  const handleEditBlock = () => {
    onEditBlock(block);
    onClose();
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const newContent = block.content + "\n\n" + noteText.trim();
    await updateBlock(block.id, { content: newContent });
    toast.success("Note added");
    onClose();
  };

  const handleRemoveLink = async () => {
    const newContent = block.content.replace(url, "").replace(/\n{3,}/g, "\n\n").trim();
    await updateBlock(block.id, { content: newContent });
    toast.success("Link removed from block");
    onClose();
  };

  const togglePillar = async (pillarId: string) => {
    const newPillars = block.pillars.includes(pillarId)
      ? block.pillars.filter((p) => p !== pillarId)
      : [...block.pillars, pillarId];
    await updateBlock(block.id, { pillars: newPillars });
    // Update local block reference for UI reactivity
    block.pillars = newPillars;
  };

  const toggleDirection = async (dirId: string) => {
    const newDirs = block.directions.includes(dirId)
      ? block.directions.filter((d) => d !== dirId)
      : [...block.directions, dirId];
    await updateBlock(block.id, { directions: newDirs });
    block.directions = newDirs;
  };

  const menuItem = "flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left rounded-md";
  const separator = "border-t border-white/10 my-1";

  if (subView === "note") {
    return (
      <div ref={ref} style={style} className="w-64 glass-card border border-white/15 rounded-xl p-3 shadow-2xl space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">📝 Add Note</p>
        <Input
          autoFocus
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Type a note..."
          className="bg-background/50 border-white/10 text-sm"
          onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
        />
        <div className="flex gap-2">
          <button onClick={() => setSubView(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Back</button>
          <button onClick={handleAddNote} disabled={!noteText.trim()} className="ml-auto text-xs px-3 py-1 rounded-lg gradient-purple text-primary-foreground font-semibold disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    );
  }

  if (subView === "tags") {
    return (
      <div ref={ref} style={style} className="w-72 glass-card border border-white/15 rounded-xl p-3 shadow-2xl space-y-3 max-h-[400px] overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground">🏷️ Edit Tags</p>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Pillars</p>
          <div className="flex flex-wrap gap-1">
            {PILLARS.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePillar(p.id)}
                className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-all ${
                  block.pillars.includes(p.id) ? "text-white" : "opacity-40 hover:opacity-70"
                }`}
                style={{
                  backgroundColor: block.pillars.includes(p.id) ? p.color : p.color + "22",
                  color: block.pillars.includes(p.id) ? "#fff" : p.color,
                }}
              >
                {p.icon} {p.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">Directions</p>
          <div className="flex flex-wrap gap-1">
            {DIRECTIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => toggleDirection(d.id)}
                className={`text-[10px] px-2 py-1 rounded-full font-semibold transition-all ${
                  block.directions.includes(d.id)
                    ? "gradient-purple text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => setSubView(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={style} className="w-56 glass-card border border-white/15 rounded-xl py-1.5 shadow-2xl">
      <button onClick={handleOpenLink} className={menuItem}>
        <ExternalLink size={14} className="text-muted-foreground" /> Open Link
      </button>
      <button onClick={handleCopyUrl} className={menuItem}>
        <Copy size={14} className="text-muted-foreground" /> Copy URL
      </button>

      <div className={separator} />

      <button onClick={handleEditBlock} className={menuItem}>
        <Pencil size={14} className="text-muted-foreground" /> Edit Block
      </button>
      <button onClick={() => setSubView("note")} className={menuItem}>
        <MessageSquarePlus size={14} className="text-muted-foreground" /> Add Note
      </button>
      <button onClick={() => setSubView("tags")} className={menuItem}>
        <Tag size={14} className="text-muted-foreground" /> Edit Tags
      </button>

      <div className={separator} />

      <button onClick={handleRemoveLink} className={`${menuItem} text-destructive hover:bg-destructive/10`}>
        <Trash2 size={14} /> Remove Link
      </button>
    </div>
  );
};

export default LinkContextMenu;
export type { ContextMenuState };
