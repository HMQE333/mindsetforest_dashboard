import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Book } from "@/lib/library-data";
import type { ReadingSpeed } from "@/lib/reading-speed";
import type { BookReading } from "@/lib/reading-sessions";
import ReadingStatsPanel from "./ReadingStatsPanel";

interface BookFinishedModalProps {
  book: Book | null;
  /** "ask": the reader reached the last page, confirm first. "done": celebrate. */
  mode: "ask" | "done";
  reading?: BookReading;
  usualSpeed?: ReadingSpeed;
  /** How many books are on the finished shelf, this one included. */
  finishedCount: number;
  onConfirm: () => void;
  onRate: (rating: number) => void;
  onClose: () => void;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function burst(color: string) {
  const colors = [color, "#FACC15", "#F472B6", "#60A5FA", "#34D399"];
  const base = { disableForReducedMotion: true, colors, zIndex: 200 };
  void confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 45, origin: { x: 0.2, y: 0.7 }, angle: 60 });
  void confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 45, origin: { x: 0.8, y: 0.7 }, angle: 120 });
  setTimeout(() => void confetti({ ...base, particleCount: 60, spread: 110, startVelocity: 30, origin: { x: 0.5, y: 0.35 } }), 350);
}

/**
 * The end of a book. From the reader it first asks whether the book is
 * really finished; then (or straight away when the status was set by hand)
 * confetti and a summary. Speed and time appear only when the reader
 * measured them; otherwise the summary is the dates and the page count.
 */
export default function BookFinishedModal({
  book, mode, reading, usualSpeed, finishedCount, onConfirm, onRate, onClose,
}: BookFinishedModalProps) {
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (!book || mode !== "done" || fired.current === book.id) return;
    fired.current = book.id;
    burst(book.cover_color);
  }, [book, mode]);

  if (!book) return null;

  const added = book.created_at;
  const finishedAt = book.finished_at || null;
  const days = finishedAt ? Math.max(1, Math.round((Date.parse(finishedAt) - Date.parse(added)) / 86_400_000)) : null;
  const pages = book.total_pages || book.file?.pages || 0;
  const facts = [
    { label: "Added", value: day(added) },
    finishedAt ? { label: "Finished", value: day(finishedAt) } : null,
    days ? { label: "Took", value: `${days} ${days === 1 ? "day" : "days"}` } : null,
    pages ? { label: "Pages", value: pages.toLocaleString() } : null,
  ].filter((f): f is { label: string; value: string } => !!f);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="glass-card border-white/10 max-w-md max-h-[90vh] overflow-y-auto">
        {mode === "ask" ? (
          <div className="text-center space-y-4 py-2">
            <p className="text-4xl">🏁</p>
            <DialogTitle className="text-lg text-foreground">You reached the last page</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Finished <span className="text-foreground font-medium">{book.title}</span>?
            </DialogDescription>
            <div className="flex gap-2 justify-center">
              <button onClick={onConfirm} className="px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90">
                Yes, I finished it 🎉
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-muted/30 text-muted-foreground text-sm font-semibold hover:text-foreground">
                Not yet
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center space-y-1 pt-1">
              <p className="text-5xl">🎉</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Book finished · #{finishedCount} on your shelf</p>
              <DialogTitle className="text-xl text-foreground leading-tight">{book.title}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">{book.author || " "}</DialogDescription>
            </div>

            <div className={`grid gap-2 ${facts.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : facts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {facts.map((f) => (
                <div key={f.label} className="rounded-xl bg-muted/25 border border-white/5 px-3 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">{f.label}</p>
                  <p className="text-sm font-semibold text-foreground">{f.value}</p>
                </div>
              ))}
            </div>

            <ReadingStatsPanel book={book} reading={reading} usualSpeed={usualSpeed} finished />

            <div className="text-center space-y-1.5">
              <p className="text-xs text-muted-foreground">How was it?</p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} onClick={() => onRate(s)} aria-label={`${s} star${s > 1 ? "s" : ""}`}>
                    <Star className={`w-7 h-7 transition-all ${s <= (book.rating || 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-400/60"}`} />
                  </button>
                ))}
              </div>
            </div>

            <button onClick={onClose} className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90">
              Done
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
