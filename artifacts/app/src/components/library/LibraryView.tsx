import { useState, useMemo, useRef, useEffect, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Sparkles, Filter, Tag, LayoutGrid, List, Link2 } from "lucide-react";
import { useLibraryState } from "@/hooks/useLibraryState";
import { useCoursesState } from "@/hooks/useCoursesState";
import { BookStatus, STATUS_LABELS, BookFormat, FORMAT_LABELS } from "@/lib/library-data";
import { CourseStatus, COURSE_STATUS_LABELS } from "@/lib/course-data";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import BookCard from "./BookCard";
import AddBookModal from "./AddBookModal";
import BookDetailModal from "./BookDetailModal";
import AISuggestModal from "./AISuggestModal";
import CourseCard from "./CourseCard";
import AddCourseModal from "./AddCourseModal";
import CourseDetailModal from "./CourseDetailModal";
import ShareLibraryModal from "./ShareLibraryModal";
import BookFinishedModal from "./BookFinishedModal";
import { useReadingStats } from "@/hooks/useReadingStats";
import { speedOf } from "@/lib/reading-speed";
import type { Book } from "@/lib/library-data";
import type { Course } from "@/lib/course-data";
import { toast } from "sonner";

// pdf.js only loads once a book is opened for reading.
const BookReader = lazy(() => import("./BookReader"));

const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

type LibraryTab = "books" | "courses";

