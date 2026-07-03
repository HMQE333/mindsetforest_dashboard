import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useForestBlocks } from "@/hooks/useForestBlocks";

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
  const { blocked: blockedAuthors, blockAuthor, unblockAuthor } = useForestBlocks();
  const [mySeeds, setMySeeds] = useState<SeedWithAuthor[]>([]);
  const [discoverSeeds, setDiscoverSeeds] = useState<SeedWithAuthor[]>([]);
  const [myWaters, setMyWaters] = useState<Set<string>>(new Set());
  const [mySaves, setMySaves] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  // seed_id -> savedBlockId mapping for blocks I've saved that are now stale
  const [availableUpdates, setAvailableUpdates] = useState<Record<string, string>>({});

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
    let savedBlocksData: any[] = [];
    if (seedIds.length) {
      // Parallelize all secondary lookups in a single wave
      const [waterRes, saveRes, savedBlocksRes] = await Promise.all([
        supabase.from("forest_waters" as any).select("seed_id").eq("user_id", user.id).in("seed_id", seedIds),
        supabase.from("forest_saves" as any).select("seed_id").eq("user_id", user.id).in("seed_id", seedIds),
        (supabase as any)
          .from("archive_blocks")
          .select("id, from_seed_id, updated_at")
          .eq("user_id", user.id)
          .in("from_seed_id", seedIds),
      ]);
      ((waterRes.data as any) || []).forEach((r: any) => waterSet.add(r.seed_id));
      ((saveRes.data as any) || []).forEach((r: any) => saveSet.add(r.seed_id));
      savedBlocksData = (savedBlocksRes.data as any) || [];
    }
    setMyWaters(waterSet);
    setMySaves(saveSet);

    const myOwn = seeds.filter((s) => s.author_id === user.id);
    const fromOthers = seeds.filter(
      (s) => s.author_id !== user.id && s.is_active && !blockedAuthors.has(s.author_id),
    );

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

    // ----- Compute available updates (re-sync) -----
    // For each seed I've saved, check whether the seed's updated_at is newer than the
    // saved archive_block.updated_at. If so → an update is available.
    if (saveSet.size) {
      const seedById = new Map(seeds.map((s) => [s.id, s]));
      const updates: Record<string, string> = {};
      savedBlocksData.forEach((b: any) => {
        const seed = seedById.get(b.from_seed_id);
        if (!seed) return;
        const seedTs = new Date(seed.updated_at).getTime();
        const blockTs = new Date(b.updated_at).getTime();
        // 60s grace to ignore initial save round-trip drift
        if (seedTs - blockTs > 60_000) updates[b.from_seed_id] = b.id;
      });
      setAvailableUpdates(updates);
    } else {
      setAvailableUpdates({});
    }

    setLoading(false);
  }, [user, blockedAuthors]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    // Coalesce bursts of realtime events into a single refetch
    let pending: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        fetchAll();
      }, 800);
    };
    const ch = supabase
      .channel(`forest-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_seeds" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_waters" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_saves" }, scheduleRefetch)
      .subscribe();
    return () => {
      if (pending) clearTimeout(pending);
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

  // Per-session dedupe so scrolling past the same card doesn't re-hit the RPC
  const viewedRef = useRef<Set<string>>(new Set());
  const recordView = useCallback(async (seedId: string) => {
    if (viewedRef.current.has(seedId)) return;
    viewedRef.current.add(seedId);
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

  const semanticSearchForest = useCallback(async (query: string): Promise<SeedWithAuthor[]> => {
    const q = query.trim();
    if (q.length < 2) return [];
    const { data, error } = await supabase.functions.invoke("ai-embed-block", {
      body: { action: "search-forest", query: q },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Search failed");
      return [];
    }
    const results = ((data as any)?.results || []) as any[];
    // Enrich with author + my engagement state from already-loaded sets
    const knownAuthorMap: Record<string, ForestAuthor> = {};
    [...mySeeds, ...discoverSeeds].forEach((s) => {
      if (s.author) knownAuthorMap[s.author_id] = s.author;
    });
    const missingIds = Array.from(new Set(results.map((r) => r.author_id).filter((id) => !knownAuthorMap[id])));
    if (missingIds.length) {
      const { data: authors } = await supabase
        .from("user_profiles" as any)
        .select("user_id, username, display_name, avatar_emoji")
        .in("user_id", missingIds);
      ((authors as any) || []).forEach((a: any) => { knownAuthorMap[a.user_id] = a; });
    }
    return results
      .filter((s) => !blockedAuthors.has(s.author_id))
      .map((s) => ({
      ...s,
      author: knownAuthorMap[s.author_id],
      iWatered: myWaters.has(s.id),
      iSaved: mySaves.has(s.id),
      isEdited: new Date(s.updated_at).getTime() - new Date(s.published_at).getTime() > 60_000,
    }));
  }, [mySeeds, discoverSeeds, myWaters, mySaves, blockedAuthors]);

  // Re-sync a saved block to the latest seed content
  const resyncSavedBlock = useCallback(async (seedId: string) => {
    if (!user) return;
    const blockId = availableUpdates[seedId];
    if (!blockId) return;
    // Fetch latest seed via service-side RLS-allowed select
    const { data: seed } = await supabase
      .from("forest_seeds" as any)
      .select("title, content, pillars, directions, tags, source_url, updated_at")
      .eq("id", seedId)
      .single();
    if (!seed) {
      toast.error("Seed no longer accessible");
      return;
    }
    const tags = Array.from(new Set([...((seed as any).tags || []), "from-forest"]));
    const { error } = await supabase
      .from("archive_blocks" as any)
      .update({
        title: (seed as any).title,
        content: (seed as any).content,
        pillars: (seed as any).pillars,
        directions: (seed as any).directions,
        tags,
        source_url: (seed as any).source_url,
      } as any)
      .eq("id", blockId);
    if (error) {
      toast.error("Failed to re-sync");
      return;
    }
    toast.success("↻ Updated to author's latest version");
    setAvailableUpdates((prev) => {
      const next = { ...prev };
      delete next[seedId];
      return next;
    });
  }, [user, availableUpdates]);

  // Achievements (computed cheaply from currently-loaded data)
  const achievements = useMemo(() => {
    const planted = mySeeds.length;
    const watersGivenApprox = myWaters.size;
    const watersReceived = mySeeds.reduce((s, x) => s + (x.water_count || 0), 0);
    return [
      { id: "first-seed", icon: "🌱", title: "First Seed", description: "Plant 1 seed in the Forest", current: Math.min(planted, 1), target: 1, unlocked: planted >= 1 },
      { id: "grove-tender", icon: "🌳", title: "Grove Tender", description: "Plant 10 seeds", current: Math.min(planted, 10), target: 10, unlocked: planted >= 10 },
      { id: "generous", icon: "💧", title: "Generous", description: "Water 50 seeds", current: Math.min(watersGivenApprox, 50), target: 50, unlocked: watersGivenApprox >= 50 },
      { id: "beloved", icon: "🌟", title: "Beloved", description: "Receive 25 waters total", current: Math.min(watersReceived, 25), target: 25, unlocked: watersReceived >= 25 },
    ];
  }, [mySeeds, myWaters]);

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
    semanticSearchForest,
    achievements,
    refetch: fetchAll,
    availableUpdates,
    resyncSavedBlock,
    blockedAuthors,
    blockAuthor,
    unblockAuthor,
  };
}