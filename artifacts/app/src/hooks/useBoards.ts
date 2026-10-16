import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import { PLANNING_BOARDS_CHANGED_EVENT } from "@/lib/planning-board";
import { PLANNING_TASKS_CHANGED_EVENT } from "./usePlanningState";

/**
 * A planning board: the 📁 folder above one tree, switched in the Planning
 * header. Boards no longer link to projects (board_projects and the one-time
 * planning_board_backfill stay in the database, unread by the UI).
 */
export interface PlanningBoard {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  sort_order: number;
  created_at: string;
}

export const DEFAULT_BOARD_EMOJI = "📁";

/**
 * The user's boards. Every write checks its error and toasts; local state
 * changes only after a write succeeds. Writes fire PLANNING_BOARDS_CHANGED_EVENT
 * (tagged with this instance) and every instance refetches on events from
 * elsewhere, e.g. the assistant creating "📥 Inbox" while Planning is open.
 */
export function useBoards() {
  const { user } = useAuth();
  const userId = user?.id;
  const [boards, setBoards] = useState<PlanningBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useRef(`boards-${Math.random().toString(36).slice(2)}`);
  const fetchSeq = useRef(0);

  const fetchAll = useCallback(async (): Promise<void> => {
    const seq = ++fetchSeq.current;
    if (!userId) { setBoards([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("planning_boards")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    // A newer fetch wins over a slower old one.
    if (seq !== fetchSeq.current) return;
    if (!error && data) setBoards(data as PlanningBoard[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<{ source?: string } | null>).detail?.source === instanceId.current) return;
      void fetchAll();
    };
    window.addEventListener(PLANNING_BOARDS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PLANNING_BOARDS_CHANGED_EVENT, handler);
  }, [fetchAll]);

  const announce = useCallback(() => {
    window.dispatchEvent(new CustomEvent(PLANNING_BOARDS_CHANGED_EVENT, { detail: { source: instanceId.current } }));
  }, []);

  const addBoard = useCallback(async (name: string, emoji: string = DEFAULT_BOARD_EMOJI): Promise<PlanningBoard | null> => {
    if (!userId) return null;
    const sort_order = boards.reduce((m, b) => Math.max(m, b.sort_order ?? 0), 0) + 1;
    const { data, error } = await supabase
      .from("planning_boards")
      .insert([{ user_id: userId, name, emoji: emoji || DEFAULT_BOARD_EMOJI, sort_order }])
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Failed to create board", description: error?.message, variant: "destructive" });
      return null;
    }
    const created = data as PlanningBoard;
    setBoards(prev => [...prev, created]);
    announce();
    return created;
  }, [userId, boards, announce]);

  const renameBoard = useCallback(async (id: string, name: string, emoji?: string): Promise<boolean> => {
    if (!userId) return false;
    const updates: { name: string; emoji?: string } = { name };
    if (emoji) updates.emoji = emoji;
    const { error } = await supabase
      .from("planning_boards")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      toast({ title: "Failed to rename board", description: error.message, variant: "destructive" });
      return false;
    }
    setBoards(prev => prev.map(b => (b.id === id ? { ...b, ...updates } : b)));
    announce();
    return true;
  }, [userId, announce]);

  /** Deletes the board; its planning_tasks go with it (board_id ON DELETE CASCADE). */
  const deleteBoard = useCallback(async (id: string): Promise<boolean> => {
    if (!userId) return false;
    const { error } = await supabase
      .from("planning_boards")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      toast({ title: "Failed to delete board", description: error.message, variant: "destructive" });
      return false;
    }
    setBoards(prev => prev.filter(b => b.id !== id));
    announce();
    // Its rows went with it: any unscoped planning list refetches.
    window.dispatchEvent(new CustomEvent(PLANNING_TASKS_CHANGED_EVENT, { detail: { source: instanceId.current } }));
    return true;
  }, [userId, announce]);

  return {
    boards,
    loading,
    addBoard,
    renameBoard,
    deleteBoard,
    refetch: fetchAll,
  };
}
