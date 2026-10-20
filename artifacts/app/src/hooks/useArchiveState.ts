import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ARCHIVE_BLOCKS_CHANGED_EVENT, ArchiveSaveError, archiveFingerprint, chunkForInsert, type ArchiveBlock } from "@/lib/archive-data";
import { trackEmbedding } from "@/lib/archive-embeddings";
import { toast } from "sonner";

/** Embed one note now; a suggestion request for it waits for this (archive-embeddings.ts). */
function embedBlock(blockId: string): Promise<void> {
  const p = writeEmbedding(blockId);
  trackEmbedding(blockId, p);
  return p;
}

async function writeEmbedding(blockId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.functions.invoke("ai-embed-block", {
      body: { action: "embed", blockId },
    });
  } catch (e) {
    console.error("Embedding failed for block:", blockId, e);
  }
}

/**
 * Embed new blocks a few at a time: an import of hundreds must not fire hundreds of calls at once.
 * Each one counts as being embedded from the start (queued too), so a suggestion request waits for it.
 */
async function embedInBackground(ids: string[], concurrency = 3) {
  const settle = new Map<string, () => void>();
  for (const id of ids) trackEmbedding(id, new Promise<void>((resolve) => settle.set(id, resolve)));
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      await writeEmbedding(id);
      settle.get(id)?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
}

// Every column but the embedding: the vectors are only read server-side, and
// each one is ~20 KB of text the list never shows.
const BLOCK_COLUMNS = "id,user_id,title,content,pillars,directions,tags,source_url,is_pinned,is_starred,created_at,updated_at,from_seed_id";

/** A video summary that matched a meaning search. */
export interface VideoMatch {
  id: string;
  video_id: string;
  url: string;
  title: string;
  channel: string;
  similarity: number;
}

const EMPTY_BLOCKS: ArchiveBlock[] = [];
/** Poll period while the window has focus, and while it is visible without focus (another app in front). */
const POLL_FOCUSED_MS = 5_000;
const POLL_BLURRED_MS = 15_000;

/** Tells other tabs of this browser that the archive changed, so they check at once instead of at their next poll. */
function announce(userId: string) {
  try {
    const bc = new BroadcastChannel(`archive-blocks:${userId}`);
    bc.postMessage("changed");
    bc.close();
  } catch { /* no BroadcastChannel: the poll still catches it */ }
}

/** Pause after the last write before the list is fetched again (a batch of folder writes is one refetch). */
export const REFETCH_AFTER_WRITES_MS = 1_200;
const refetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** One refetch of the list once the writes stop, in place of the ones cancelled under them. */
function refetchAfterWrites(qc: QueryClient, queryKey: readonly unknown[]) {
  const k = JSON.stringify(queryKey);
  clearTimeout(refetchTimers.get(k));
  refetchTimers.set(k, setTimeout(() => {
    refetchTimers.delete(k);
    void qc.invalidateQueries({ queryKey });
  }, REFETCH_AFTER_WRITES_MS));
}

/**
 * `live: false` is for writers that never show the list (Quick Capture is
 * mounted on every screen): no fetch, no polling, the writes still land in the
 * cached list when the Archive has it.
 */
