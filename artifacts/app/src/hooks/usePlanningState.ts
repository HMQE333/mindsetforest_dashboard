import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type TaskLevel = "goal" | "phase" | "task" | "action" | "link";

/**
 * A link from a planning node to a Path (optionally to one specific step).
 * Replaces the old ladder/loop mention pair - one kind instead of two.
 */
export type PlanningMention = { kind: "path"; pathId: string; stepId?: string | null };

export interface PlanningTask {
  id: string;
  user_id: string;
  project_id: string | null;
  board_id: string | null;
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
  standalone: boolean;
  position_x: number | null;
  position_y: number | null;
  mentions: PlanningMention[];
}

export interface BoardScope {
  boardId?: string;
  linkedProjectIds?: string[];
}

/**
 * Fired whenever a `planning_tasks` row is written from outside a given
 * `usePlanningState` instance (e.g. by the AI assistant). Page-scoped
 * instances listen for this and refetch so new tasks show up immediately.
 */
export const PLANNING_TASKS_CHANGED_EVENT = "planning-tasks-changed";

export function usePlanningState(projectId?: string, board?: BoardScope) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<PlanningTask[]>([]);
  const [loading, setLoading] = useState(true);

  const boardId = board?.boardId;
  // Stable dependency for the linked-project list.
  const linkedKey = (board?.linkedProjectIds ?? []).slice().sort().join(",");

  const fetchTasks = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    let query = (supabase.from("planning_tasks" as any) as any)
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (boardId) {
      // Board scope: union of tasks that belong directly to the board and
      // tasks belonging to any project currently linked to the board.
      const ids = linkedKey ? linkedKey.split(",") : [];
      if (ids.length > 0) {
        query = query.or(`board_id.eq.${boardId},project_id.in.(${ids.join(",")})`);
      } else {
        query = query.eq("board_id", boardId);
      }
    } else if (projectId) {
      query = query.eq("project_id", projectId);
    }
    const { data, error } = await query;
    if (data && !error) setTasks(data);
    setLoading(false);
  }, [user, projectId, boardId, linkedKey]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Refetch when a task is added elsewhere (e.g. the AI assistant writing
  // directly to the table) so this page-scoped instance stays in sync
  // without requiring a manual reload.
  useEffect(() => {
    const handler = () => { fetchTasks(); };
    window.addEventListener(PLANNING_TASKS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PLANNING_TASKS_CHANGED_EVENT, handler);
  }, [fetchTasks]);

  const addTask = useCallback(async (task: Omit<PlanningTask, "id" | "user_id" | "created_at" | "sort_order" | "standalone" | "position_x" | "position_y" | "mentions" | "board_id"> & { board_id?: string | null; standalone?: boolean; position_x?: number | null; position_y?: number | null; mentions?: PlanningMention[] }) => {
    if (!user) return null;
    const { data, error } = await (supabase.from("planning_tasks" as any) as any)
      .insert([{ ...task, user_id: user.id, board_id: task.board_id ?? null, standalone: task.standalone ?? false, position_x: task.position_x ?? null, position_y: task.position_y ?? null, mentions: task.mentions ?? [] }])
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
