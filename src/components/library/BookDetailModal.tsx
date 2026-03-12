import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Book, STATUS_LABELS, BookStatus, DIRECTION_TAGS, FORMAT_LABELS, BookFormat } from "@/lib/library-data";
import { PILLARS } from "@/lib/archive-data";
import { Star, Trash2, Sparkles, Loader2, X } from "lucide-react";
import TagLibraryPopover from "@/components/shared/TagLibraryPopover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BookDetailModalProps {
  book: Book | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Book>) => void;
  onDelete: (id: string) => void;
}

export default function BookDetailModal({ book, open, onClose, onUpdate, onDelete }: BookDetailModalProps) {
  const [notes, setNotes] = useState("");
  const [pagesRead, setPagesRead] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [status, setStatus] = useState<BookStatus>("to-read");
  const [tags, setTags] = useState<string[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [format, setFormat] = useState<BookFormat>("owned");
  const [customTag, setCustomTag] = useState("");
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (book) {
      setNotes(book.notes);
      setPagesRead(String(book.pages_read));
      setRating(book.rating);
      setStatus(book.status);
      setTags(book.tags || []);
      setPillars(book.pillars || []);
      setFormat((book.format as BookFormat) || "owned");
      setAiAnswer(""); setQuestion(""); setCustomTag("");
    }
  }, [book]);

  if (!book) return null;

  const addTag = (tag: string) => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(prev => [...prev, t]); };
  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));
  const handleCustomTagKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && customTag.trim()) { e.preventDefault(); addTag(customTag); setCustomTag(""); } };
  const togglePillar = (id: string) => setPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleSave = () => {
    onUpdate(book.id, { notes, pages_read: parseInt(pagesRead) || 0, rating, status, tags, pillars, format });
    toast.success("Book updated");
  };

  const handleAskAI = async () => {
    if (!question.trim()) return;
    setAiLoading(true); setAiAnswer("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-book-suggest", {
        body: { mode: "qa", bookTitle: book.title, bookAuthor: book.author, question: question.trim() },
      });
      if (error) throw error;
      setAiAnswer(data?.answer || "No answer received.");
    } catch { toast.error("AI request failed"); } finally { setAiLoading(false); }
  };

  const progress = book.total_pages > 0 ? Math.round(((parseInt(pagesRead) || 0) / book.total_pages) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="glass-card border-white/10 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="w-3 h-12 rounded-full shrink-0" style={{ backgroundColor: book.cover_color }} />
            <div className="min-w-0">
              <DialogTitle className="text-foreground text-lg leading-tight">{book.title}</DialogTitle>
              {book.author && <p className="text-sm text-muted-foreground mt-0.5">{book.author}</p>}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Status */}
          <div className="flex gap-2">
            {(["to-read", "reading", "finished"] as BookStatus[]).map(s => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${status === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground"}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Format */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Format</label>
            <div className="flex gap-2 flex-wrap">
              {(["owned", "borrowed", "ebook", "audiobook"] as BookFormat[]).map(f => (
                <button key={f} onClick={() => setFormat(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${format === f ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground"}`}>
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setRating(rating === s ? null : s)}>
                  <Star className={`w-5 h-5 transition-all ${s <= (rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-400/50"}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Pages */}
          {book.total_pages > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Pages read / {book.total_pages}</label>
              <Input type="number" value={pagesRead} onChange={e => setPagesRead(e.target.value)} max={book.total_pages} className="bg-muted/30 border-white/10 w-32" />
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden mt-2">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: book.cover_color }} />
              </div>
            </div>
          )}

          {/* Pillars */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pillars</label>
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
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs text-muted-foreground">Tags</label>
              <TagLibraryPopover module="library" currentTags={tags} onAddTag={addTag} />
            </div>
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
              {DIRECTION_TAGS.filter(t => !tags.includes(t)).slice(0, 6).map(t => (
                <button key={t} onClick={() => addTag(t)} className="px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground text-xs hover:text-foreground hover:bg-muted/50 transition-all">+ {t}</button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Your thoughts about this book..." className="bg-muted/30 border-white/10 min-h-[100px]" />
          </div>

          {/* AI Q&A */}
          <div className="border border-white/5 rounded-xl p-3 space-y-2">
            <label className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="w-3 h-3" /> Ask AI about this book</label>
            <div className="flex gap-2">
              <Input value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. What are the key themes?" className="bg-muted/30 border-white/10 text-sm" onKeyDown={e => e.key === "Enter" && handleAskAI()} />
              <button onClick={handleAskAI} disabled={aiLoading || !question.trim()} className="px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold shrink-0 disabled:opacity-40">
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
              </button>
            </div>
            {aiAnswer && <p className="text-xs text-foreground/80 bg-muted/30 rounded-lg p-2 whitespace-pre-wrap">{aiAnswer}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all">Save Changes</button>
            <button onClick={() => { onDelete(book.id); onClose(); }} className="px-4 py-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
