import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";

export interface PlanningBoard {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  sort_order: number;
  created_at: string;
}

export interface BoardProjectLink {
  id: string;
  board_id: string;
  project_id: string;
}

export function useBoards() {
  const { user } = useAuth();
  const [boards, setBoards] = useState<PlanningBoard[]>([]);
  const [links, setLinks] = useState<BoardProjectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const backfillRan = useRef(false);

  const fetchAll = useCallback(async () => {
    if (!user) return { boards: [] as PlanningBoard[], links: [] as BoardProjectLink[] };
    const [boardsRes, linksRes] = await Promise.all([
      (supabase.from("planning_boards" as any) as any)
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      (supabase.from("board_projects" as any) as any)
        .select("id, board_id, project_id")
        .eq("user_id", user.id),
    ]);
    const nextBoards: PlanningBoard[] = (!boardsRes.error && boardsRes.data) ? boardsRes.data : [];
    const nextLinks: BoardProjectLink[] = (!linksRes.error && linksRes.data) ? linksRes.data : [];
    setBoards(nextBoards);
    setLinks(nextLinks);
    return { boards: nextBoards, links: nextLinks };
  }, [user]);

  // Atomically claim the one-time backfill for this user. The marker table's
  // user_id primary key makes this a race-safe claim: only the client whose
  // INSERT actually creates the row (returned in `data`) gets to run the
  // backfill. On a duplicate-key conflict we get an error / no row and skip it.
  // Because the marker persists independently of boards, deleting every board
  // later never re-triggers the backfill.
  const claimBackfill = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await (supabase.from("planning_board_backfill" as any) as any)
      .insert([{ user_id: user.id }])
      .select("user_id")
      .maybeSingle();
    return !error && !!data;
  }, [user]);

  // Backfill: on the very first load only (claimed once via the marker table),
  // create one board per existing project that has planning tasks, and link that
  // project to it, so existing decomposition stays reachable. Never duplicates
  // or resurrects deleted boards on later loads.
  const backfill = useCallback(async () => {
    if (!user) return;
    const { data: taskRows } = await (supabase.from("planning_tasks" as any) as any)
      .select("project_id")
      .eq("user_id", user.id)
      .not("project_id", "is", null);
    const projectIds = Array.from(
      new Set(((taskRows as { project_id: string | null }[] | null) || [])
        .map(r => r.project_id)
        .filter((id): id is string => !!id))
    );
    if (projectIds.length === 0) return;
    const { data: projs } = await (supabase.from("user_projects" as any) as any)
      .select("id, name, emoji")
      .eq("user_id", user.id)
      .in("id", projectIds)
      .order("created_at", { ascending: true });
    const projects = (projs as { id: string; name: string; emoji: string }[] | null) || [];
    let sort = 0;
    for (const p of projects) {
      const { data: board, error } = await (supabase.from("planning_boards" as any) as any)
        .insert([{ user_id: user.id, name: p.name, emoji: p.emoji || "🗂️", sort_order: sort++ }])
        .select("*")
        .single();
      if (error || !board) continue;
      await (supabase.from("board_projects" as any) as any)
        .insert([{ user_id: user.id, board_id: board.id, project_id: p.id }]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    const init = async () => {
      await fetchAll();
      if (!cancelled && !backfillRan.current) {
        backfillRan.current = true;
        const claimed = await claimBackfill();
        if (claimed && !cancelled) {
          await backfill();
          if (!cancelled) await fetchAll();
        }
      }
      if (!cancelled) setLoading(false);
    };
    init();
    return () => { cancelled = true; };
  }, [user, fetchAll, backfill, claimBackfill]);

  const addBoard = useCallback(async (name: string, emoji: string = "🗂️") => {
    if (!user) return null;
    const sort_order = boards.length;
    const { data, error } = await (supabase.from("planning_boards" as any) as any)
      .insert([{ user_id: user.id, name, emoji, sort_order }])
      .select("*")
      .single();
    if (error || !data) {
      toast({ title: "Failed to create board", variant: "destructive" });
      return null;
    }
    setBoards(prev => [...prev, data]);
    return data as PlanningBoard;
  }, [user, boards.length]);

  const renameBoard = useCallback(async (id: string, name: string, emoji?: string) => {
    if (!user) return;
    const updates: Record<string, string> = { name };
    if (emoji) updates.emoji = emoji;
    const { error } = await (supabase.from("planning_boards" as any) as any)
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Failed to rename board", variant: "destructive" });
      return;
    }
    setBoards(prev => prev.map(b => b.id === id ? { ...b, name, ...(emoji ? { emoji } : {}) } : b));
  }, [user]);

  const deleteBoard = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await (supabase.from("planning_boards" as any) as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Failed to delete board", variant: "destructive" });
      return;
    }
    setBoards(prev => prev.filter(b => b.id !== id));
    setLinks(prev => prev.filter(l => l.board_id !== id));
  }, [user]);

  const linkProject = useCallback(async (boardId: string, projectId: string) => {
    if (!user) return;
    if (links.some(l => l.board_id === boardId && l.project_id === projectId)) return;
    const { data, error } = await (supabase.from("board_projects" as any) as any)
      .insert([{ user_id: user.id, board_id: boardId, project_id: projectId }])
      .select("id, board_id, project_id")
      .single();
    if (error || !data) {
      toast({ title: "Failed to link project", variant: "destructive" });
      return;
    }
    setLinks(prev => [...prev, data]);
  }, [user, links]);

  const unlinkProject = useCallback(async (boardId: string, projectId: string) => {
    if (!user) return;
    const { error } = await (supabase.from("board_projects" as any) as any)
      .delete()
      .eq("user_id", user.id)
      .eq("board_id", boardId)
      .eq("project_id", projectId);
    if (error) {
      toast({ title: "Failed to unlink project", variant: "destructive" });
      return;
    }
    setLinks(prev => prev.filter(l => !(l.board_id === boardId && l.project_id === projectId)));
  }, [user]);

  const getLinkedProjectIds = useCallback(
    (boardId: string) => links.filter(l => l.board_id === boardId).map(l => l.project_id),
    [links]
  );

  return {
    boards,
    links,
    loading,
    addBoard,
    renameBoard,
    deleteBoard,
    linkProject,
    unlinkProject,
    getLinkedProjectIds,
    refetch: fetchAll,
  };
}
