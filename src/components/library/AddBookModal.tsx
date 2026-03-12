import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COVER_COLORS, DIRECTION_TAGS, FORMAT_LABELS, BookFormat } from "@/lib/library-data";
import { PILLARS } from "@/lib/archive-data";
import type { BookStatus } from "@/lib/library-data";
import { X } from "lucide-react";

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (book: { title: string; author: string; total_pages: number; status: BookStatus; cover_color: string; tags: string[]; pillars: string[]; directions: string[]; format: BookFormat }) => void;
}

export default function AddBookModal({ open, onClose, onAdd }: AddBookModalProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [status, setStatus] = useState<BookStatus>("to-read");
  const [color, setColor] = useState(COVER_COLORS[0]);
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [pillars, setPillars] = useState<string[]>([]);
  const [format, setFormat] = useState<BookFormat>("owned");

  const addTag = (tag: string) => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(prev => [...prev, t]); };
  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));
  const handleCustomTagKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && customTag.trim()) { e.preventDefault(); addTag(customTag); setCustomTag(""); } };
  const togglePillar = (id: string) => setPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), author: author.trim(), total_pages: parseInt(pages) || 0, status, cover_color: color, tags, pillars, directions: [], format });
    setTitle(""); setAuthor(""); setPages(""); setStatus("to-read"); setColor(COVER_COLORS[0]); setTags([]); setCustomTag(""); setPillars([]); setFormat("owned");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">📖 Add Book</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} className="bg-muted/30 border-white/10" />
          <Input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} className="bg-muted/30 border-white/10" />
          <Input type="number" placeholder="Total pages" value={pages} onChange={e => setPages(e.target.value)} className="bg-muted/30 border-white/10" />

          {/* Status */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
            <div className="flex gap-2">
              {(["to-read", "reading", "finished"] as BookStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${status === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  {s === "to-read" ? "To Read" : s === "reading" ? "Reading" : "Finished"}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Format</label>
            <div className="flex gap-2 flex-wrap">
              {(["owned", "borrowed", "ebook", "audiobook"] as BookFormat[]).map(f => (
                <button key={f} onClick={() => setFormat(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${format === f ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Pillars */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Pillars</label>
            <div className="flex flex-wrap gap-1.5">
              {PILLARS.map(p => (
                <button key={p.id} onClick={() => togglePillar(p.id)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${pillars.includes(p.id) ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  {p.icon} {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Tags</label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-xs font-medium">
                    {tag}<button onClick={() => removeTag(tag)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <Input value={customTag} onChange={e => setCustomTag(e.target.value)} onKeyDown={handleCustomTagKey} placeholder="Type custom tag + Enter" className="bg-muted/30 border-white/10 text-sm mb-2" />
            <div className="flex flex-wrap gap-1.5">
              {DIRECTION_TAGS.filter(t => !tags.includes(t)).slice(0, 8).map(t => (
                <button key={t} onClick={() => addTag(t)} className="px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground text-xs hover:text-foreground hover:bg-muted/50 transition-all">+ {t}</button>
              ))}
            </div>
          </div>

          {/* Cover Color */}
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Cover Color</label>
            <div className="flex gap-2 flex-wrap">
              {COVER_COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-white scale-110" : "hover:scale-105"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <button onClick={handleSubmit} disabled={!title.trim()} className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-40">
            Add Book
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
