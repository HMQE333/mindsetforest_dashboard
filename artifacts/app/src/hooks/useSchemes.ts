import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { Mission } from "@/lib/dashboard-data";

/**
 * A **Scheme** is a named, loadable set of dashboard missions — "low energy
 * day", "deep work", "travel". Saving one snapshots the categories you pick;
 * loading one replaces today's missions with it (undoable).
 */
export interface Scheme {
  id: string;
  name: string;
  emoji: string;
  description: string;
  missions: Record<string, Mission[]>;
  sort_order: number;
  last_used_at: string | null;
  created_at: string;
}

const table = () => (supabase.from("dashboard_schemes" as never) as unknown as {
  select: (cols: string) => any;
  insert: (rows: unknown[]) => any;
  update: (values: unknown) => any;
  delete: () => any;
});

export function useSchemes() {
  const { user } = useAuth();
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchemes = useCallback(async () => {
    if (!user) { setSchemes([]); setLoading(false); return; }
    const { data, error } = await table()
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!error && data) setSchemes(data as Scheme[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSchemes(); }, [fetchSchemes]);

  const createScheme = useCallback(async (input: {
    name: string;
    emoji?: string;
    description?: string;
    missions: Record<string, Mission[]>;
  }): Promise<Scheme | null> => {
    if (!user || !input.name.trim()) return null;
    const { data, error } = await table()
      .insert([{
        user_id: user.id,
        name: input.name.trim(),
        emoji: input.emoji || "🎛️",
        description: input.description || "",
        missions: input.missions,
        sort_order: schemes.length,
      }])
      .select("*")
      .single();
    if (error || !data) { toast.error("Could not save the scheme"); return null; }
    setSchemes((prev) => [...prev, data as Scheme]);
    return data as Scheme;
  }, [user, schemes.length]);

  const updateScheme = useCallback(async (id: string, updates: Partial<Pick<Scheme, "name" | "emoji" | "description" | "missions">>) => {
    if (!user) return;
    const { error } = await table()
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Could not update the scheme"); return; }
    setSchemes((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } as Scheme : s)));
  }, [user]);

  const deleteScheme = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await table().delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error("Could not delete the scheme"); return; }
    setSchemes((prev) => prev.filter((s) => s.id !== id));
  }, [user]);

  const markUsed = useCallback(async (id: string) => {
    if (!user) return;
    const now = new Date().toISOString();
    await table().update({ last_used_at: now }).eq("id", id).eq("user_id", user.id);
    setSchemes((prev) => prev.map((s) => (s.id === id ? { ...s, last_used_at: now } : s)));
  }, [user]);

  return { schemes, loading, refetch: fetchSchemes, createScheme, updateScheme, deleteScheme, markUsed };
}
