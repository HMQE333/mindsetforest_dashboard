import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type TaskLevel = "goal" | "phase" | "task" | "action" | "link";

export interface PlanningTask {
  id: string;
  user_id: string;
  project_id: string;
  parent_id: string | null;
  level: TaskLevel;
  title: string;
  done: boolean;
  deadline: string | null;
  leverage: string | null;
  energy: string | null;
  time_minutes: number | null;
  url: string | null;
  icon: string | null;
  notes: string;
  sort_order: number;
  created_at: string;
}

export function usePlanningState(projectId?: string) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PlanningTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    let query = (supabase.from("planning_tasks" as any) as any)
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (data && !error) setTasks(data);
    setLoading(false);
  }, [user, projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const addTask = useCallback(async (task: Omit<PlanningTask, "id" | "user_id" | "created_at" | "sort_order">) => {
    if (!user) return null;
    const { data, error } = await (supabase.from("planning_tasks" as any) as any)
      .insert([{ ...task, user_id: user.id }])
      .select("*")
      .single();
    if (error) return null;
    setTasks(prev => [...prev, data]);
    return data as PlanningTask;
  }, [user]);

  const updateTask = useCallback(async (id: string, updates: Partial<PlanningTask>) => {
    if (!user) return;
    const { error } = await (supabase.from("planning_tasks" as any) as any)
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    }
  }, [user]);

  const deleteTask = useCallback(async (id: string) => {
    if (!user) return;
    // Cascade handled by DB, but remove descendants from local state
    const toDelete = new Set<string>();
    const findDesc = (parentId: string) => {
      toDelete.add(parentId);
      tasks.filter(t => t.parent_id === parentId).forEach(t => findDesc(t.id));
    };
    findDesc(id);
    
    const { error } = await (supabase.from("planning_tasks" as any) as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (!error) {
      setTasks(prev => prev.filter(t => !toDelete.has(t.id)));
    }
  }, [user, tasks]);

  const toggleTask = useCallback(async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task || !user) return;
    const done = !task.done;
    await (supabase.from("planning_tasks" as any) as any)
      .update({ done })
      .eq("id", id)
      .eq("user_id", user.id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done } : t));
  }, [user, tasks]);

  const getProjectTasks = useCallback((pid: string) => tasks.filter(t => t.project_id === pid), [tasks]);
  const getChildTasks = useCallback((parentId: string) => tasks.filter(t => t.parent_id === parentId), [tasks]);

  return { tasks, loading, addTask, updateTask, deleteTask, toggleTask, getProjectTasks, getChildTasks, refetch: fetchTasks };
}
