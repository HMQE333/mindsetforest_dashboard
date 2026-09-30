import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Book, STATUS_LABELS, BookStatus, TAG_SUGGESTIONS, FORMAT_LABELS, BookFormat, formatFileSize, isScan } from "@/lib/library-data";
import { uploadLabel, type UploadStage } from "@/lib/book-files";
import type { BookReading } from "@/lib/reading-sessions";
import type { ReadingSpeed } from "@/lib/reading-speed";
import ReadingStatsPanel from "./ReadingStatsPanel";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { Star, Trash2, Sparkles, Loader2, X, FileText, Upload, BookOpen } from "lucide-react";
import TagLibraryPopover from "@/components/shared/TagLibraryPopover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { safeUrl } from "@/lib/safe-url";

interface BookDetailModalProps {
  book: Book | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Book>) => void;
  onDelete: (id: string) => void;
  uploading?: UploadStage;
  onAttachFile: (file: File) => void;
  onRemoveFile: () => void;
  onRead: () => void;
  /** What the reader measured for this book, if anything. */
  reading?: BookReading;
  usualSpeed?: ReadingSpeed;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function BookDetailModal({ book, open, onClose, onUpdate, onDelete, uploading, onAttachFile, onRemoveFile, onRead, reading, usualSpeed }: BookDetailModalProps) {
  const allPillars = usePillars();
  const [notes, setNotes] = useState("");
  const [pagesRead, setPagesRead] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [status, setStatus] = useState<BookStatus>("to-read");
  const [tags, setTags] = useState<string[]>([]);
  const [pillars, setPillars] = useState<string[]>([]);
  const [format, setFormat] = useState<BookFormat>("owned");
  const [customTag, setCustomTag] = useState("");
  const [url, setUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  // Deleting is permanent (the PDF, its text and the reading history go too), so it takes two taps.
  const [armed, setArmed] = useState<"book" | "pdf" | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (book) {
      setNotes(book.notes);
      setPagesRead(String(book.pages_read));
      setRating(book.rating);
      setStatus(book.status);
      setTags(book.tags || []);
      setPillars(book.pillars || []);
      setFormat((book.format as BookFormat) || "owned");
      setUrl(book.url || "");
      setAiAnswer(""); setQuestion(""); setCustomTag(""); setArmed(null);
    }
    // Only when a different book opens: a PDF finishing in the background must not wipe unsaved edits.
  }, [book?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!book) return null;

  const addTag = (tag: string) => { const t = tag.trim(); if (t && !tags.includes(t)) setTags(prev => [...prev, t]); };
  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));
  const handleCustomTagKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && customTag.trim()) { e.preventDefault(); addTag(customTag); setCustomTag(""); } };
  const togglePillar = (id: string) => setPillars(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleSave = () => {
    // The parent reports success or failure (and may open the finish screen).
    onUpdate(book.id, { notes, pages_read: parseInt(pagesRead) || 0, rating, status, tags, pillars, format, url: url.trim() });
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

  const pickFile = (f: File | undefined) => { if (f) onAttachFile(f); };
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; if (!dropOver) setDropOver(true); },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropOver(false); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDropOver(false); pickFile(e.dataTransfer.files[0]); },
  };
  const file = book.file;

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
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                Added {shortDate(book.created_at)}
                {book.finished_at && <> · Finished {shortDate(book.finished_at)}</>}
              </p>
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

          {/* PDF */}
          <div {...dropHandlers}>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            {uploading ? (
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-3 text-xs text-primary font-medium">
                <Loader2 className="w-4 h-4 animate-spin" /> {uploadLabel(uploading)}
                {uploading.stage === "text" && (
                  <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden ml-1">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((uploading.done / Math.max(1, uploading.total)) * 100)}%` }} />
                  </div>
                )}
              </div>
            ) : file ? (
              <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${dropOver ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-white/10 bg-muted/20"}`}>
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate" title={file.name}>{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {file.pages} pages · {formatFileSize(file.size)} · {isScan(file) ? "scan, no text" : "text ✓"}
                    {file.lastPage > 1 && <> · stopped at p. {file.lastPage}</>}
                  </p>
                </div>
                <button onClick={onRead} className="flex items-center gap-1 px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold shrink-0 hover:opacity-90">
                  <BookOpen className="w-3.5 h-3.5" /> {file.lastPage > 1 ? "Continue" : "Read"}
                </button>
                <button onClick={() => fileInput.current?.click()} title="Replace the PDF" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 shrink-0"><Upload className="w-3.5 h-3.5" /></button>
                {armed === "pdf" ? (
                  <button onClick={() => { setArmed(null); onRemoveFile(); }} className="px-2 py-1 rounded-lg bg-destructive/15 text-destructive text-[11px] font-semibold shrink-0">Remove?</button>
                ) : (
                  <button onClick={() => setArmed("pdf")} title="Remove the PDF" className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                className={`w-full flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs transition-all ${dropOver ? "border-primary bg-primary/10 text-primary" : "border-white/15 text-muted-foreground hover:text-foreground hover:border-white/30"}`}
              >
                <FileText className="w-4 h-4" /> Drop the book's PDF here, or click to choose
              </button>
            )}
          </div>

          {reading && reading.pages > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">Reading</label>
              <ReadingStatsPanel book={book} reading={reading} usualSpeed={usualSpeed} finished={book.status === "finished"} />
            </div>
          )}

          {/* URL */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Link (optional)</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://… (Goodreads, PDF, notes)" className="bg-muted/30 border-white/10 text-sm" />
            {url.trim() && (
              <a href={safeUrl(url) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Open link
              </a>
            )}
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
              {allPillars.map(p => (
                <button key={p.id} onClick={() => togglePillar(p.id)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${pillars.includes(p.id) ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                  <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={14} className="inline-block" /> {p.name}
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
              {TAG_SUGGESTIONS.filter(t => !tags.includes(t)).slice(0, 6).map(t => (
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
            <button
              onClick={() => { if (armed !== "book") { setArmed("book"); return; } setArmed(null); onDelete(book.id); onClose(); }}
              title={armed === "book" ? "Tap again to delete the book, its PDF and reading history" : "Delete book"}
              className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 text-sm font-semibold ${armed === "book" ? "bg-destructive text-destructive-foreground" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}
            >
              {armed === "book" && "Delete?"}
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
