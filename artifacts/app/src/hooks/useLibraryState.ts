import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Book, BookFile, isScan, pagesReadFor } from "@/lib/library-data";
import { bookFileErrorMessage, removeBookFiles, uploadBookFile, type UploadStage } from "@/lib/book-files";
import { toast } from "sonner";
import { LIBRARY_CHANGED_EVENT, onAppEvent } from "@/lib/app-events";

export function useLibraryState() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<Record<string, UploadStage>>({});
  const booksRef = useRef<Book[]>([]);
  booksRef.current = books;
  const inFlight = useRef(new Set<string>());
  // Writes that replace a book's `file` object run one at a time per book,
  // each starting from the latest state, so a position save can never write
  // back a file that an upload has just replaced.
  const fileQueue = useRef(new Map<string, Promise<unknown>>());
  const queueFileWrite = useCallback(<T,>(bookId: string, write: () => Promise<T>): Promise<T> => {
    const next = (fileQueue.current.get(bookId) || Promise.resolve()).then(write, write);
    fileQueue.current.set(bookId, next.catch(() => undefined));
    return next;
  }, []);
  /** Local change that later queued writes see immediately (booksRef otherwise updates on render). */
  const applyLocal = useCallback((bookId: string, patch: Partial<Book>) => {
    booksRef.current = booksRef.current.map(b => (b.id === bookId ? { ...b, ...patch } : b));
    setBooks(prev => prev.map(b => (b.id === bookId ? { ...b, ...patch } : b)));
  }, []);
  // One warning per session is enough when reading progress stops saving (usually offline).
  const warnedSave = useRef(false);
  const warnSaveFailed = () => {
    if (warnedSave.current) return;
    warnedSave.current = true;
    toast.warning("Reading progress isn't saving right now", { description: "Check your connection; it will be saved again once it works." });
  };

  const fetchBooks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("user_books" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      // Books added in one go share a timestamp; without a tiebreak their order
      // shifts whenever one of them is saved.
      .order("id", { ascending: true });
    if (error) { toast.error("Failed to load books"); return; }
    setBooks((data || []) as unknown as Book[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);
  // Books added elsewhere (the assistant) show up without a reload.
  useEffect(() => onAppEvent(LIBRARY_CHANGED_EVENT, () => { void fetchBooks(); }), [fetchBooks]);

  const addBook = useCallback(async (book: Partial<Book>): Promise<boolean> => {
    if (!user) return false;
    // A book added as already read gets its finish date like one marked finished later.
    const row: Partial<Book> = book.status === "finished"
      ? { finished_at: new Date().toISOString(), pages_read: book.total_pages || 0, ...book }
      : book;
    const { error } = await supabase
      .from("user_books" as any)
      .insert([{ ...row, user_id: user.id }] as any);
    if (error) { toast.error("Failed to add book"); return false; }
    toast.success("Book added!");
    fetchBooks();
    return true;
  }, [user, fetchBooks]);

  const updateBook = useCallback(async (id: string, updates: Partial<Book>): Promise<boolean> => {
    if (!user) return false;
    // The finish date follows the status: stamped when it turns to finished, cleared if it turns back.
    const before = booksRef.current.find(b => b.id === id);
    const stamped: Partial<Book> = { ...updates };
    if (updates.status === "finished" && before?.status !== "finished") stamped.finished_at = new Date().toISOString();
    else if (updates.status && updates.status !== "finished" && before?.status === "finished") stamped.finished_at = null;
    const { error } = await supabase
      .from("user_books" as any)
      .update({ ...stamped, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update book"); return false; }
    await fetchBooks();
    return true;
  }, [user, fetchBooks]);

  const deleteBook = useCallback(async (id: string) => {
    if (!user) return;
    const file = booksRef.current.find(b => b.id === id)?.file;
    const { error } = await supabase
      .from("user_books" as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to delete book"); return; }
    void removeBookFiles(file);
    toast.success("Book removed");
    fetchBooks();
  }, [user, fetchBooks]);

  /** Uploads a PDF for a book (replacing any earlier one) and records it on the book. */
  const attachFile = useCallback(async (bookId: string, file: File): Promise<boolean> => {
    if (!user) return false;
    const book = booksRef.current.find(b => b.id === bookId);
    if (!book) return false;
    if (inFlight.current.has(bookId)) {
      toast.info(`"${book.title}" is still uploading`);
      return false;
    }
    inFlight.current.add(bookId);
    const setStage = (s: UploadStage | null) => setUploads(prev => {
      const next = { ...prev };
      if (s) next[bookId] = s; else delete next[bookId];
      return next;
    });
    try {
      const stored = await uploadBookFile(user.id, bookId, file, setStage);
      const saved = await queueFileWrite(bookId, async () => {
        // The file the book pointed at until now, read at write time in case it changed meanwhile.
        const current = booksRef.current.find(b => b.id === bookId);
        const updates: Partial<Book> = { file: stored };
        // A book without a page count takes the PDF's.
        if (!current?.total_pages) updates.total_pages = stored.pages;
        const { error } = await supabase
          .from("user_books" as any)
          .update({ ...updates, updated_at: new Date().toISOString() } as any)
          .eq("id", bookId)
          .eq("user_id", user.id);
        if (error) return { error: error.message };
        applyLocal(bookId, updates);
        return { previous: current?.file ?? null };
      });
      if (saved.error) {
        void removeBookFiles(stored);
        toast.error(saved.error.includes("'file'") ? "Book files are not set up yet (run the library_files migration)" : "Could not save the PDF on the book");
        return false;
      }
      if (saved.previous && saved.previous.path !== stored.path) void removeBookFiles(saved.previous);
      toast.success(`PDF attached to "${book.title}"`, {
        description: isScan(stored)
          ? `${stored.pages} pages · a scan, no text layer`
          : `${stored.pages} pages · text extracted`,
      });
      await fetchBooks();
      return true;
    } catch (e) {
      toast.error(bookFileErrorMessage(e), { description: file.name });
      return false;
    } finally {
      inFlight.current.delete(bookId);
      setStage(null);
    }
  }, [user, fetchBooks, queueFileWrite, applyLocal]);

  const detachFile = useCallback(async (bookId: string) => {
    if (!user) return;
    await queueFileWrite(bookId, async () => {
      const file = booksRef.current.find(b => b.id === bookId)?.file;
      if (!file) return;
      const { error } = await supabase
        .from("user_books" as any)
        .update({ file: null, updated_at: new Date().toISOString() } as any)
        .eq("id", bookId)
        .eq("user_id", user.id);
      if (error) { toast.error("Could not remove the PDF"); return; }
      applyLocal(bookId, { file: null });
      void removeBookFiles(file);
      toast.success("PDF removed");
    });
    fetchBooks();
  }, [user, fetchBooks, queueFileWrite, applyLocal]);

  /**
   * Remembers where the reader is. Progress only moves forward (flicking back
   * to re-read a page does not undo it), and opening a to-read book past its
   * first page marks it as being read.
   */
  const saveReadingPosition = useCallback(async (bookId: string, page: number, filePath?: string) => {
    if (!user) return;
    await queueFileWrite(bookId, async () => {
      const book = booksRef.current.find(b => b.id === bookId);
      // A position in a PDF that has since been replaced belongs to nothing.
      if (!book?.file || (filePath && book.file.path !== filePath) || book.file.lastPage === page) return;
      const file = { ...book.file, lastPage: page };
      const updates: Partial<Book> = {
        file,
        pages_read: Math.max(book.pages_read || 0, pagesReadFor(page, file.pages, book.total_pages)),
      };
      if (book.status === "to-read" && page > 1) updates.status = "reading";
      applyLocal(bookId, updates);
      const { error } = await supabase
        .from("user_books" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", bookId)
        .eq("user_id", user.id);
      if (error) warnSaveFailed();
    });
  }, [user, queueFileWrite, applyLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Merges facts about a book's file (words per page) without touching anything else. */
  const patchFile = useCallback(async (bookId: string, patch: Partial<BookFile>) => {
    if (!user) return;
    await queueFileWrite(bookId, async () => {
      const book = booksRef.current.find(b => b.id === bookId);
      if (!book?.file) return;
      const file = { ...book.file, ...patch };
      applyLocal(bookId, { file });
      // Only derived facts (word counts): if this fails they are worked out again next time.
      await supabase
        .from("user_books" as any)
        .update({ file } as any)
        .eq("id", bookId)
        .eq("user_id", user.id);
    });
  }, [user, queueFileWrite, applyLocal]);

  return {
    books, loading, addBook, updateBook, deleteBook, refetch: fetchBooks,
    uploads, attachFile, detachFile, saveReadingPosition, patchFile,
  };
}
