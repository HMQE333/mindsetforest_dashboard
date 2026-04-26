import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ForestCollection {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  emoji: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  seedCount?: number;
  ownerName?: string;
}

/**
 * Curated bundles of Forest seeds. Owner CRUD + everyone can read public collections.
 * Seed membership is managed via forest_collection_seeds.
 */
export function useForestCollections() {
  const { user } = useAuth();
  const [mine, setMine] = useState<ForestCollection[]>([]);
  const [discover, setDiscover] = useState<ForestCollection[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: cols } = await supabase
      .from("forest_collections" as any)
      .select("id, owner_id, title, description, emoji, is_public, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const all = ((cols as any) || []) as ForestCollection[];

    // Counts + owner names in parallel
    const ids = all.map((c) => c.id);
    const ownerIds = Array.from(new Set(all.map((c) => c.owner_id)));
    const counts: Record<string, number> = {};
    const oMap: Record<string, string> = {};
    const [pairsRes, profsRes] = await Promise.all([
      ids.length
        ? supabase.from("forest_collection_seeds" as any).select("collection_id").in("collection_id", ids)
        : Promise.resolve({ data: [] as any }),
      ownerIds.length
        ? supabase.from("user_profiles" as any).select("user_id, display_name, username").in("user_id", ownerIds)
        : Promise.resolve({ data: [] as any }),
    ]);
    ((pairsRes.data as any) || []).forEach((p: any) => {
      counts[p.collection_id] = (counts[p.collection_id] || 0) + 1;
    });
    ((profsRes.data as any) || []).forEach((p: any) => {
      oMap[p.user_id] = p.display_name || `@${p.username}`;
    });

    const enriched = all.map((c) => ({ ...c, seedCount: counts[c.id] || 0, ownerName: oMap[c.owner_id] }));
    setMine(enriched.filter((c) => c.owner_id === user.id));
    setDiscover(enriched.filter((c) => c.owner_id !== user.id && c.is_public));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createCollection = useCallback(async (input: Partial<ForestCollection>) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("forest_collections" as any)
      .insert({
        owner_id: user.id,
        title: (input.title || "Untitled collection").slice(0, 80),
        description: (input.description || "").slice(0, 500),
        emoji: input.emoji || "📚",
        is_public: input.is_public ?? true,
      } as any)
      .select()
      .single();
    if (error) {
      toast.error(String(error.message).includes("rate_exceeded") ? "Daily limit reached (5 collections / day)" : "Failed to create");
      return null;
    }
    toast.success("📚 Collection created");
    fetchAll();
    return data as any as ForestCollection;
  }, [user, fetchAll]);

  const deleteCollection = useCallback(async (id: string) => {
    const { error } = await supabase.from("forest_collections" as any).delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Collection deleted");
    fetchAll();
  }, [fetchAll]);

  const addSeedToCollection = useCallback(async (collectionId: string, seedId: string) => {
    const { error } = await supabase
      .from("forest_collection_seeds" as any)
      .insert({ collection_id: collectionId, seed_id: seedId } as any);
    if (error && !String(error.message).includes("duplicate")) {
      toast.error("Failed to add to collection");
      return;
    }
    toast.success("Added to collection 📚");
    fetchAll();
  }, [fetchAll]);

  const removeSeedFromCollection = useCallback(async (collectionId: string, seedId: string) => {
    const { error } = await supabase
      .from("forest_collection_seeds" as any)
      .delete()
      .eq("collection_id", collectionId)
      .eq("seed_id", seedId);
    if (error) { toast.error("Failed to remove"); return; }
    fetchAll();
  }, [fetchAll]);

  const fetchCollectionSeedIds = useCallback(async (collectionId: string): Promise<string[]> => {
    const { data } = await supabase
      .from("forest_collection_seeds" as any)
      .select("seed_id, sort_order")
      .eq("collection_id", collectionId)
      .order("sort_order", { ascending: true });
    return ((data as any) || []).map((r: any) => r.seed_id);
  }, []);

  return {
    loading, mine, discover,
    createCollection, deleteCollection,
    addSeedToCollection, removeSeedFromCollection,
    fetchCollectionSeedIds,
    refetch: fetchAll,
  };
}