import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

// Bookmarks live in their own `public.bookmarks` table (one row per bookmark)
// so writes are atomic and can't race with unrelated preference saves. We keep
// a small localStorage cache purely for instant paint on load; the database is
// the source of truth.

const cacheKey = (userId: string) => `bookmarks_cache:${userId}`;

function readCache(userId: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(userId: string, bookmarks: Bookmark[]) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(bookmarks));
  } catch {
    // ignore. Cache is best-effort
  }
}

export function normalizedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function deriveTitle(title: string, nUrl: string): string {
  const t = title.trim();
  if (t) return t;
  try {
    return new URL(nUrl).hostname.replace(/^www\./, "");
  } catch {
    return nUrl;
  }
}

/**
 * Per-user bookmark store backed by the `public.bookmarks` table. Reads/writes
 * are scoped to the authenticated user via RLS. A localStorage cache is used
 * only for instant paint before the server load completes.
 */
export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const bookmarksRef = useRef<Bookmark[]>([]);

  const setBoth = useCallback((next: Bookmark[]) => {
    bookmarksRef.current = next;
    setBookmarks(next);
  }, []);

  useEffect(() => {
    if (!user) {
      setBoth([]);
      return;
    }
    const uid = user.id;
    let cancelled = false;

    setBoth(readCache(uid));

    (async () => {
      const { data, error } = await supabase
        .from("bookmarks")
        .select("id, title, url, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) return;
      const bms: Bookmark[] = (data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        url: r.url,
      }));
      setBoth(bms);
      writeCache(uid, bms);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, setBoth]);

  const addBookmark = useCallback(
    async (title: string, url: string) => {
      if (!user) return;
      const nUrl = normalizedUrl(url);
      if (!nUrl) return;
      const finalTitle = deriveTitle(title, nUrl);
      const { data, error } = await (supabase.from("bookmarks") as any)
        .insert([{ user_id: user.id, title: finalTitle, url: nUrl }])
        .select("id, title, url")
        .single();
      if (error || !data) {
        toast.error("Failed to save bookmark");
        return;
      }
      const next = [...bookmarksRef.current, { id: data.id, title: data.title, url: data.url }];
      setBoth(next);
      writeCache(user.id, next);
    },
    [user, setBoth]
  );

  const updateBookmark = useCallback(
    async (id: string, title: string, url: string) => {
      if (!user) return;
      const nUrl = normalizedUrl(url);
      if (!nUrl) return;
      const finalTitle = deriveTitle(title, nUrl);
      const { error } = await (supabase.from("bookmarks") as any)
        .update({ title: finalTitle, url: nUrl })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Failed to update bookmark");
        return;
      }
      const next = bookmarksRef.current.map((b) =>
        b.id === id ? { ...b, title: finalTitle, url: nUrl } : b
      );
      setBoth(next);
      writeCache(user.id, next);
    },
    [user, setBoth]
  );

  const deleteBookmark = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Failed to delete bookmark");
        return;
      }
      const next = bookmarksRef.current.filter((b) => b.id !== id);
      setBoth(next);
      writeCache(user.id, next);
    },
    [user, setBoth]
  );

  return { bookmarks, addBookmark, updateBookmark, deleteBookmark };
}
