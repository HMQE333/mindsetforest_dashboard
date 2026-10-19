import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

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

/** Everything the Forest views read, fetched once for all of them. */
interface ForestData {
  /** Up to 200 seeds the user can see (RLS decides), newest first, own and others'. */
  seeds: SeedWithAuthor[];
  waters: Set<string>;
  saves: Set<string>;
  /** seed id -> saved archive block id, for saved seeds their author has changed since. */
  availableUpdates: Record<string, string>;
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const forestKey = (uid: string | undefined) => ["forest", uid] as const;
const blockedKey = (uid: string | undefined) => ["forest_blocks", uid] as const;
const isEdited = (s: ForestSeed) => new Date(s.updated_at).getTime() - new Date(s.published_at).getTime() > 60_000;

async function loadForest(userId: string): Promise<ForestData> {
  // RLS already filters to what the user can see.
  const { data: allSeeds } = await supabase
    .from("forest_seeds" as any)
    .select("id, author_id, source_block_id, title, content, pillars, directions, tags, source_url, visibility, language, is_active, water_count, save_count, view_count, published_at, updated_at")
    .order("published_at", { ascending: false })
    .limit(200);
  const seeds = ((allSeeds as any) || []) as ForestSeed[];
  const authorIds = Array.from(new Set(seeds.map((s) => s.author_id)));
  const seedIds = seeds.map((s) => s.id);

  const authors: Record<string, ForestAuthor> = {};
  const waters = new Set<string>();
  const saves = new Set<string>();
  let savedBlocks: { id: string; from_seed_id: string; updated_at: string }[] = [];
  // Authors and the user's own marks, in one wave.
  const [authorRes, waterRes, saveRes, savedRes] = await Promise.all([
    authorIds.length
      ? supabase.from("user_profiles" as any).select("user_id, username, display_name, avatar_emoji").in("user_id", authorIds)
      : Promise.resolve({ data: [] as any[] }),
    seedIds.length ? supabase.from("forest_waters" as any).select("seed_id").eq("user_id", userId).in("seed_id", seedIds) : Promise.resolve({ data: [] as any[] }),
    seedIds.length ? supabase.from("forest_saves" as any).select("seed_id").eq("user_id", userId).in("seed_id", seedIds) : Promise.resolve({ data: [] as any[] }),
    seedIds.length
      ? (supabase as any).from("archive_blocks").select("id, from_seed_id, updated_at").eq("user_id", userId).in("from_seed_id", seedIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  ((authorRes.data as any) || []).forEach((a: ForestAuthor) => { authors[a.user_id] = a; });
  ((waterRes.data as any) || []).forEach((r: any) => waters.add(r.seed_id));
  ((saveRes.data as any) || []).forEach((r: any) => saves.add(r.seed_id));
  savedBlocks = (savedRes.data as any) || [];

  // A saved seed whose author changed it more than a minute after the copy was made can be re-synced.
  const availableUpdates: Record<string, string> = {};
  if (saves.size) {
    const seedById = new Map(seeds.map((s) => [s.id, s]));
    for (const b of savedBlocks) {
      const seed = seedById.get(b.from_seed_id);
      if (seed && new Date(seed.updated_at).getTime() - new Date(b.updated_at).getTime() > 60_000) availableUpdates[b.from_seed_id] = b.id;
    }
  }

  return {
    seeds: seeds.map((s) => ({ ...s, author: authors[s.author_id], iWatered: waters.has(s.id), iSaved: saves.has(s.id), isEdited: isEdited(s) })),
    waters,
    saves,
    availableUpdates,
  };
}

/**
 * One realtime channel for every mounted Forest view. Each view used to
 * open its own under the same topic, closing the one before it (one per
 * seed card), and to refetch everything when it did.
 */
let channel: { userId: string; users: number; close: () => void } | null = null;

function acquireForestChannel(userId: string, qc: QueryClient): () => void {
  if (channel && channel.userId !== userId) {
    channel.close();
    channel = null;
  }
  if (!channel) {
    let pending: ReturnType<typeof setTimeout> | null = null;
    // Bursts of changes become one refetch.
    const changed = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        void qc.invalidateQueries({ queryKey: forestKey(userId) });
      }, 800);
    };
    const topic = `forest-${userId}`;
    // A channel left from an earlier mount or HMR under the same topic would throw on .on() after subscribe().
    supabase.getChannels().filter((c) => c.topic === `realtime:${topic}`).forEach((c) => supabase.removeChannel(c));
    const ch = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_seeds" }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_waters" }, changed)
      .on("postgres_changes", { event: "*", schema: "public", table: "forest_saves" }, changed)
      .subscribe();
    channel = {
      userId,
      users: 0,
      close: () => {
        if (pending) clearTimeout(pending);
        void supabase.removeChannel(ch);
      },
    };
  }
  const mine = channel;
  mine.users++;
  return () => {
    mine.users--;
    if (mine.users === 0 && channel === mine) {
      mine.close();
      channel = null;
    }
  };
}

