import { motion } from "framer-motion";
import { Book, STATUS_LABELS } from "@/lib/library-data";
import { Star } from "lucide-react";

interface BookCardProps {
  book: Book;
  index: number;
  onClick: () => void;
}

export default function BookCard({ book, index, onClick }: BookCardProps) {
  const progress = book.total_pages > 0 ? Math.round((book.pages_read / book.total_pages) * 100) : 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="w-full text-left group"
    >
      <div className="relative glass-card rounded-2xl overflow-hidden border border-white/5 hover:border-white/15 transition-all hover:-translate-y-1 hover:shadow-lg">
        {/* Color spine */}
        <div className="absolute left-0 top-0 bottom-0 w-2 rounded-l-2xl" style={{ backgroundColor: book.cover_color }} />

        <div className="pl-5 pr-4 py-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-bold text-sm text-foreground leading-tight line-clamp-2">{book.title}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground whitespace-nowrap shrink-0">
              {STATUS_LABELS[book.status].split(" ")[0]}
            </span>
          </div>

          {book.author && (
            <p className="text-xs text-muted-foreground mb-2 truncate">{book.author}</p>
          )}

          {/* Rating */}
          {book.rating && (
            <div className="flex gap-0.5 mb-2">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} className={`w-3 h-3 ${s <= book.rating! ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
              ))}
            </div>
          )}

          {/* Tags */}
          {book.tags && book.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {book.tags.slice(0, 3).map(tag => (
                <span key={tag} className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">{tag}</span>
              ))}
              {book.tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{book.tags.length - 3}</span>}
            </div>
          )}

          {/* Progress */}
          {book.total_pages > 0 && (
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>{book.pages_read}/{book.total_pages} pages</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, backgroundColor: book.cover_color }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
