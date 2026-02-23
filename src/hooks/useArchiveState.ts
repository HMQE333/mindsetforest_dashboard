import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ArchiveBlock } from "@/lib/archive-data";
import { toast } from "sonner";

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

  return { blocks, loading, fetchBlocks, addBlock, addBlocks, updateBlock, deleteBlock };
}
