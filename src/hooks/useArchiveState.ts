import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ArchiveBlock } from "@/lib/archive-data";
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

export function useArchiveState() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<ArchiveBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("archive_blocks" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetch archive error:", error);
      toast.error("Failed to load archive");
    } else {
      setBlocks((data as any) || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

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
    // Fire-and-forget embedding
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
    // Fire-and-forget embed all new blocks
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
    // Re-embed if title or content changed
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