export function useArchiveState({ live = true }: { live?: boolean } = {}) {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["archive_blocks", userId], [userId]);

  // The list is fetched once and then kept: opening the Archive again checks
  // the fingerprint below and downloads the list only when it moved, instead of
  // re-downloading every note (one is 500k characters) on every visit and focus.
  const query = useQuery<ArchiveBlock[]>({
    queryKey,
    enabled: !!userId && live,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("archive_blocks" as any)
        .select(BLOCK_COLUMNS)
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any as ArchiveBlock[]) || [];
    },
  });

  useEffect(() => {
    if (query.error) {
      console.error("fetch archive error:", query.error);
      toast.error("Failed to load archive");
    }
  }, [query.error]);

  // Sync across devices by polling (simpler than Realtime): read the row
  // count and the newest change, and refetch the list only when they differ
  // from the list held here, or when no list is held (the first load failed:
  // nothing else retries it while the Archive is open). Every 5 s while the
  // window has focus, every 15 s while it is visible behind another app, never
  // while hidden; coming back to the window checks at once, and so does a
  // write in another tab.
  useEffect(() => {
    if (!userId || !live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let lastCheck = 0;
    let stopped = false;
    const check = async () => {
      if (busy || qc.isFetching({ queryKey }) > 0) return;
      busy = true;
      lastCheck = Date.now();
      try {
        const { data, count, error } = await supabase
          .from("archive_blocks" as any)
          .select("updated_at", { count: "exact" })
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1);
        // A fetch that started meanwhile already brings the news (and must not be restarted).
        if (error || stopped || qc.isFetching({ queryKey }) > 0) return;
        const server = `${count ?? 0}:${(data as any)?.[0]?.updated_at ?? ""}`;
        const held = qc.getQueryData<ArchiveBlock[]>(queryKey);
        if (!held || server !== archiveFingerprint(held)) void qc.invalidateQueries({ queryKey });
      } finally {
        busy = false;
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      if (stopped || document.hidden) return;
      timer = setTimeout(tick, document.hasFocus() ? POLL_FOCUSED_MS : POLL_BLURRED_MS);
    };
    const tick = async () => {
      await check();
      schedule();
    };
    const wake = () => {
      if (document.hidden) { clearTimeout(timer); return; }
      // Focus and visibility often fire together; one check covers both.
      if (Date.now() - lastCheck < 1000) { schedule(); return; }
      void tick();
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(`archive-blocks:${userId}`);
      bc.onmessage = () => void tick();
    } catch { /* polling alone */ }
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      bc?.close();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [userId, live, qc, queryKey]);

  // Refetch immediately when another part of the app (e.g. The AI assistant)
  // saves a note to the archive, so it shows up without waiting for the poll.
  useEffect(() => {
    const handler = () => {
      void qc.invalidateQueries({ queryKey });
    };
    window.addEventListener(ARCHIVE_BLOCKS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ARCHIVE_BLOCKS_CHANGED_EVENT, handler);
  }, [qc, queryKey]);

  const blocks = query.data ?? EMPTY_BLOCKS;
  const loading = query.isLoading && !query.data;

  /**
   * Puts a write's result into the held list. A refetch already in flight (the
   * poll's) may have read the table before the write, and when it lands it
   * replaces the list whatever setQueryData did meanwhile: the change would
   * vanish for a few seconds, and a folder action in that window would build
   * its tags from the old list and write them back. So that refetch is
   * cancelled and one fresh fetch follows once the writes pause. (No list held
   * yet: the first load is left to land; the poll then sees the write's newer
   * updated_at and fetches again.)
   */
  const setBlocks = useCallback(async (updater: (prev: ArchiveBlock[]) => ArchiveBlock[]) => {
    if (qc.getQueryData(queryKey) && qc.isFetching({ queryKey }) > 0) {
      await qc.cancelQueries({ queryKey });
      refetchAfterWrites(qc, queryKey);
    }
    qc.setQueryData<ArchiveBlock[]>(queryKey, (prev) => updater(prev || []));
  }, [qc, queryKey]);

  const fetchBlocks = useCallback(async () => {
    await qc.invalidateQueries({ queryKey });
  }, [qc, queryKey]);

  // The writes below keep one identity per user, so memoised cards that take
  // them do not re-render when the list does.
  const addBlock = useCallback(async (block: Partial<ArchiveBlock>) => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("archive_blocks" as any)
      .insert({ ...block, user_id: userId } as any)
      .select(BLOCK_COLUMNS)
      .single();
    if (error) {
      toast.error("Failed to save block");
      return null;
    }
    await setBlocks((prev) => [(data as any), ...prev]);
    announce(userId);
    embedBlock((data as any).id);
    return data as any as ArchiveBlock;
  }, [userId, setBlocks]);

  /**
   * Insert in order, in requests of at most 100 blocks or ~1 MB. Throws
   * ArchiveSaveError on the first failure, saying how many made it, so the
   * caller can keep the rest instead of reporting a save that did not happen.
   */
  const addBlocks = useCallback(async (newBlocks: Partial<ArchiveBlock>[]): Promise<ArchiveBlock[]> => {
    if (!userId) throw new ArchiveSaveError("Not signed in", 0);
    const saved: ArchiveBlock[] = [];
    let failure: ArchiveSaveError | null = null;
    for (const batch of chunkForInsert(newBlocks)) {
      const rows = batch.map((b) => ({ ...b, user_id: userId }));
      const { data, error } = await supabase
        .from("archive_blocks" as any)
        .insert(rows as any)
        .select(BLOCK_COLUMNS);
      if (error) {
        failure = new ArchiveSaveError(error.message || "Save failed", saved.length);
        break;
      }
      saved.push(...(((data as any) || []) as ArchiveBlock[]));
    }
    if (saved.length > 0) {
      await setBlocks((prev) => [...saved, ...prev]);
      announce(userId);
      void embedInBackground(saved.map((b) => b.id));
    }
    if (failure) throw failure;
    return saved;
  }, [userId, setBlocks]);

  /** Resolves whether the change was saved (a failure is toasted here, unless `quiet`: a batch says it once). */
  const updateBlock = useCallback(async (id: string, updates: Partial<ArchiveBlock>, { quiet = false }: { quiet?: boolean } = {}): Promise<boolean> => {
    // The row's new updated_at comes back with the write, so the list held
    // here matches the server's fingerprint and the poll does not refetch it
    // for the edit itself. The embedding written after a title or content
    // change bumps updated_at again (the table's trigger), so one refetch
    // follows until supabase/migrations/20261019130000_archive_embedding_updated_at.sql
    // is applied.
    const { data, error } = await supabase
      .from("archive_blocks" as any)
      .update(updates as any)
      .eq("id", id)
      .select("updated_at");
    if (error) {
      if (!quiet) toast.error("Failed to update block");
      return false;
    }
    const updatedAt = (data as any)?.[0]?.updated_at as string | undefined;
    await setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates, ...(updatedAt ? { updated_at: updatedAt } : {}) } : b))
    );
    if (userId) announce(userId);
    if (updates.title !== undefined || updates.content !== undefined) {
      embedBlock(id);
    }
    return true;
  }, [userId, setBlocks]);

  /** Resolves whether the block was deleted (a failure is toasted here). */
  const deleteBlock = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from("archive_blocks" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete block");
      return false;
    }
    await setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (userId) announce(userId);
    return true;
  }, [userId, setBlocks]);

  /** Meaning search over notes, and over video summaries (which live with their link). */
  const searchArchive = useCallback(async (query: string): Promise<{ blocks: ArchiveBlock[]; videos: VideoMatch[] }> => {
    try {
      const { data, error } = await supabase.functions.invoke("ai-embed-block", {
        body: { action: "search", query },
      });
      if (error) throw error;
      return { blocks: (data?.results || []) as ArchiveBlock[], videos: (data?.videos || []) as VideoMatch[] };
    } catch (e) {
      console.error("Semantic search error:", e);
      return { blocks: [], videos: [] };
    }
  }, []);

  const semanticSearch = useCallback(async (query: string) => (await searchArchive(query)).blocks, [searchArchive]);

  const embedAll = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("ai-embed-block", {
        body: { action: "embed-all" },
      });
      if (error) throw error;
      toast.success(`Embedded ${data?.embedded || 0} blocks`);
      return data;
    } catch (e: any) {
      toast.error(e?.message || "Failed to embed blocks");
    }
  }, []);

  return { blocks, loading, fetchBlocks, addBlock, addBlocks, updateBlock, deleteBlock, semanticSearch, searchArchive, embedAll };
}
