import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "./useAuth";

export interface Bookmark {
  id: string;
  title: string;
  url: string;
}

// Bookmarks are persisted server-side (Supabase) like the rest of the app.
// They live inside the user's `user_onboarding.preferences` jsonb under the
// `bookmarks` key — there is no dedicated bookmarks table and the client only
// has the anon key (no DDL), so we reuse the existing per-user preferences blob.
// localStorage is used ONLY as an instant-paint cache; it is NOT the source of
// truth. (localStorage-only persistence silently fails in the proxied/
// partitioned preview iframe, which is why the old version never "stuck".)

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
    // ignore — cache is best-effort
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
 * Per-user bookmark store backed by Supabase (`user_onboarding.preferences.bookmarks`),
 * with a localStorage cache for instant load. Reads/writes are scoped to the
 * authenticated user via RLS.
 */
export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  // Authoritative in-memory copy so mutations never read a stale closure and so
  // side effects stay out of the setState updater.
  const bookmarksRef = useRef<Bookmark[]>([]);
  // Serializes writes: each persist waits for the previous to finish so two
  // rapid mutations can't interleave their read-merge-write and let a stale
  // completion overwrite newer state. Sequential => the latest write wins.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

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

    // Instant paint from cache while the server load is in flight.
    setBoth(readCache(uid));

    (async () => {
      const { data, error } = await supabase
        .from("user_onboarding")
        .select("preferences")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Keep the cached value on failure rather than wiping the list.
        return;
      }
      const prefs = (data?.preferences as Record<string, unknown>) || {};
      const raw = prefs.bookmarks;
      const bms = Array.isArray(raw) ? (raw as Bookmark[]) : [];
      setBoth(bms);
      writeCache(uid, bms);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, setBoth]);

  // Read-merge-write: fetch the latest preferences, set only the bookmarks key,
  // and upsert. Preserves every other preference and only ever touches the
  // preferences column (completed / custom_categories are left intact).
  const persist = useCallback(async (uid: string, next: Bookmark[]) => {
    writeCache(uid, next);
    const { data, error: readErr } = await supabase
      .from("user_onboarding")
      .select("preferences")
      .eq("user_id", uid)
      .maybeSingle();
    // Abort on read failure: writing with an empty base would clobber other
    // preference keys. The cache still holds `next`; the next successful
    // mutation re-persists. (A missing row with no error is a valid new row.)
    if (readErr) {
      toast.error("Failed to save bookmark");
      return;
    }
    const prefs = (data?.preferences as Record<string, unknown>) || {};
    const merged = { ...prefs, bookmarks: next };
    const { error } = await (supabase.from("user_onboarding") as any).upsert(
      [{ user_id: uid, preferences: merged }],
      { onConflict: "user_id" }
    );
    if (error) toast.error("Failed to save bookmark");
  }, []);

  // Applies a mutation: updates state synchronously and enqueues a serialized
  // persist. persist runs OUTSIDE the setState updater to stay side-effect-free.
  const apply = useCallback(
    (next: Bookmark[]) => {
      if (!user) return;
      const uid = user.id;
      setBoth(next);
      chainRef.current = chainRef.current
        .catch(() => {})
        .then(() => persist(uid, next));
    },
    [user, setBoth, persist]
  );

  const addBookmark = useCallback(
    (title: string, url: string) => {
      const nUrl = normalizedUrl(url);
      if (!nUrl) return;
      apply([...bookmarksRef.current, { id: makeId(), title: deriveTitle(title, nUrl), url: nUrl }]);
    },
    [apply]
  );

  const updateBookmark = useCallback(
    (id: string, title: string, url: string) => {
      const nUrl = normalizedUrl(url);
      if (!nUrl) return;
      const finalTitle = deriveTitle(title, nUrl);
      apply(
        bookmarksRef.current.map((b) => (b.id === id ? { ...b, title: finalTitle, url: nUrl } : b))
      );
    },
    [apply]
  );

  const deleteBookmark = useCallback(
    (id: string) => {
      apply(bookmarksRef.current.filter((b) => b.id !== id));
    },
    [apply]
  );

  return { bookmarks, addBookmark, updateBookmark, deleteBookmark };
}
