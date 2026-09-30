import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ARCHIVE_BLOCKS_CHANGED_EVENT, ArchiveSaveError, chunkForInsert, type ArchiveBlock } from "@/lib/archive-data";
import { toast } from "sonner";

async function embedBlock(blockId: string) {
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

/** Embed new blocks a few at a time: an import of hundreds must not fire hundreds of calls at once. */
async function embedInBackground(ids: string[], concurrency = 3) {
  let next = 0;
  const worker = async () => {
    while (next < ids.length) await embedBlock(ids[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
}

// Every column but the embedding: the vectors are only read server-side, and
// each one is ~20 KB of text the list never shows.
const BLOCK_COLUMNS = "id,user_id,title,content,pillars,directions,tags,source_url,is_pinned,created_at,updated_at,from_seed_id";

/** A video summary that matched a meaning search. */
export interface VideoMatch {
  id: string;
  video_id: string;
  url: string;
  title: string;
  channel: string;
  similarity: number;
}

const CACHE_MAX = 500;
const cacheKey = (userId: string) => `archive_blocks_cache_${userId}`;

function readCache(userId: string): ArchiveBlock[] | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch { return undefined; }
}

function writeCache(userId: string, blocks: ArchiveBlock[]) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(blocks.slice(0, CACHE_MAX)));
  } catch { /* quota exceeded. Ignore */ }
}

/**
 * `live: false` is for writers that never show the list (Quick Capture is
 * mounted on every screen): no fetch, no polling, the writes still land in the
 * cached list when the Archive has it.
 */
export function useArchiveState({ live = true }: { live?: boolean } = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["archive_blocks", user?.id];

  const query = useQuery<ArchiveBlock[]>({
    queryKey,
    enabled: !!user && live,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("archive_blocks" as any)
        .select(BLOCK_COLUMNS)
        .eq("user_id", user!.id)
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

  // Polling keeps the archive in sync across devices/windows (simpler than
  // Realtime). Every 5 s it reads a fingerprint (row count + newest change) and
  // refetches the list only when that moved: refetching every time re-downloaded
  // the whole archive every 5 seconds, a pasted list of thousands of links included.
  useEffect(() => {
    if (!user || !live) return;
    let last: string | null = null;
    const check = async () => {
      if (document.hidden) return;
      const { data, count, error } = await supabase
        .from("archive_blocks" as any)
        .select("updated_at", { count: "exact" })
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) return;
      const fingerprint = `${count ?? 0}:${(data as any)?.[0]?.updated_at ?? ""}`;
      if (last !== null && fingerprint !== last) qc.invalidateQueries({ queryKey });
      last = fingerprint;
    };
    void check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, live]);

  // Refetch immediately when another part of the app (e.g. The AI assistant)
  // saves a note to the archive, so it shows up without waiting for the poll.
  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey });
    };
    window.addEventListener(ARCHIVE_BLOCKS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ARCHIVE_BLOCKS_CHANGED_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const blocks = query.data || [];
  const loading = query.isLoading && !query.data;

  const setBlocks = useCallback((updater: (prev: ArchiveBlock[]) => ArchiveBlock[]) => {
    qc.setQueryData<ArchiveBlock[]>(queryKey, (prev) => {
      return updater(prev || []);
    });
  }, [qc, user?.id]);

  const fetchBlocks = useCallback(async () => {
    await qc.invalidateQueries({ queryKey });
  }, [qc, user?.id]);

  const addBlock = async (block: Partial<ArchiveBlock>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("archive_blocks" as any)
      .insert({ ...block, user_id: user.id } as any)
      .select(BLOCK_COLUMNS)
      .single();
    if (error) {
      toast.error("Failed to save block");
      return null;
    }
    setBlocks((prev) => [(data as any), ...prev]);
    embedBlock((data as any).id);
    return data as any as ArchiveBlock;
  };

  /**
   * Insert in order, in requests of at most 100 blocks or ~1 MB. Throws
   * ArchiveSaveError on the first failure, saying how many made it, so the
   * caller can keep the rest instead of reporting a save that did not happen.
   */
  const addBlocks = async (newBlocks: Partial<ArchiveBlock>[]): Promise<ArchiveBlock[]> => {
    if (!user) throw new ArchiveSaveError("Not signed in", 0);
    const saved: ArchiveBlock[] = [];
    let failure: ArchiveSaveError | null = null;
    for (const batch of chunkForInsert(newBlocks)) {
      const rows = batch.map((b) => ({ ...b, user_id: user.id }));
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
      setBlocks((prev) => [...saved, ...prev]);
      void embedInBackground(saved.map((b) => b.id));
    }
    if (failure) throw failure;
    return saved;
  };

  /** Resolves whether the change was saved (a failure is toasted here). */
  const updateBlock = async (id: string, updates: Partial<ArchiveBlock>): Promise<boolean> => {
    const { error } = await supabase
      .from("archive_blocks" as any)
      .update(updates as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update block");
      return false;
    }
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
    if (updates.title !== undefined || updates.content !== undefined) {
      embedBlock(id);
    }
    return true;
  };

  /** Resolves whether the block was deleted (a failure is toasted here). */
  const deleteBlock = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from("archive_blocks" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete block");
      return false;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    return true;
  };

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
