import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Book, BookFile, isScan, pagesReadFor } from "@/lib/library-data";
import { bookFileErrorMessage, removeBookFiles, uploadBookFile, type UploadStage } from "@/lib/book-files";
import { toast } from "sonner";

export function useLibraryState() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<Record<string, UploadStage>>({});
  const booksRef = useRef<Book[]>([]);
  booksRef.current = books;
  const inFlight = useRef(new Set<string>());

  const fetchBooks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("user_books" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error("Failed to load books"); return; }
    setBooks((data || []) as unknown as Book[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBooks(); }, [fetchBooks]);

  const addBook = useCallback(async (book: Partial<Book>) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_books" as any)
      .insert([{ ...book, user_id: user.id }] as any);
    if (error) { toast.error("Failed to add book"); return; }
    toast.success("Book added!");
    fetchBooks();
  }, [user, fetchBooks]);

  const updateBook = useCallback(async (id: string, updates: Partial<Book>) => {
    if (!user) return;
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
    if (error) { toast.error("Failed to update book"); return; }
    await fetchBooks();
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
      // A book without a page count takes the PDF's.
      const updates: Partial<Book> = { file: stored };
      if (!book.total_pages) updates.total_pages = stored.pages;
      const { error } = await supabase
        .from("user_books" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", bookId)
        .eq("user_id", user.id);
      if (error) {
        void removeBookFiles(stored);
        toast.error(error.message.includes("'file'") ? "Book files are not set up yet (run the library_files migration)" : "Could not save the PDF on the book");
        return false;
      }
      // The file the book pointed at until now, read after the upload in case it changed meanwhile.
      const previous = booksRef.current.find(b => b.id === bookId)?.file;
      if (previous && previous.path !== stored.path) void removeBookFiles(previous);
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
  }, [user, fetchBooks]);

  const detachFile = useCallback(async (bookId: string) => {
    if (!user) return;
    const file = booksRef.current.find(b => b.id === bookId)?.file;
    if (!file) return;
    const { error } = await supabase
      .from("user_books" as any)
      .update({ file: null, updated_at: new Date().toISOString() } as any)
      .eq("id", bookId)
      .eq("user_id", user.id);
    if (error) { toast.error("Could not remove the PDF"); return; }
    void removeBookFiles(file);
    toast.success("PDF removed");
    fetchBooks();
  }, [user, fetchBooks]);

  /**
   * Remembers where the reader is. Progress only moves forward (flicking back
   * to re-read a page does not undo it), and opening a to-read book past its
   * first page marks it as being read.
   */
  const saveReadingPosition = useCallback(async (bookId: string, page: number) => {
    if (!user) return;
    const book = booksRef.current.find(b => b.id === bookId);
    if (!book?.file || book.file.lastPage === page) return;
    const file = { ...book.file, lastPage: page };
    const updates: Partial<Book> = {
      file,
      pages_read: Math.max(book.pages_read || 0, pagesReadFor(page, file.pages, book.total_pages)),
    };
    if (book.status === "to-read" && page > 1) updates.status = "reading";
    setBooks(prev => prev.map(b => (b.id === bookId ? { ...b, ...updates } : b)));
    await supabase
      .from("user_books" as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", bookId)
      .eq("user_id", user.id);
  }, [user]);

  /** Merges facts about a book's file (words per page) without touching anything else. */
  const patchFile = useCallback(async (bookId: string, patch: Partial<BookFile>) => {
    if (!user) return;
    const book = booksRef.current.find(b => b.id === bookId);
    if (!book?.file) return;
    const file = { ...book.file, ...patch };
    setBooks(prev => prev.map(b => (b.id === bookId ? { ...b, file } : b)));
    await supabase
      .from("user_books" as any)
      .update({ file } as any)
      .eq("id", bookId)
      .eq("user_id", user.id);
  }, [user]);

  return {
    books, loading, addBook, updateBook, deleteBook, refetch: fetchBooks,
    uploads, attachFile, detachFile, saveReadingPosition, patchFile,
  };
}
