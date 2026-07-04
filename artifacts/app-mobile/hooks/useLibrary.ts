import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { type Book } from "@/lib/data";
import { useAuth } from "./useAuth";

export function useLibrary() {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBooks = useCallback(async () => {
    if (!user) {
      setBooks([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("user_books" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("library load error:", error.message);
      setLoading(false);
      return;
    }
    setBooks((data || []) as unknown as Book[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const addBook = useCallback(
    async (book: Partial<Book>) => {
      if (!user) return;
      const { error } = await supabase.from("user_books" as any).insert([{ ...book, user_id: user.id }] as any);
      if (error) {
        console.error("library add error:", error.message);
        return;
      }
      fetchBooks();
    },
    [user, fetchBooks],
  );

  const updateBook = useCallback(
    async (id: string, updates: Partial<Book>) => {
      if (!user) return;
      const { error } = await supabase
        .from("user_books" as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        console.error("library update error:", error.message);
        return;
      }
      fetchBooks();
    },
    [user, fetchBooks],
  );

  const deleteBook = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await supabase.from("user_books" as any).delete().eq("id", id).eq("user_id", user.id);
      if (error) {
        console.error("library delete error:", error.message);
        return;
      }
      fetchBooks();
    },
    [user, fetchBooks],
  );

  return { books, loading, addBook, updateBook, deleteBook, refetch: fetchBooks };
}
