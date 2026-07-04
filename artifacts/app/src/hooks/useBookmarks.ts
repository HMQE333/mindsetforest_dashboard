import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

const LEGACY_KEY = "dashboard_bookmarks";

// Bookmarks are scoped per user so different accounts sharing a browser don't
// collide, and so a logged-out session can never persist over someone's data.
const storageKey = (userId: string) => `dashboard_bookmarks:${userId}`;

function readBookmarks(userId: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) return JSON.parse(raw);
    // One-time migration from the old un-scoped key so existing bookmarks
    // aren't lost.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(storageKey(userId), legacy);
      localStorage.removeItem(LEGACY_KEY);
      return JSON.parse(legacy);
    }
    return [];
  } catch {
    return [];
  }
}

function writeBookmarks(userId: string, bookmarks: Bookmark[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(bookmarks));
  } catch {
    // ignore (e.g. storage disabled/partitioned)
  }
}

// crypto.randomUUID is only available in secure contexts; fall back so adding a
// bookmark never throws.
export function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `bm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Per-user bookmark store backed by localStorage. Intended to have a single
 * consumer at a time (mounted once in the Archive "Bookmarks" tab) — mirroring
 * multiple independent instances would each run their own persist and could
 * clobber each other.
 */
export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // Tracks which user's bookmarks are currently loaded. Persist is gated on this
  // matching the active user (render-driven), so the write effect never fires
  // with stale/previous-user state and can't clobber or leak data.
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setBookmarks([]);
      setLoadedUserId(null);
      return;
    }
    setBookmarks(readBookmarks(user.id));
    setLoadedUserId(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user || loadedUserId !== user.id) return;
    writeBookmarks(user.id, bookmarks);
  }, [bookmarks, user, loadedUserId]);

  const addBookmark = useCallback((title: string, url: string) => {
    const nUrl = normalizedUrl(url);
    if (!nUrl) return;
    let finalTitle = title.trim();
    if (!finalTitle) {
      try {
        finalTitle = new URL(nUrl).hostname.replace(/^www\./, "");
      } catch {
        finalTitle = nUrl;
      }
    }
    setBookmarks((prev) => [...prev, { id: makeId(), title: finalTitle, url: nUrl }]);
  }, []);

  const updateBookmark = useCallback((id: string, title: string, url: string) => {
    const nUrl = normalizedUrl(url);
    if (!nUrl) return;
    let finalTitle = title.trim();
    if (!finalTitle) {
      try {
        finalTitle = new URL(nUrl).hostname.replace(/^www\./, "");
      } catch {
        finalTitle = nUrl;
      }
    }
    setBookmarks((prev) => prev.map((b) => (b.id === id ? { ...b, title: finalTitle, url: nUrl } : b)));
  }, []);

  const deleteBookmark = useCallback((id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  return { bookmarks, addBookmark, updateBookmark, deleteBookmark };
}
