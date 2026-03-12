import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useSavedTags(module: string = "all") {
  const { user } = useAuth();
  const [savedTags, setSavedTags] = useState<string[]>([]);

  const fetchTags = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_saved_tags" as any)
      .select("tag")
      .eq("user_id", user.id)
      .or(`module.eq.${module},module.eq.all`)
      .order("created_at", { ascending: true });
    if (data) setSavedTags((data as any[]).map(d => d.tag));
  }, [user, module]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const saveTag = useCallback(async (tag: string) => {
    if (!user || !tag.trim()) return;
    const { error } = await supabase
      .from("user_saved_tags" as any)
      .insert([{ user_id: user.id, tag: tag.trim(), module }] as any);
    if (!error) setSavedTags(prev => prev.includes(tag.trim()) ? prev : [...prev, tag.trim()]);
  }, [user, module]);

  const removeTag = useCallback(async (tag: string) => {
    if (!user) return;
    await supabase
      .from("user_saved_tags" as any)
      .delete()
      .eq("user_id", user.id)
      .eq("tag", tag)
      .eq("module", module);
    setSavedTags(prev => prev.filter(t => t !== tag));
  }, [user, module]);

  return { savedTags, saveTag, removeTag, refetch: fetchTags };
}
