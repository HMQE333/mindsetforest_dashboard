import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Book } from "@/lib/library-data";
import { toast } from "sonner";

export function useLibraryState() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

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
    const { error } = await supabase
      .from("user_books" as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update book"); return; }
    fetchBooks();
  }, [user, fetchBooks]);

  const deleteBook = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("user_books" as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to delete book"); return; }
    toast.success("Book removed");
    fetchBooks();
  }, [user, fetchBooks]);

  return { books, loading, addBook, updateBook, deleteBook, refetch: fetchBooks };
}
