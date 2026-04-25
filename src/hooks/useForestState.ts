import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface ForestSeed {
  id: string;
  author_id: string;
  source_block_id: string | null;
  title: string;
  content: string;
  pillars: string[];
  directions: string[];
  tags: string[];
  source_url: string | null;
  visibility: "public" | "friends" | "custom";
  language: string;
  is_active: boolean;
  water_count: number;
  save_count: number;
  view_count: number;
  published_at: string;
  updated_at: string;
}

export interface ForestAuthor {
  user_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
}

export interface SeedWithAuthor extends ForestSeed {
  author?: ForestAuthor;
  iWatered?: boolean;
  iSaved?: boolean;
  isEdited?: boolean;
}

export type PlantInput = {
  blockId: string;
  visibility: "public" | "friends" | "custom";
  audienceUserIds?: string[];
  edits?: Partial<Pick<ForestSeed, "title" | "content" | "pillars" | "directions" | "tags" | "source_url">>;
};

export function useForestState() {
  const { user } = useAuth();
  const [mySeeds, setMySeeds] = useState<SeedWithAuthor[]>([]);
  const [discoverSeeds, setDiscoverSeeds] = useState<SeedWithAuthor[]>([]);
  const [myWaters, setMyWaters] = useState<Set<string>>(new Set());
  const [mySaves, setMySaves] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const enrich = useCallback(
    (seeds: ForestSeed[], authors: Record<string, ForestAuthor>): SeedWithAuthor[] =>
      seeds.map((s) => ({
        ...s,
        author: authors[s.author_id],
        iWatered: myWaters.has(s.id),
        iSaved: mySaves.has(s.id),
        isEdited: new Date(s.updated_at).getTime() - new Date(s.published_at).getTime() > 60_000,
      })),
    [myWaters, mySaves],
  );

  const fetchAll = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Discover: RLS already filters to what we can see; exclude our own
    const { data: allSeeds } = await supabase
      .from("forest_seeds" as any)
      .select("id, author_id, source_block_id, title, content, pillars, directions, tags, source_url, visibility, language, is_active, water_count, save_count, view_count, published_at, updated_at")
      .order("published_at", { ascending: false })
      .limit(200);

    const seeds = ((allSeeds as any) || []) as ForestSeed[];
    const authorIds = Array.from(new Set(seeds.map((s) => s.author_id)));

    let authorMap: Record<string, ForestAuthor> = {};
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from("user_profiles" as any)
        .select("user_id, username, display_name, avatar_emoji")
        .in("user_id", authorIds);
      ((authors as any) || []).forEach((a: any) => {
        authorMap[a.user_id] = a;
      });
    }

    const seedIds = seeds.map((s) => s.id);
    let waterSet = new Set<string>();
    let saveSet = new Set<string>();
    if (seedIds.length) {
      const [{ data: w }, { data: sv }] = await Promise.all([
        supabase.from("forest_waters" as any).select("seed_id").eq("user_id", user.id).in("seed_id", seedIds),
        supabase.from("forest_saves" as any).select("seed_id").eq("user_id", user.id).in("seed_id", seedIds),
      ]);
      ((w as any) || []).forEach((r: any) => waterSet.add(r.seed_id));
      ((sv as any) || []).forEach((r: any) => saveSet.add(r.seed_id));
    }
    setMyWaters(waterSet);
    setMySaves(saveSet);

    const myOwn = seeds.filter((s) => s.author_id === user.id);
    const fromOthers = seeds.filter((s) => s.author_id !== user.id && s.is_active);

    const enriched = (list: ForestSeed[]) =>
      list.map((s) => ({
        ...s,
        author: authorMap[s.author_id],
        iWatered: waterSet.has(s.id),
        iSaved: saveSet.has(s.id),
        isEdited: new Date(s.updated_at).getTime() - new Date(s.published_at).getTime() > 60_000,
      }));

    setMySeeds(enriched(myOwn));
    setDiscoverSeeds(enriched(fromOthers));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`forest-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_seeds" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_waters" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_saves" }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, fetchAll]);

  // ---------------- Actions ----------------

  const plantSeed = useCallback(async (input: PlantInput) => {
    const { data, error } = await supabase.functions.invoke("forest-publish-seed", { body: input });
    if (error || (data as any)?.error) {
      const msg = (data as any)?.message || (data as any)?.error || error?.message || "Failed to plant seed";
      toast.error(msg);
      return null;
    }
    toast.success("🌱 Planted in the Forest");
    fetchAll();
    return (data as any)?.seed as ForestSeed;
  }, [fetchAll]);

  const updateSeed = useCallback(async (
    id: string,
    updates: Partial<Pick<ForestSeed, "title" | "content" | "pillars" | "directions" | "tags" | "source_url" | "visibility">>,
  ) => {
    const { error } = await supabase.from("forest_seeds" as any).update(updates as any).eq("id", id);
    if (error) {
      toast.error("Failed to update seed");
      return;
    }
    fetchAll();
  }, [fetchAll]);

  const unpublishSeed = useCallback(async (id: string) => {
    const { error } = await supabase.from("forest_seeds" as any).update({ is_active: false } as any).eq("id", id);
    if (error) {
      toast.error("Failed to unpublish");
      return;
    }
    toast.success("🌑 Seed unpublished");
    fetchAll();
  }, [fetchAll]);

  const republishSeed = useCallback(async (id: string) => {
    const { error } = await supabase.from("forest_seeds" as any).update({ is_active: true } as any).eq("id", id);
    if (error) {
      toast.error("Failed to republish");
      return;
    }
    toast.success("🌱 Seed republished");
    fetchAll();
  }, [fetchAll]);

  const deleteSeed = useCallback(async (id: string) => {
    const { error } = await supabase.from("forest_seeds" as any).delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Seed deleted");
    fetchAll();
  }, [fetchAll]);

  const waterSeed = useCallback(async (seedId: string) => {
    if (!user) return;
    if (myWaters.has(seedId)) {
      // unwater
      const { error } = await supabase.from("forest_waters" as any).delete().eq("seed_id", seedId).eq("user_id", user.id);
      if (error) return;
      const next = new Set(myWaters);
      next.delete(seedId);
      setMyWaters(next);
    } else {
      const { error } = await supabase.from("forest_waters" as any).insert({ seed_id: seedId, user_id: user.id } as any);
      if (error) return;
      const next = new Set(myWaters);
      next.add(seedId);
      setMyWaters(next);
    }
  }, [user, myWaters]);

  const saveSeed = useCallback(async (seedId: string) => {
    const { data, error } = await supabase.functions.invoke("forest-save-seed", { body: { seedId } });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Failed to save");
      return null;
    }
    if ((data as any)?.alreadySaved) {
      toast.info("Already in your Archive");
    } else {
      toast.success("📥 Saved to your Archive");
    }
    const next = new Set(mySaves);
    next.add(seedId);
    setMySaves(next);
    return (data as any)?.savedBlockId as string;
  }, [mySaves]);

  const recordView = useCallback(async (seedId: string) => {
    await supabase.rpc("forest_view_seed" as any, { _seed_id: seedId });
  }, []);

  const reportSeed = useCallback(async (seedId: string, reason: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("forest_reports" as any)
      .insert({ seed_id: seedId, reporter_id: user.id, reason: reason.slice(0, 500) } as any);
    if (error) {
      toast.error("Failed to report");
      return;
    }
    toast.success("🚩 Reported. Thanks for keeping the Forest healthy.");
  }, [user]);

  const setAudience = useCallback(async (seedId: string, audienceUserIds: string[]) => {
    // Replace audience
    await supabase.from("forest_seed_audience" as any).delete().eq("seed_id", seedId);
    if (audienceUserIds.length) {
      const rows = audienceUserIds.map((uid) => ({ seed_id: seedId, user_id: uid }));
      await supabase.from("forest_seed_audience" as any).insert(rows as any);
    }
  }, []);

  return {
    loading,
    mySeeds,
    discoverSeeds,
    plantSeed,
    updateSeed,
    unpublishSeed,
    republishSeed,
    deleteSeed,
    waterSeed,
    saveSeed,
    recordView,
    reportSeed,
    setAudience,
    refetch: fetchAll,
  };
}