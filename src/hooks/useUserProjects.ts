import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export interface UserProject {
  id: string;
  name: string;
  emoji: string;
  parent_category: string | null;
}

export function useUserProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<UserProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      const { data, error } = await (supabase.from("user_projects" as any) as any)
        .select("id, name, emoji, parent_category")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (data && !error) setProjects(data);
      setLoading(false);
    };
    load();
  }, [user]);

  const addProject = useCallback(async (name: string, emoji: string = "📁") => {
    if (!user) return null;
    const { data, error } = await (supabase.from("user_projects" as any) as any)
      .insert([{ user_id: user.id, name, emoji }])
      .select("id, name, emoji, parent_category")
      .single();
    if (error) {
      toast({ title: "Failed to create project", variant: "destructive" });
      return null;
    }
    setProjects(prev => [...prev, data]);
    return data as UserProject;
  }, [user]);

  const deleteProject = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await (supabase.from("user_projects" as any) as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Failed to delete project", variant: "destructive" });
      return;
    }
    setProjects(prev => prev.filter(p => p.id !== id));
  }, [user]);

  const renameProject = useCallback(async (id: string, name: string, emoji?: string) => {
    if (!user) return;
    const updates: Record<string, string> = { name };
    if (emoji) updates.emoji = emoji;
    const { error } = await (supabase.from("user_projects" as any) as any)
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Failed to rename project", variant: "destructive" });
      return;
    }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name, ...(emoji ? { emoji } : {}) } : p));
  }, [user]);

  /** Convert a project to the key used in ladder/habit loop data */
  const projectKey = (id: string) => `project-${id}`;

  /** Check if a category key is a project key */
  const isProjectKey = (key: string) => key.startsWith("project-");

  /** Get project from a project key */
  const getProjectFromKey = (key: string) => {
    if (!isProjectKey(key)) return null;
    const id = key.replace("project-", "");
    return projects.find(p => p.id === id) || null;
  };

  return { projects, loading, addProject, deleteProject, renameProject, projectKey, isProjectKey, getProjectFromKey };
}
