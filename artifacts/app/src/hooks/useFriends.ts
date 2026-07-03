import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface FriendshipRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "blocked";
  promises: string[];
  share_from_requester: boolean;
  share_from_recipient: boolean;
  created_at: string;
  updated_at: string;
}

export interface FriendProfile {
  user_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
}

export interface FriendWithProfile {
  friendship: FriendshipRow;
  friend: FriendProfile;
  /** Whether THE OTHER side enabled sharing with us */
  theyShareWithMe: boolean;
  /** Whether WE enabled sharing with them */
  iShareWithThem: boolean;
}

export interface SuggestionRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  note: string;
  source: string;
  status: "pending" | "accepted" | "declined";
  resulting_task_id: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface SuggestionWithSender extends SuggestionRow {
  senderProfile?: FriendProfile;
}

function normalizePromises(p: any): string[] {
  if (Array.isArray(p)) {
    const out = p.slice(0, 3).map(x => typeof x === "string" ? x : "");
    while (out.length < 3) out.push("");
    return out;
  }
  return ["", "", ""];
}

export function useFriends() {
  const { user } = useAuth();
  const [friendships, setFriendships] = useState<FriendshipRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FriendProfile>>({});
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);

    const [{ data: friendData }, { data: sugData }] = await Promise.all([
      supabase
        .from("friendships" as any)
        .select("*")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
      supabase
        .from("friend_suggestions" as any)
        .select("*")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false }),
    ]);

    const fs = ((friendData as any) || []).map((r: any) => ({ ...r, promises: normalizePromises(r.promises) })) as FriendshipRow[];
    setFriendships(fs);
    setSuggestions(((sugData as any) || []) as SuggestionRow[]);

    // Collect all other-user ids
    const otherIds = new Set<string>();
    fs.forEach(f => otherIds.add(f.requester_id === user.id ? f.recipient_id : f.requester_id));
    ((sugData as any) || []).forEach((s: any) => {
      otherIds.add(s.sender_id === user.id ? s.recipient_id : s.sender_id);
    });

    if (otherIds.size > 0) {
      const { data: pData } = await supabase
        .from("user_profiles" as any)
        .select("user_id, username, display_name, avatar_emoji")
        .in("user_id", Array.from(otherIds));
      const pMap: Record<string, FriendProfile> = {};
      ((pData as any) || []).forEach((p: any) => { pMap[p.user_id] = p; });
      setProfiles(pMap);
    } else {
      setProfiles({});
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime: refresh on any change to our friendships or suggestions
  useEffect(() => {
    if (!user) return;
    const topic = `friends-${user.id}`;
    // Remove any stale channel with the same topic left over from a previous
    // mount/HMR; re-using an already-subscribed channel throws when adding
    // `postgres_changes` callbacks after `subscribe()`.
    supabase
      .getChannels()
      .filter((c) => c.topic === `realtime:${topic}`)
      .forEach((c) => supabase.removeChannel(c));
    const ch = supabase
      .channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_suggestions" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchAll]);

  // Derived buckets
  const accepted: FriendWithProfile[] = useMemo(() => {
    if (!user) return [];
    return friendships
      .filter(f => f.status === "accepted")
      .map(f => {
        const friendId = f.requester_id === user.id ? f.recipient_id : f.requester_id;
        const profile = profiles[friendId] || { user_id: friendId, username: "(unknown)", display_name: "", avatar_emoji: "🦊" };
        const iAmRequester = f.requester_id === user.id;
        return {
          friendship: f,
          friend: profile,
          iShareWithThem: iAmRequester ? f.share_from_requester : f.share_from_recipient,
          theyShareWithMe: iAmRequester ? f.share_from_recipient : f.share_from_requester,
        };
      });
  }, [user, friendships, profiles]);

  const incomingRequests = useMemo(() => {
    if (!user) return [];
    return friendships
      .filter(f => f.status === "pending" && f.recipient_id === user.id)
      .map(f => ({ friendship: f, sender: profiles[f.requester_id] }));
  }, [user, friendships, profiles]);

  const outgoingRequests = useMemo(() => {
    if (!user) return [];
    return friendships
      .filter(f => f.status === "pending" && f.requester_id === user.id)
      .map(f => ({ friendship: f, recipient: profiles[f.recipient_id] }));
  }, [user, friendships, profiles]);

  const incomingSuggestions: SuggestionWithSender[] = useMemo(() => {
    if (!user) return [];
    return suggestions
      .filter(s => s.recipient_id === user.id && s.status === "pending")
      .map(s => ({ ...s, senderProfile: profiles[s.sender_id] }));
  }, [user, suggestions, profiles]);

  const badgeCount = incomingRequests.length + incomingSuggestions.length;

  // Actions
  const addFriend = useCallback(async (handle: string) => {
    const { data, error } = await supabase.rpc("add_friend_by_handle" as any, { handle });
    if (error) { toast.error("Failed to add friend"); return false; }
    const res = data as any;
    if (res?.error) {
      const map: Record<string, string> = {
        not_authenticated: "Please sign in",
        empty_handle: "Enter a username or code",
        not_found: "No user found with that handle",
        self_add: "You can't add yourself",
        already_exists: res.status === "accepted" ? "Already friends" : "Request already exists",
      };
      toast.error(map[res.error] || "Could not add friend");
      return false;
    }
    toast.success(res?.auto_accepted ? "🎉 You're now friends!" : "Friend request sent");
    fetchAll();
    return true;
  }, [fetchAll]);

  const acceptRequest = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("accept_friend_request" as any, { request_id: id });
    if (error || (data as any)?.error) { toast.error("Failed to accept"); return; }
    toast.success("Friend added");
    fetchAll();
  }, [fetchAll]);

  const declineRequest = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("decline_friend_request" as any, { request_id: id });
    if (error || (data as any)?.error) { toast.error("Failed to decline"); return; }
    fetchAll();
  }, [fetchAll]);

  const cancelOutgoing = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from("friendships" as any).delete().eq("id", id).eq("requester_id", user.id);
    fetchAll();
  }, [user, fetchAll]);

  const unfriend = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from("friendships" as any).delete().eq("id", id);
    toast.success("Friend removed");
    fetchAll();
  }, [user, fetchAll]);

  const updatePromises = useCallback(async (friendshipId: string, promises: string[]) => {
    if (!user) return;
    const trimmed = promises.slice(0, 3).map(p => (p || "").slice(0, 200));
    while (trimmed.length < 3) trimmed.push("");
    await supabase
      .from("friendships" as any)
      .update({ promises: trimmed } as any)
      .eq("id", friendshipId);
    setFriendships(prev => prev.map(f => f.id === friendshipId ? { ...f, promises: trimmed } : f));
  }, [user]);

  const toggleMyShare = useCallback(async (f: FriendshipRow, enabled: boolean) => {
    if (!user) return;
    const iAmRequester = f.requester_id === user.id;
    const patch = iAmRequester ? { share_from_requester: enabled } : { share_from_recipient: enabled };
    await supabase.from("friendships" as any).update(patch as any).eq("id", f.id);
    setFriendships(prev => prev.map(x => x.id === f.id ? { ...x, ...patch } : x));
  }, [user]);

  const sendSuggestion = useCallback(async (recipientId: string, title: string, note: string, source: "planning" | "mission" = "planning") => {
    if (!user) return false;
    const t = (title || "").trim().slice(0, 200);
    const n = (note || "").trim().slice(0, 500);
    if (!t) { toast.error("Task title required"); return false; }
    const { error } = await supabase
      .from("friend_suggestions" as any)
      .insert([{ sender_id: user.id, recipient_id: recipientId, title: t, note: n, source }] as any);
    if (error) { toast.error("Failed to send"); return false; }
    toast.success("Sent to friend");
    fetchAll();
    return true;
  }, [user, fetchAll]);

  const respondSuggestion = useCallback(async (s: SuggestionRow, accept: boolean) => {
    if (!user) return;
    if (!accept) {
      await supabase
        .from("friend_suggestions" as any)
        .update({ status: "declined", responded_at: new Date().toISOString() } as any)
        .eq("id", s.id);
      fetchAll();
      return;
    }
    // Accept: just mark accepted. Caller is responsible for routing the task
    // (e.g. adding it as a persistent mission to a chosen Home category).
    await supabase
      .from("friend_suggestions" as any)
      .update({ status: "accepted", responded_at: new Date().toISOString() } as any)
      .eq("id", s.id);
    fetchAll();
  }, [user, fetchAll]);

  return {
    loading,
    accepted,
    incomingRequests,
    outgoingRequests,
    incomingSuggestions,
    badgeCount,
    addFriend,
    acceptRequest,
    declineRequest,
    cancelOutgoing,
    unfriend,
    updatePromises,
    toggleMyShare,
    sendSuggestion,
    respondSuggestion,
    refetch: fetchAll,
  };
}