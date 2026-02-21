import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { AllLadders, LadderTask, createEmptyLadders } from "@/lib/ladder-data";

export function useLadderState() {
  const { user } = useAuth();
  const [ladders, setLadders] = useState<AllLadders>(createEmptyLadders());
  const [activeCategory, setActiveCategory] = useState("mind");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from("ladder_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && !error) {
        const stored = (data.ladders as unknown as AllLadders) || createEmptyLadders();
        setLadders(stored);
        setActiveCategory(data.active_category || "mind");
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const persist = useCallback(async (l: AllLadders, cat: string) => {
    if (!user) return;
    await supabase.from("ladder_state").upsert([{
      user_id: user.id,
      ladders: l as unknown as Record<string, never>,
      active_category: cat,
    }], { onConflict: "user_id" });
  }, [user]);

  const changeCategory = useCallback((cat: string) => {
    setActiveCategory(cat);
    persist(ladders, cat);
  }, [ladders, persist]);

  const addTask = useCallback((level: number) => {
    setLadders(prev => {
      const next = structuredClone(prev);
      if (!next[activeCategory]) next[activeCategory] = { levels: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] } };
      const task: LadderTask = { id: Date.now().toString(), text: "", completed: false };
      next[activeCategory].levels[level] = [...(next[activeCategory].levels[level] || []), task];
      persist(next, activeCategory);
      return next;
    });
  }, [activeCategory, persist]);

  const updateTask = useCallback((level: number, taskId: string, updates: Partial<LadderTask>) => {
    setLadders(prev => {
      const next = structuredClone(prev);
      const tasks = next[activeCategory]?.levels[level];
      if (!tasks) return prev;
      const idx = tasks.findIndex((t: LadderTask) => t.id === taskId);
      if (idx === -1) return prev;
      tasks[idx] = { ...tasks[idx], ...updates };
      persist(next, activeCategory);
      return next;
    });
  }, [activeCategory, persist]);

  const deleteTask = useCallback((level: number, taskId: string) => {
    setLadders(prev => {
      const next = structuredClone(prev);
      const tasks = next[activeCategory]?.levels[level];
      if (!tasks) return prev;
      next[activeCategory].levels[level] = tasks.filter((t: LadderTask) => t.id !== taskId);
      persist(next, activeCategory);
      return next;
    });
  }, [activeCategory, persist]);

  const setLevelTasks = useCallback((level: number, tasks: LadderTask[]) => {
    setLadders(prev => {
      const next = structuredClone(prev);
      if (!next[activeCategory]) next[activeCategory] = { levels: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] } };
      next[activeCategory].levels[level] = tasks;
      persist(next, activeCategory);
      return next;
    });
  }, [activeCategory, persist]);

  const getProgress = useCallback(() => {
    const ladder = ladders[activeCategory];
    if (!ladder?.levels) return { total: 0, completed: 0, percentage: 0 };
    let total = 0, completed = 0;
    Object.values(ladder.levels).forEach((tasks: LadderTask[]) => {
      tasks.forEach(t => { total++; if (t.completed) completed++; });
    });
    return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 };
  }, [ladders, activeCategory]);

  const isLevelComplete = useCallback((level: number) => {
    const tasks = ladders[activeCategory]?.levels[level] || [];
    return tasks.length > 0 && tasks.every((t: LadderTask) => t.completed);
  }, [ladders, activeCategory]);

  return {
    ladders,
    activeCategory,
    loading,
    changeCategory,
    addTask,
    updateTask,
    deleteTask,
    setLevelTasks,
    getProgress,
    isLevelComplete,
  };
}