/** Seeds already counted as viewed in this page load, so scrolling past a card again does not call the RPC. */
const viewed = new Set<string>();

/**
 * The Forest: seeds, the user's waters and saves, blocked authors and the
 * actions on them. Every component that calls it shares one fetch and one
 * realtime channel (React Query under the key ["forest", uid]), so a list
 * of seed cards costs the same as one card.
 */
export function useForestState() {
  const { user } = useAuth();
  const userId = user?.id;
  const qc = useQueryClient();

  const query = useQuery<ForestData>({
    queryKey: forestKey(userId),
    enabled: !!userId,
    // Realtime and the actions keep it current; a newly mounted card must not refetch it.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => loadForest(userId!),
  });

  const blockedQuery = useQuery<Set<string>>({
    queryKey: blockedKey(userId),
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("forest_blocks" as any).select("blocked_id").eq("blocker_id", userId!);
      return new Set(((data as any) || []).map((r: any) => r.blocked_id as string));
    },
  });

  useEffect(() => {
    if (!userId) return;
    return acquireForestChannel(userId, qc);
  }, [userId, qc]);

  const data = query.data;
  const blockedAuthors = (blockedQuery.data ?? EMPTY_SET) as Set<string>;
  const myWaters = (data?.waters ?? EMPTY_SET) as Set<string>;
  const mySaves = (data?.saves ?? EMPTY_SET) as Set<string>;
  const availableUpdates = useMemo(() => data?.availableUpdates ?? {}, [data]);

  const mySeeds = useMemo(() => (data && userId ? data.seeds.filter((s) => s.author_id === userId) : []), [data, userId]);
  const discoverSeeds = useMemo(
    () => (data && userId ? data.seeds.filter((s) => s.author_id !== userId && s.is_active && !blockedAuthors.has(s.author_id)) : []),
    [data, userId, blockedAuthors],
  );

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey: forestKey(userId) }), [qc, userId]);
  /** Change the shared data in place (the user's own marks), every view at once. */
  const patch = useCallback((fn: (d: ForestData) => ForestData) => {
    qc.setQueryData<ForestData>(forestKey(userId), (d) => (d ? fn(d) : d));
  }, [qc, userId]);
  const mark = useCallback((d: ForestData, waters: Set<string>, saves: Set<string>): ForestData => ({
    ...d,
    waters,
    saves,
    seeds: d.seeds.map((s) => (waters.has(s.id) === !!s.iWatered && saves.has(s.id) === !!s.iSaved ? s : { ...s, iWatered: waters.has(s.id), iSaved: saves.has(s.id) })),
  }), []);

  // ---------------- Actions ----------------

  const plantSeed = useCallback(async (input: PlantInput) => {
    const { data, error } = await supabase.functions.invoke("forest-publish-seed", { body: input });
    if (error || (data as any)?.error) {
      const msg = (data as any)?.message || (data as any)?.error || error?.message || "Failed to plant seed";
      toast.error(msg);
      return null;
    }
    toast.success("🌱 Planted in the Forest");
    void refetch();
    return (data as any)?.seed as ForestSeed;
  }, [refetch]);

  const updateSeed = useCallback(async (
    id: string,
    updates: Partial<Pick<ForestSeed, "title" | "content" | "pillars" | "directions" | "tags" | "source_url" | "visibility">>,
  ) => {
    const { error } = await supabase.from("forest_seeds" as any).update(updates as any).eq("id", id);
    if (error) {
      toast.error("Failed to update seed");
      return;
    }
    void refetch();
  }, [refetch]);

  const setActive = useCallback(async (id: string, active: boolean) => {
    const { error } = await supabase.from("forest_seeds" as any).update({ is_active: active } as any).eq("id", id);
    if (error) {
      toast.error(active ? "Failed to republish" : "Failed to unpublish");
      return;
    }
    toast.success(active ? "🌱 Seed republished" : "🌑 Seed unpublished");
    void refetch();
  }, [refetch]);
  const unpublishSeed = useCallback((id: string) => setActive(id, false), [setActive]);
  const republishSeed = useCallback((id: string) => setActive(id, true), [setActive]);

  const deleteSeed = useCallback(async (id: string) => {
    const { error } = await supabase.from("forest_seeds" as any).delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("Seed deleted");
    void refetch();
  }, [refetch]);

  const waterSeed = useCallback(async (seedId: string) => {
    if (!userId) return;
    if (myWaters.has(seedId)) {
      const { error } = await supabase.from("forest_waters" as any).delete().eq("seed_id", seedId).eq("user_id", userId);
      if (error) return;
      patch((d) => {
        const next = new Set(d.waters);
        next.delete(seedId);
        return mark(d, next, d.saves);
      });
    } else {
      const { error } = await supabase.from("forest_waters" as any).insert({ seed_id: seedId, user_id: userId } as any);
      if (error) return;
      patch((d) => mark(d, new Set(d.waters).add(seedId), d.saves));
    }
  }, [userId, myWaters, patch, mark]);

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
    patch((d) => mark(d, d.waters, new Set(d.saves).add(seedId)));
    return (data as any)?.savedBlockId as string;
  }, [patch, mark]);

  const recordView = useCallback(async (seedId: string) => {
    if (viewed.has(seedId)) return;
    viewed.add(seedId);
    await supabase.rpc("forest_view_seed" as any, { _seed_id: seedId });
  }, []);

  const reportSeed = useCallback(async (seedId: string, reason: string) => {
    if (!userId) return;
    const { error } = await supabase
      .from("forest_reports" as any)
      .insert({ seed_id: seedId, reporter_id: userId, reason: reason.slice(0, 500) } as any);
    if (error) {
      toast.error("Failed to report");
      return;
    }
    toast.success("🚩 Reported. Thanks for keeping the Forest healthy.");
  }, [userId]);

  const setAudience = useCallback(async (seedId: string, audienceUserIds: string[]) => {
    // Replace audience
    await supabase.from("forest_seed_audience" as any).delete().eq("seed_id", seedId);
    if (audienceUserIds.length) {
      const rows = audienceUserIds.map((uid) => ({ seed_id: seedId, user_id: uid }));
      await supabase.from("forest_seed_audience" as any).insert(rows as any);
    }
  }, []);

  const semanticSearchForest = useCallback(async (q0: string): Promise<SeedWithAuthor[]> => {
    const q = q0.trim();
    if (q.length < 2) return [];
    const { data: res, error } = await supabase.functions.invoke("ai-embed-block", {
      body: { action: "search-forest", query: q },
    });
    if (error || (res as any)?.error) {
      toast.error((res as any)?.error || error?.message || "Search failed");
      return [];
    }
    const results = ((res as any)?.results || []) as any[];
    // Authors already loaded, the rest fetched.
    const knownAuthorMap: Record<string, ForestAuthor> = {};
    (data?.seeds ?? []).forEach((s) => {
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
        isEdited: isEdited(s),
      }));
  }, [data, myWaters, mySaves, blockedAuthors]);

  // Re-sync a saved block to the latest seed content
  const resyncSavedBlock = useCallback(async (seedId: string) => {
    if (!userId) return;
    const blockId = availableUpdates[seedId];
    if (!blockId) return;
    if (await resyncBlock(seedId, blockId)) {
      patch((d) => {
        const next = { ...d.availableUpdates };
        delete next[seedId];
        return { ...d, availableUpdates: next };
      });
    }
  }, [userId, availableUpdates, patch]);

  const blockAuthor = useCallback(async (authorId: string) => {
    if (!userId) return;
    if (authorId === userId) {
      toast.error("You can't block yourself");
      return;
    }
    const { error } = await supabase.from("forest_blocks" as any).insert({ blocker_id: userId, blocked_id: authorId } as any);
    if (error && !String(error.message).includes("duplicate")) {
      toast.error("Failed to block");
      return;
    }
    qc.setQueryData<Set<string>>(blockedKey(userId), (prev) => new Set(prev ?? []).add(authorId));
    toast.success("🚫 Author blocked. Their seeds are hidden from your Forest.");
  }, [userId, qc]);

  const unblockAuthor = useCallback(async (authorId: string) => {
    if (!userId) return;
    const { error } = await supabase.from("forest_blocks" as any).delete().eq("blocker_id", userId).eq("blocked_id", authorId);
    if (error) {
      toast.error("Failed to unblock");
      return;
    }
    qc.setQueryData<Set<string>>(blockedKey(userId), (prev) => {
      const next = new Set(prev ?? []);
      next.delete(authorId);
      return next;
    });
    toast.success("Author unblocked");
  }, [userId, qc]);

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
    loading: !!userId && query.isLoading,
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
    refetch,
    availableUpdates,
    resyncSavedBlock,
    blockedAuthors,
    blockAuthor,
    unblockAuthor,
  };
}

