import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ForestInboxEvent {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  seed_id: string | null;
  kind: "friend_planted" | "seed_watered" | "seed_saved";
  read_at: string | null;
  created_at: string;
  // joined
  actor?: { username: string; display_name: string; avatar_emoji: string };
  seed?: { title: string };
}

/**
 * Forest activity feed: friends planting, waters and saves on my seeds.
 * Read-only for the recipient; rows are inserted server-side via triggers.
 */
export function useForestInbox() {
  const { user } = useAuth();
  const [events, setEvents] = useState<ForestInboxEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("forest_inbox_events" as any)
      .select("id, recipient_id, actor_id, seed_id, kind, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = ((data as any) || []) as ForestInboxEvent[];

    // Enrich with actor + seed in two batched queries
    const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]));
    const seedIds = Array.from(new Set(rows.map((r) => r.seed_id).filter(Boolean) as string[]));
    const [{ data: actors }, { data: seeds }] = await Promise.all([
      actorIds.length
        ? supabase.from("user_profiles" as any).select("user_id, username, display_name, avatar_emoji").in("user_id", actorIds)
        : Promise.resolve({ data: [] as any }),
      seedIds.length
        ? supabase.from("forest_seeds" as any).select("id, title").in("id", seedIds)
        : Promise.resolve({ data: [] as any }),
    ]);
    const aMap: Record<string, any> = {};
    ((actors as any) || []).forEach((a: any) => { aMap[a.user_id] = a; });
    const sMap: Record<string, any> = {};
    ((seeds as any) || []).forEach((s: any) => { sMap[s.id] = s; });

    setEvents(
      rows.map((r) => ({
        ...r,
        actor: r.actor_id ? aMap[r.actor_id] : undefined,
        seed: r.seed_id ? sMap[r.seed_id] : undefined,
      })),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Realtime: any change on my events row → refresh
  useEffect(() => {
    if (!user) return;
    const topic = `forest-inbox-${user.id}`;
    // Remove any stale channel with the same topic left over from a previous
    // mount/HMR; re-using an already-subscribed channel throws when adding
    // `postgres_changes` callbacks after `subscribe()`.
    supabase
      .getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => supabase.removeChannel(c));
    const ch = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forest_inbox_events", filter: `recipient_id=eq.${user.id}` },
        () => fetchEvents(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchEvents]);

  const unreadCount = useMemo(() => events.filter((e) => !e.read_at).length, [events]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const unread = events.filter((e) => !e.read_at).map((e) => e.id);
    if (!unread.length) return;
    setEvents((prev) => prev.map((e) => (unread.includes(e.id) ? { ...e, read_at: new Date().toISOString() } : e)));
    await supabase.from("forest_inbox_events" as any).update({ read_at: new Date().toISOString() } as any).in("id", unread);
  }, [events, user]);

  const markRead = useCallback(async (id: string) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read_at: new Date().toISOString() } : e)));
    await supabase.from("forest_inbox_events" as any).update({ read_at: new Date().toISOString() } as any).eq("id", id);
  }, []);

  const clearRead = useCallback(async () => {
    if (!user) return;
    await supabase.from("forest_inbox_events" as any).delete().eq("recipient_id", user.id).not("read_at", "is", null);
    fetchEvents();
  }, [user, fetchEvents]);

  return { events, loading, unreadCount, markAllRead, markRead, clearRead, refetch: fetchEvents };
}