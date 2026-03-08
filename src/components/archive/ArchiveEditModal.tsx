import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PILLARS, DIRECTIONS } from "@/lib/archive-data";
import type { ArchiveBlock } from "@/lib/archive-data";

const IMAGE_TAG_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;

interface Props {
  block: ArchiveBlock | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  semanticSearch?: (query: string) => Promise<ArchiveBlock[]>;
  onEditBlock?: (block: ArchiveBlock) => void;
}

const ArchiveEditModal = ({ block, open, onClose, onSave, onDelete }: Props) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (block) {
      setTitle(block.title);
      setContent(block.content);
      setPillars(block.pillars);
      setDirections(block.directions);
      setTags(block.tags.join(", "));
    }
  }, [block]);

  // Extract image URLs from content for preview
  const imageUrls = useMemo(() => {
    const urls: string[] = [];
    let match;
    const regex = new RegExp(IMAGE_TAG_REGEX.source, "g");
    while ((match = regex.exec(content)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }, [content]);

  if (!block) return null;

  const togglePillar = (id: string) =>
    setPillars((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  const toggleDirection = (id: string) =>
    setDirections((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  const handleSave = async () => {
    setSaving(true);
    await onSave(block.id, {
      title,
      content,
      pillars,
      directions,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    await onDelete(block.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gradient-purple">Edit Block</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="bg-background/50 border-white/10" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" className="min-h-[120px] bg-background/50 border-white/10" />

          {/* Image preview strip */}
          {imageUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {imageUrls.map((url, i) => (
                <div key={i} className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-muted/50">
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Pillars</p>
            <div className="flex flex-wrap gap-1.5">
              {PILLARS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePillar(p.id)}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
                    pillars.includes(p.id) ? "text-white" : "opacity-40 hover:opacity-70"
                  }`}
                  style={{ backgroundColor: pillars.includes(p.id) ? p.color : p.color + "22", color: pillars.includes(p.id) ? "#fff" : p.color }}
                >
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Directions</p>
            <div className="flex flex-wrap gap-1.5">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => toggleDirection(d.id)}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all ${
                    directions.includes(d.id)
                      ? "gradient-purple text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.icon} {d.label}
                </button>
              ))}
            </div>
          </div>

          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Custom tags (comma separated)" className="bg-background/50 border-white/10" />

          <div className="flex gap-3 pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="font-bold">
                  🗑️ Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="glass-card border-white/10">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this block?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The block "{block.title}" will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex-1" />
            <Button onClick={onClose} variant="outline" className="border-white/10 font-bold">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gradient-purple text-primary-foreground font-bold glow-sm">
              {saving ? "⏳ Saving..." : "💾 Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ArchiveEditModal;