/** Copy a seed's current content over the archive block saved from it. Resolves whether it was written. */
async function resyncBlock(seedId: string, blockId: string): Promise<boolean> {
  const { data: seed } = await supabase
    .from("forest_seeds" as any)
    .select("title, content, pillars, directions, tags, source_url, updated_at")
    .eq("id", seedId)
    .single();
  if (!seed) {
    toast.error("Seed no longer accessible");
    return false;
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
    return false;
  }
  toast.success("↻ Updated to author's latest version");
  return true;
}

/**
 * The Library's "Update" badge on notes saved from the Forest, without the
 * Forest: one small read of those seeds' change times, and only when some
 * note came from a seed (none do for most users, so no request at all).
 * No realtime; it is read again when the Library mounts after five minutes.
 */
export function useSavedSeedUpdates(blocks: ArchiveBlock[], onResynced?: () => void) {
  const { user } = useAuth();
  const userId = user?.id;
  const saved = useMemo(() => blocks.filter((b) => !!b.from_seed_id), [blocks]);
  const seedIds = useMemo(() => [...new Set(saved.map((b) => b.from_seed_id!))].sort(), [saved]);
  const query = useQuery<{ id: string; updated_at: string }[]>({
    queryKey: ["forest_seed_versions", userId, seedIds.join(",")],
    enabled: !!userId && seedIds.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase.from("forest_seeds" as any).select("id, updated_at").in("id", seedIds);
      return ((data as any) || []) as { id: string; updated_at: string }[];
    },
  });
  const [done, setDone] = useState<ReadonlySet<string>>(EMPTY_SET);
  const availableUpdates = useMemo(() => {
    const out: Record<string, string> = {};
    if (!query.data?.length) return out;
    const seedTime = new Map(query.data.map((s) => [s.id, new Date(s.updated_at).getTime()]));
    for (const b of saved) {
      const t = seedTime.get(b.from_seed_id!);
      if (t !== undefined && !done.has(b.from_seed_id!) && t - new Date(b.updated_at).getTime() > 60_000) out[b.from_seed_id!] = b.id;
    }
    return out;
  }, [query.data, saved, done]);
  const updatesRef = useStableRef(availableUpdates);
  const resync = useCallback(async (seedId: string) => {
    const blockId = updatesRef.current[seedId];
    if (!blockId || !(await resyncBlock(seedId, blockId))) return;
    setDone((prev) => new Set(prev).add(seedId));
    onResynced?.();
  }, [updatesRef, onResynced]);
  return { availableUpdates, resync };
}

/** A ref that always holds the latest value, for callbacks that must keep one identity. */
function useStableRef<T>(value: T) {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}
