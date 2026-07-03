import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface UserProfile {
  user_id: string;
  username: string;
  friend_code: string;
  display_name: string;
  avatar_emoji: string;
  created_at: string;
  updated_at: string;
}

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function isValidUsername(u: string): boolean {
  return USERNAME_RE.test(u);
}

export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) { setLoading(false); setProfile(null); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_profiles" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) { setLoading(false); return; }
    if (!data) {
      // Auto-create a default profile (user_<uid8>)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("ensure_user_profile" as any);
      if (rpcErr) { setLoading(false); return; }
      const created = rpcData as unknown as UserProfile;
      setProfile(created);
      // Mark as needing setup so the modal can prompt for a real username
      if (created?.username?.startsWith("user_")) setNeedsSetup(true);
    } else {
      setProfile(data as unknown as UserProfile);
      if ((data as any).username?.startsWith("user_")) setNeedsSetup(true);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const updateProfile = useCallback(async (patch: Partial<Pick<UserProfile, "username" | "display_name" | "avatar_emoji">>) => {
    if (!user || !profile) return false;
    if (patch.username !== undefined) {
      const u = patch.username.trim().toLowerCase();
      if (!isValidUsername(u)) {
        toast.error("Username must be 3–20 chars: a-z, 0-9, _");
        return false;
      }
      patch.username = u;
    }
    const { data, error } = await supabase
      .from("user_profiles" as any)
      .update(patch as any)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) {
      if ((error as any).code === "23505") toast.error("Username already taken");
      else toast.error("Failed to update profile");
      return false;
    }
    setProfile(data as unknown as UserProfile);
    if (!(data as any).username.startsWith("user_")) setNeedsSetup(false);
    return true;
  }, [user, profile]);

  const regenerateFriendCode = useCallback(async () => {
    const { data, error } = await supabase.rpc("regenerate_friend_code" as any);
    if (error) { toast.error("Failed to regenerate code"); return; }
    if (profile && data) setProfile({ ...profile, friend_code: data as string });
    toast.success("New friend code generated");
  }, [profile]);

  const checkUsernameAvailable = useCallback(async (candidate: string): Promise<boolean> => {
    const u = candidate.trim().toLowerCase();
    if (!isValidUsername(u)) return false;
    if (profile && profile.username === u) return true;
    const { data } = await supabase
      .from("user_profiles" as any)
      .select("user_id")
      .eq("username", u)
      .maybeSingle();
    return !data;
  }, [profile]);

  return { profile, loading, needsSetup, updateProfile, regenerateFriendCode, checkUsernameAvailable, refetch: fetchProfile };
}