import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { type ArchiveBlock } from "@/lib/data";
import { useAuth } from "./useAuth";

export function useArchive() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<ArchiveBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (!user) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("archive_blocks" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("archive load error:", error.message);
      setLoading(false);
      return;
    }
    setBlocks(((data as any) || []) as ArchiveBlock[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const addBlock = useCallback(
    async (block: Partial<ArchiveBlock>) => {
      if (!user) return;
      const { data, error } = await supabase
        .from("archive_blocks" as any)
        .insert({ ...block, user_id: user.id } as any)
        .select()
        .single();
      if (error) {
        console.error("archive add error:", error.message);
        return;
      }
      setBlocks((prev) => [data as any, ...prev]);
    },
    [user],
  );

  const deleteBlock = useCallback(async (id: string) => {
    const { error } = await supabase.from("archive_blocks" as any).delete().eq("id", id);
    if (error) {
      console.error("archive delete error:", error.message);
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const togglePin = useCallback(
    async (id: string, isPinned: boolean) => {
      const { error } = await supabase
        .from("archive_blocks" as any)
        .update({ is_pinned: !isPinned } as any)
        .eq("id", id);
      if (error) {
        console.error("archive pin error:", error.message);
        return;
      }
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, is_pinned: !isPinned } : b)));
    },
    [],
  );

  return { blocks, loading, addBlock, deleteBlock, togglePin, refetch: fetchBlocks };
}
