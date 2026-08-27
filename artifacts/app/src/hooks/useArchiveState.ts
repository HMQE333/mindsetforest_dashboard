import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ARCHIVE_BLOCKS_CHANGED_EVENT, type ArchiveBlock } from "@/lib/archive-data";
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

export function useArchiveState() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = ["archive_blocks", user?.id];

  const query = useQuery<ArchiveBlock[]>({
    queryKey,
    enabled: !!user,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("archive_blocks" as any)
        .select("*")
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

  // Polling: refetch every 5s to keep archive in sync across devices/windows.
  // Much simpler than Realtime subscriptions and avoids supabase-js channel API issues.
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey });
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      .select()
      .single();
    if (error) {
      toast.error("Failed to save block");
      return null;
    }
    setBlocks((prev) => [(data as any), ...prev]);
    embedBlock((data as any).id);
    return data as any as ArchiveBlock;
  };

  const addBlocks = async (newBlocks: Partial<ArchiveBlock>[]) => {
    if (!user) return;
    const rows = newBlocks.map((b) => ({ ...b, user_id: user.id }));
    const { data, error } = await supabase
      .from("archive_blocks" as any)
      .insert(rows as any)
      .select();
    if (error) {
      toast.error("Failed to save blocks");
      return;
    }
    setBlocks((prev) => [...((data as any) || []), ...prev]);
    for (const d of (data as any) || []) {
      embedBlock(d.id);
    }
  };

  const updateBlock = async (id: string, updates: Partial<ArchiveBlock>) => {
    const { error } = await supabase
      .from("archive_blocks" as any)
      .update(updates as any)
      .eq("id", id);
    if (error) {
      toast.error("Failed to update block");
      return;
    }
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...updates } : b))
    );
    if (updates.title !== undefined || updates.content !== undefined) {
      embedBlock(id);
    }
  };

  const deleteBlock = async (id: string) => {
    const { error } = await supabase
      .from("archive_blocks" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete block");
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const semanticSearch = useCallback(async (query: string): Promise<ArchiveBlock[]> => {
    try {
      const { data, error } = await supabase.functions.invoke("ai-embed-block", {
        body: { action: "search", query },
      });
      if (error) throw error;
      return (data?.results || []) as ArchiveBlock[];
    } catch (e) {
      console.error("Semantic search error:", e);
      return [];
    }
  }, []);

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

  return { blocks, loading, fetchBlocks, addBlock, addBlocks, updateBlock, deleteBlock, semanticSearch, embedAll };
}
