import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface LibraryShare {
  id: string;
  user_id: string;
  name: string;
  tab: "books" | "courses";
  filters: Record<string, any>;
  is_public: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export function useLibraryShares() {
  const { user } = useAuth();
  const [shares, setShares] = useState<LibraryShare[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShares = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("library_shares" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) { toast.error("Failed to load shares"); setLoading(false); return; }
    setShares((data || []) as unknown as LibraryShare[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchShares(); }, [fetchShares]);

  const createShare = useCallback(async (payload: { name: string; tab: "books" | "courses"; filters: Record<string, any>; is_public?: boolean }) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("library_shares" as any)
      .insert([{
        user_id: user.id,
        name: payload.name || "My Library",
        tab: payload.tab,
        filters: payload.filters,
        is_public: payload.is_public ?? true,
      }] as any)
      .select("*")
      .single();
    if (error) { toast.error("Failed to create share"); return null; }
    toast.success("Share link created!");
    fetchShares();
    return data as unknown as LibraryShare;
  }, [user, fetchShares]);

  const updateShare = useCallback(async (id: string, patch: Partial<LibraryShare>) => {
    if (!user) return;
    const { error } = await supabase
      .from("library_shares" as any)
      .update(patch as any)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update share"); return; }
    fetchShares();
  }, [user, fetchShares]);

  const deleteShare = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("library_shares" as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to delete share"); return; }
    toast.success("Share removed");
    fetchShares();
  }, [user, fetchShares]);

  const togglePublic = useCallback(async (id: string, is_public: boolean) => {
    await updateShare(id, { is_public });
  }, [updateShare]);

  return { shares, loading, createShare, updateShare, deleteShare, togglePublic, refetch: fetchShares };
}