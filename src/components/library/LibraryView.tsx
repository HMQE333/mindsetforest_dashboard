import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Sparkles, Filter, Tag, LayoutGrid, List } from "lucide-react";
import { useLibraryState } from "@/hooks/useLibraryState";
import { BookStatus, STATUS_LABELS, BookFormat, FORMAT_LABELS } from "@/lib/library-data";
import BookCard from "./BookCard";
import AddBookModal from "./AddBookModal";
import BookDetailModal from "./BookDetailModal";
import AISuggestModal from "./AISuggestModal";
import type { Book } from "@/lib/library-data";

export default function LibraryView() {
  const { books, loading, addBook, updateBook, deleteBook } = useLibraryState();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookStatus | "all">("all");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<BookFormat | null>(null);
  const [viewMode, setViewMode] = useState<"block" | "list">("block");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => (b.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [books]);

  const filtered = useMemo(() => {
    return books.filter(b => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (ratingFilter && (b.rating || 0) < ratingFilter) return false;
      if (tagFilter && !(b.tags || []).includes(tagFilter)) return false;
      if (formatFilter && (b.format || "owned") !== formatFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [books, statusFilter, ratingFilter, tagFilter, formatFilter, search]);

  const counts = useMemo(() => ({
    all: books.length,
    "to-read": books.filter(b => b.status === "to-read").length,
    reading: books.filter(b => b.status === "reading").length,
    finished: books.filter(b => b.status === "finished").length,
  }), [books]);

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading library...</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-foreground">📚 Library</h2>
        <div className="flex gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button
              onClick={() => setViewMode("block")}
              className={`p-2 transition-all ${viewMode === "block" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="Block view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-all ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {books.length >= 2 && (
            <button onClick={() => setSuggestOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl glass-card text-sm font-semibold text-muted-foreground hover:text-foreground transition-all border border-white/5 hover:border-white/15">
              <Sparkles className="w-4 h-4" /> AI Suggest
            </button>
          )}
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90 transition-all">
            <Plus className="w-4 h-4" /> Add Book
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title or author..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted/30 border border-white/5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>

        <div className="flex gap-1.5">
          {(["all", "to-read", "reading", "finished"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? `All (${counts.all})` : `${STATUS_LABELS[s]} (${counts[s]})`}
            </button>
          ))}
        </div>

        {/* Rating filter */}
        <button
          onClick={() => setRatingFilter(ratingFilter ? null : 4)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            ratingFilter ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="w-3 h-3" /> {ratingFilter ? `★${ratingFilter}+` : "Rating"}
        </button>

        {/* Format filter */}
        <div className="flex gap-1">
          {(["owned", "borrowed", "ebook", "audiobook"] as BookFormat[]).map(f => (
            <button
              key={f}
              onClick={() => setFormatFilter(formatFilter === f ? null : f)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                formatFilter === f ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Tag className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
          {allTags.map(t => (
            <button
              key={t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                tagFilter === t ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Books */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">📖</p>
          <p className="text-muted-foreground text-sm">
            {books.length === 0 ? "Your bookshelf is empty. Add your first book!" : "No books match your filters."}
          </p>
        </div>
      ) : viewMode === "block" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((book, i) => (
            <BookCard key={book.id} book={book} index={i} onClick={() => setSelectedBook(book)} view="block" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((book, i) => (
            <BookCard key={book.id} book={book} index={i} onClick={() => setSelectedBook(book)} view="list" />
          ))}
        </div>
      )}

      <AddBookModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addBook} />
      <BookDetailModal book={selectedBook} open={!!selectedBook} onClose={() => setSelectedBook(null)} onUpdate={updateBook} onDelete={deleteBook} />
      <AISuggestModal open={suggestOpen} onClose={() => setSuggestOpen(false)} books={books} />
    </motion.div>
  );
}
