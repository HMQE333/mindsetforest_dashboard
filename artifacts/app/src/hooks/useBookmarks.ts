import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { youtubeId } from "@/lib/youtube";

/**
 * A bookmarked URL: added by hand, or a link bookmarked from a note (then
 * `blockId` is that note). Bookmarked notes themselves are archive blocks
 * with is_starred set; the Bookmarks tab shows both.
 */
export interface Bookmark {
  id: string;
  title: string;
  url: string;
  blockId: string | null;
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

/** The title when none is given: the host and path, which tell two links on one site apart. */
function deriveTitle(title: string, nUrl: string): string {
  const t = title.trim();
  if (t) return t;
  const video = youtubeId(nUrl);
  if (video) return `YouTube video ${video}`;
  try {
    const u = new URL(nUrl);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`.slice(0, 80);
  } catch {
    return nUrl;
  }
}

const rowToBookmark = (r: { id: string; title: string; url: string; block_id?: string | null }): Bookmark => ({
  id: r.id,
  title: r.title,
  url: r.url,
  blockId: r.block_id ?? null,
});

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
        .select("id, title, url, block_id, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) return;
      const bms: Bookmark[] = (data || []).map(rowToBookmark);
      setBoth(bms);
      writeCache(uid, bms);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, setBoth]);

  /** Adds a bookmark, newest first; a URL already bookmarked is left as it is. */
  const addBookmark = useCallback(
    async (title: string, url: string, blockId: string | null = null): Promise<boolean> => {
      if (!user) return false;
      const nUrl = normalizedUrl(url);
      if (!nUrl) return false;
      if (bookmarksRef.current.some((b) => b.url === nUrl)) {
        toast.info("Already bookmarked");
        return false;
      }
      const finalTitle = deriveTitle(title, nUrl);
      const { data, error } = await (supabase.from("bookmarks") as any)
        .insert([{ user_id: user.id, title: finalTitle, url: nUrl, block_id: blockId }])
        .select("id, title, url, block_id")
        .single();
      if (error || !data) {
        toast.error(error?.code === "23505" ? "Already bookmarked" : "Failed to save bookmark");
        return false;
      }
      const next = [rowToBookmark(data), ...bookmarksRef.current];
      setBoth(next);
      writeCache(user.id, next);
      return true;
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
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Failed to delete bookmark");
        return false;
      }
      const next = bookmarksRef.current.filter((b) => b.id !== id);
      setBoth(next);
      writeCache(user.id, next);
      return true;
    },
    [user, setBoth]
  );

  const isBookmarked = useCallback((url: string) => {
    const nUrl = normalizedUrl(url);
    return bookmarks.some((b) => b.url === nUrl);
  }, [bookmarks]);

  /** Bookmark a link from a note, or take its bookmark away; says which happened (null: neither). */
  const toggleBookmark = useCallback(async (url: string, title: string, blockId: string | null): Promise<"added" | "removed" | null> => {
    const nUrl = normalizedUrl(url);
    const existing = bookmarksRef.current.find((b) => b.url === nUrl);
    if (existing) return (await deleteBookmark(existing.id)) ? "removed" : null;
    return (await addBookmark(title, nUrl, blockId)) ? "added" : null;
  }, [addBookmark, deleteBookmark]);

  return { bookmarks, addBookmark, updateBookmark, deleteBookmark, isBookmarked, toggleBookmark };
}