export default function LibraryView() {
  const {
    books, loading: booksLoading, addBook, updateBook, deleteBook,
    uploads, attachFile, detachFile, saveReadingPosition, patchFile,
  } = useLibraryState();
  const reading = useReadingStats();
  const usualSpeed = useMemo(() => speedOf(reading.overall), [reading.overall]);
  const { courses, loading: coursesLoading, addCourse, updateCourse, deleteCourse } = useCoursesState();
  const allPillars = usePillars();

  const [tab, setTab] = useState<LibraryTab>("books");
  const [addBookOpen, setAddBookOpen] = useState(false);
  const [addCourseOpen, setAddCourseOpen] = useState(false);
  // Held by id so the open book picks up changes (a PDF finishing, a saved position).
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const selectedBook = useMemo(() => books.find(b => b.id === selectedBookId) ?? null, [books, selectedBookId]);
  const readingBook = useMemo(() => books.find(b => b.id === readingId) ?? null, [books, readingId]);
  // The end-of-book screen: "ask" after the reader's last page, "done" to celebrate.
  const [celebrate, setCelebrate] = useState<{ id: string; mode: "ask" | "done" } | null>(null);
  const celebrateBook = useMemo(() => books.find(b => b.id === celebrate?.id) ?? null, [books, celebrate]);
  const finishedCount = useMemo(() => books.filter(b => b.status === "finished").length, [books]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<BookStatus | "all">("all");
  const [courseStatusFilter, setCourseStatusFilter] = useState<CourseStatus | "all">("all");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<BookFormat | null>(null);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"block" | "list">("block");

  const allTags = useMemo(() => {
    const set = new Set<string>();
    if (tab === "books") books.forEach(b => (b.tags || []).forEach(t => set.add(t)));
    else courses.forEach(c => (c.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [books, courses, tab]);

  const filteredBooks = useMemo(() => {
    return books.filter(b => {
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (ratingFilter && (b.rating || 0) < ratingFilter) return false;
      if (tagFilter && !(b.tags || []).includes(tagFilter)) return false;
      if (formatFilter && (b.format || "owned") !== formatFilter) return false;
      if (pillarFilter && !(b.pillars || []).includes(pillarFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [books, statusFilter, ratingFilter, tagFilter, formatFilter, pillarFilter, search]);

  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      if (courseStatusFilter !== "all" && c.status !== courseStatusFilter) return false;
      if (ratingFilter && (c.rating || 0) < ratingFilter) return false;
      if (tagFilter && !(c.tags || []).includes(tagFilter)) return false;
      if (pillarFilter && !(c.pillars || []).includes(pillarFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.title.toLowerCase().includes(q) && !c.platform.toLowerCase().includes(q) && !c.instructor.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [courses, courseStatusFilter, ratingFilter, tagFilter, pillarFilter, search]);

  const bookCounts = useMemo(() => ({
    all: books.length,
    "to-read": books.filter(b => b.status === "to-read").length,
    reading: books.filter(b => b.status === "reading").length,
    finished: books.filter(b => b.status === "finished").length,
  }), [books]);

  const courseCounts = useMemo(() => ({
    all: courses.length,
    "to-start": courses.filter(c => c.status === "to-start").length,
    "in-progress": courses.filter(c => c.status === "in-progress").length,
    completed: courses.filter(c => c.status === "completed").length,
  }), [courses]);

  const loading = tab === "books" ? booksLoading : coursesLoading;

  // A drop anywhere (a card stops its own drop from bubbling) ends the drag hint.
  useEffect(() => {
    const reset = () => { dragDepth.current = 0; setDragging(false); };
    window.addEventListener("drop", reset, true);
    window.addEventListener("dragend", reset, true);
    return () => {
      window.removeEventListener("drop", reset, true);
      window.removeEventListener("dragend", reset, true);
    };
  }, []);

  const otherDialogOpen = addBookOpen || addCourseOpen || suggestOpen || shareOpen || !!selectedCourse || !!celebrate;

  /** Saving a book as finished (it was not before) ends on the celebration. */
  const handleUpdate = async (id: string, updates: Partial<Book>) => {
    const wasFinished = books.find(b => b.id === id)?.status === "finished";
    await updateBook(id, updates);
    if (updates.status === "finished" && !wasFinished) {
      setSelectedBookId(null);
      setCelebrate({ id, mode: "done" });
    }
  };

  const closeReader = (id: string, reachedEnd: boolean) => {
    setReadingId(null);
    const book = books.find(b => b.id === id);
    if (reachedEnd && book && book.status !== "finished") setCelebrate({ id, mode: "ask" });
  };

  const confirmFinished = async () => {
    const book = celebrateBook;
    if (!book) return;
    await updateBook(book.id, { status: "finished", pages_read: book.total_pages || book.pages_read });
    setCelebrate({ id: book.id, mode: "done" });
  };
  const openReader = (id: string) => { setSelectedBookId(null); setReadingId(id); };

  /**
   * A file dropped off any card. A PDF only ever attaches to the book it was
   * dropped on (or the one open in its window), never to a guess.
   */
  const handleDrop = (list: FileList) => {
    const pdf = Array.from(list).find(isPdf);
    if (!pdf) { toast.error("Only PDF files can be attached to books"); return; }
    if (readingId || otherDialogOpen) return;
    if (selectedBook) { void attachFile(selectedBook.id, pdf); return; }
    toast.info("Drop the PDF onto the book's tile to attach it");
  };

  const dropZoneProps = tab === "books" ? {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; dragDepth.current++; setDragging(true); },
    onDragLeave: (e: React.DragEvent) => {
      if (!hasFiles(e) || dragDepth.current === 0) return;
      dragDepth.current--;
      if (dragDepth.current === 0) setDragging(false);
    },
    // Accepting the drop everywhere also stops the browser from navigating away to the file.
    onDragOver: (e: React.DragEvent) => { if (hasFiles(e)) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      handleDrop(e.dataTransfer.files);
    },
  } : {};

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">Loading library...</div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 min-h-[60vh]" {...dropZoneProps}>
      {dragging && !selectedBook && !readingBook && !otherDialogOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-32px)] px-4 py-2.5 rounded-2xl glass-card border border-primary/40 text-sm text-foreground shadow-lg pointer-events-none text-center">
          📄 Drop the PDF onto the book's tile
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-foreground">📚 Library</h2>
          {tab === "books" && usualSpeed.pagesPerHour && (
            <span
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/30 text-xs text-muted-foreground"
              title={`Average reading speed, measured in the reader over ${reading.overall.pages} pages`}
            >
              ⏱ {Math.round(usualSpeed.pagesPerHour)} pages/h
              {usualSpeed.wordsPerMinute ? ` · ${Math.round(usualSpeed.wordsPerMinute)} wpm` : ""}
            </span>
          )}
          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button
              onClick={() => { setTab("books"); setTagFilter(null); setPillarFilter(null); }}
              className={`px-4 py-1.5 text-sm font-semibold transition-all ${tab === "books" ? "gradient-purple text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              📖 Books ({books.length})
            </button>
            <button
              onClick={() => { setTab("courses"); setTagFilter(null); setPillarFilter(null); }}
              className={`px-4 py-1.5 text-sm font-semibold transition-all ${tab === "courses" ? "gradient-purple text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              🎓 Courses ({courses.length})
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button onClick={() => setViewMode("block")} className={`p-2 transition-all ${viewMode === "block" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`} title="Block view">
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-2 transition-all ${viewMode === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`} title="List view">
              <List className="w-4 h-4" />
            </button>
          </div>

          {tab === "books" && books.length >= 2 && (
            <button onClick={() => setSuggestOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl glass-card text-sm font-semibold text-muted-foreground hover:text-foreground transition-all border border-white/5 hover:border-white/15">
              <Sparkles className="w-4 h-4" /> AI Suggest
            </button>
          )}
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl glass-card text-sm font-semibold text-muted-foreground hover:text-foreground transition-all border border-white/5 hover:border-white/15"
            title="Share a public link of this view"
          >
            <Link2 className="w-4 h-4" /> Share
          </button>
          <button
            onClick={() => tab === "books" ? setAddBookOpen(true) : setAddCourseOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" /> {tab === "books" ? "Add Book" : "Add Course"}
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
            placeholder={tab === "books" ? "Search title or author..." : "Search title, platform, or instructor..."}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted/30 border border-white/5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>

        {/* Status filters */}
        {tab === "books" ? (
          <div className="flex gap-1.5">
            {(["all", "to-read", "reading", "finished"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? `All (${bookCounts.all})` : `${STATUS_LABELS[s]} (${bookCounts[s]})`}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5">
            {(["all", "to-start", "in-progress", "completed"] as const).map(s => (
              <button key={s} onClick={() => setCourseStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${courseStatusFilter === s ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                {s === "all" ? `All (${courseCounts.all})` : `${COURSE_STATUS_LABELS[s]} (${courseCounts[s]})`}
              </button>
            ))}
          </div>
        )}

        {/* Rating filter */}
        <button
          onClick={() => setRatingFilter(ratingFilter ? null : 4)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${ratingFilter ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}
        >
          <Filter className="w-3 h-3" /> {ratingFilter ? `★${ratingFilter}+` : "Rating"}
        </button>

        {/* Pillar dropdown */}
        <div className="relative">
          <select
            value={pillarFilter || ""}
            onChange={e => setPillarFilter(e.target.value || null)}
            className={`appearance-none pl-3 pr-7 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border-0 outline-none ${
              pillarFilter ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            <option value="">All Pillars</option>
            {allPillars.map(p => (
              <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[8px]">▼</div>
        </div>

        {/* Format filter (books only) */}
        {tab === "books" && (
          <div className="flex gap-1">
            {(["owned", "borrowed", "ebook", "audiobook"] as BookFormat[]).map(f => (
              <button key={f} onClick={() => setFormatFilter(formatFilter === f ? null : f)} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${formatFilter === f ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Tag className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
          {allTags.map(t => (
            <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${tagFilter === t ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {tab === "books" ? (
        <>
          {filteredBooks.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">📖</p>
              <p className="text-muted-foreground text-sm">
                {books.length === 0 ? "Your bookshelf is empty. Add your first book!" : "No books match your filters."}
              </p>
            </div>
          ) : viewMode === "block" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredBooks.map((book, i) => (
                <BookCard key={book.id} book={book} index={i} onClick={() => setSelectedBookId(book.id)} view="block" onDropFile={f => void attachFile(book.id, f)} onRead={() => openReader(book.id)} uploading={uploads[book.id]} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBooks.map((book, i) => (
                <BookCard key={book.id} book={book} index={i} onClick={() => setSelectedBookId(book.id)} view="list" onDropFile={f => void attachFile(book.id, f)} onRead={() => openReader(book.id)} uploading={uploads[book.id]} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {filteredCourses.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🎓</p>
              <p className="text-muted-foreground text-sm">
                {courses.length === 0 ? "No courses yet. Add your first course!" : "No courses match your filters."}
              </p>
            </div>
          ) : viewMode === "block" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCourses.map((course, i) => (
                <CourseCard key={course.id} course={course} index={i} onClick={() => setSelectedCourse(course)} view="block" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCourses.map((course, i) => (
                <CourseCard key={course.id} course={course} index={i} onClick={() => setSelectedCourse(course)} view="list" />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <AddBookModal open={addBookOpen} onClose={() => setAddBookOpen(false)} onAdd={addBook} />
      <BookDetailModal
        book={selectedBook}
        open={!!selectedBook}
        onClose={() => setSelectedBookId(null)}
        onUpdate={(id, updates) => void handleUpdate(id, updates)}
        onDelete={deleteBook}
        reading={selectedBook ? reading.byBook[selectedBook.id] : undefined}
        usualSpeed={usualSpeed}
        uploading={selectedBook ? uploads[selectedBook.id] : undefined}
        onAttachFile={f => selectedBook && void attachFile(selectedBook.id, f)}
        onRemoveFile={() => selectedBook && void detachFile(selectedBook.id)}
        onRead={() => selectedBook && openReader(selectedBook.id)}
      />
      {readingBook?.file && (
        <Suspense fallback={null}>
          <BookReader
            book={readingBook}
            onClose={({ reachedEnd }) => closeReader(readingBook.id, reachedEnd)}
            onPosition={saveReadingPosition}
            onSession={reading.save}
            onFileMeta={(id, patch) => void patchFile(id, patch)}
          />
        </Suspense>
      )}
      {celebrate && celebrateBook && (
        <BookFinishedModal
          book={celebrateBook}
          mode={celebrate.mode}
          reading={reading.byBook[celebrateBook.id]}
          usualSpeed={usualSpeed}
          finishedCount={finishedCount}
          onConfirm={() => void confirmFinished()}
          onRate={(rating) => void updateBook(celebrateBook.id, { rating })}
          onClose={() => setCelebrate(null)}
        />
      )}
      <AISuggestModal open={suggestOpen} onClose={() => setSuggestOpen(false)} books={books} />
      <AddCourseModal open={addCourseOpen} onClose={() => setAddCourseOpen(false)} onAdd={addCourse} />
      <CourseDetailModal course={selectedCourse} open={!!selectedCourse} onClose={() => setSelectedCourse(null)} onUpdate={updateCourse} onDelete={deleteCourse} />
      <ShareLibraryModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        currentTab={tab}
        currentFilters={{
          search,
          status: tab === "books" ? statusFilter : courseStatusFilter,
          rating: ratingFilter,
          tag: tagFilter,
          format: tab === "books" ? formatFilter : null,
          pillar: pillarFilter,
          viewMode,
        }}
      />
    </motion.div>
  );
}
