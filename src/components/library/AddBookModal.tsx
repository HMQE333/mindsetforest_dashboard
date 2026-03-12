import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { COVER_COLORS } from "@/lib/library-data";
import type { BookStatus } from "@/lib/library-data";

interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (book: { title: string; author: string; total_pages: number; status: BookStatus; cover_color: string }) => void;
}

export default function AddBookModal({ open, onClose, onAdd }: AddBookModalProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [pages, setPages] = useState("");
  const [status, setStatus] = useState<BookStatus>("to-read");
  const [color, setColor] = useState(COVER_COLORS[0]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), author: author.trim(), total_pages: parseInt(pages) || 0, status, cover_color: color });
    setTitle(""); setAuthor(""); setPages(""); setStatus("to-read"); setColor(COVER_COLORS[0]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">📖 Add Book</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Title *" value={title} onChange={e => setTitle(e.target.value)} className="bg-muted/30 border-white/10" />
          <Input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} className="bg-muted/30 border-white/10" />
          <Input type="number" placeholder="Total pages" value={pages} onChange={e => setPages(e.target.value)} className="bg-muted/30 border-white/10" />

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Status</label>
            <div className="flex gap-2">
              {(["to-read", "reading", "finished"] as BookStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    status === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "to-read" ? "To Read" : s === "reading" ? "Reading" : "Finished"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block">Cover Color</label>
            <div className="flex gap-2 flex-wrap">
              {COVER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${color === c ? "ring-2 ring-white scale-110" : "hover:scale-105"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-40"
          >
            Add Book
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
