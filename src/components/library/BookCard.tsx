import { motion } from "framer-motion";
import { Book, STATUS_LABELS, FORMAT_LABELS } from "@/lib/library-data";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { Star, Link2 } from "lucide-react";

interface BookCardProps {
  book: Book;
  index: number;
  onClick: () => void;
  view: "block" | "list";
}

export default function BookCard({ book, index, onClick, view }: BookCardProps) {
  const allPillars = usePillars();
  const progress = book.total_pages > 0 ? Math.round((book.pages_read / book.total_pages) * 100) : 0;
  const bookPillars = allPillars.filter(p => (book.pillars || []).includes(p.id));
  const formatLabel = FORMAT_LABELS[book.format || "owned"];
  const hasUrl = !!book.url?.trim();
  const handleLinkClick = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); window.open(book.url, "_blank", "noopener,noreferrer"); };

  if (view === "list") {
    return (
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.02 }}
        onClick={onClick}
        className="w-full text-left"
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl glass-card border border-white/5 hover:border-white/15 transition-all">
          <div className="w-1.5 h-10 rounded-full shrink-0" style={{ backgroundColor: book.cover_color }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-foreground truncate">{book.title}</h3>
            <p className="text-xs text-muted-foreground truncate">{book.author || "—"}</p>
          </div>
          {hasUrl && (
            <span onClick={handleLinkClick} role="button" title={book.url} className="shrink-0 p-1 rounded-md bg-muted/30 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all cursor-pointer">
              <Link2 className="w-3.5 h-3.5" />
            </span>
          )}
          {book.rating && (
            <div className="flex gap-0.5 shrink-0">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`w-3 h-3 ${s <= book.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
              ))}
            </div>
          )}
          <span className="text-[10px] text-muted-foreground shrink-0">{formatLabel.split(" ")[0]}</span>
          {book.total_pages > 0 && (
            <div className="w-16 shrink-0">
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: book.cover_color }} />
              </div>
              <p className="text-[9px] text-muted-foreground text-right mt-0.5">{progress}%</p>
            </div>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground shrink-0">
            {STATUS_LABELS[book.status].split(" ")[0]}
          </span>
          {bookPillars.length > 0 && (
            <div className="flex gap-0.5 shrink-0">
              {bookPillars.slice(0, 3).map(p => (
                <span key={p.id} title={p.name}>
                  <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={16} className="inline-block" />
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.button>
    );
  }

  // Block view (default card)
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="w-full text-left group"
    >
      <div className="relative glass-card rounded-2xl overflow-hidden border border-white/5 hover:border-white/15 transition-all hover:-translate-y-1 hover:shadow-lg">
        <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l-2xl" style={{ backgroundColor: book.cover_color }} />
        <div className="pl-5 pr-4 py-4 flex gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-2">{book.title}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground whitespace-nowrap shrink-0">
                {STATUS_LABELS[book.status].split(" ")[0]}
              </span>
            </div>
            {book.author && <p className="text-xs text-muted-foreground mb-1 truncate">{book.author}</p>}

            <div className="flex items-center gap-2 mb-2">
              {book.rating && (
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`w-3 h-3 ${s <= book.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                  ))}
                </div>
              )}
              <span className="text-[10px] text-muted-foreground">{formatLabel}</span>
            </div>

            {book.tags && book.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {book.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{tag}</span>
                ))}
                {book.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{book.tags.length - 3}</span>}
              </div>
            )}

            {book.total_pages > 0 && (
              <div>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{book.pages_read}/{book.total_pages} pages</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: book.cover_color }} />
                </div>
              </div>
            )}
          </div>

          {bookPillars.length > 0 && (
            <div className="flex flex-col gap-1 shrink-0 items-end">
              {bookPillars.map(p => (
                <span key={p.id} title={p.name}>
                  <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={20} className="inline-block" />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
