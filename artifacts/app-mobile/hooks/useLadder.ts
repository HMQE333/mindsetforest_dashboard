import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { type AllLadders, type LadderTask, createEmptyLadders } from "@/lib/data";
import { useAuth } from "./useAuth";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function useLadder() {
  const { user } = useAuth();
  const [ladders, setLadders] = useState<AllLadders>(createEmptyLadders());
  const [activeCategory, setActiveCategory] = useState("mind");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data, error } = await supabase.from("ladder_state").select("*").eq("user_id", user.id).maybeSingle();
      if (data && !error) {
        setLadders((data.ladders as unknown as AllLadders) || createEmptyLadders());
        setActiveCategory(data.active_category || "mind");
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const persist = useCallback(
    async (l: AllLadders, cat: string) => {
      if (!user) return;
      const { error } = await supabase.from("ladder_state").upsert(
        [{ user_id: user.id, ladders: l as any, active_category: cat }],
        { onConflict: "user_id" },
      );
      if (error) console.error("ladder persist error:", error.message);
    },
    [user],
  );

  const changeCategory = useCallback(
    (cat: string) => {
      setActiveCategory(cat);
      persist(ladders, cat);
    },
    [ladders, persist],
  );

  const addTask = useCallback(
    (level: number, text: string) => {
      setLadders((prev) => {
        const next = clone(prev);
        if (!next[activeCategory]) next[activeCategory] = { levels: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] } };
        const task: LadderTask = { id: Date.now().toString(), text, completed: false };
        next[activeCategory].levels[level] = [...(next[activeCategory].levels[level] || []), task];
        persist(next, activeCategory);
        return next;
      });
    },
    [activeCategory, persist],
  );

  const toggleTask = useCallback(
    (level: number, taskId: string) => {
      setLadders((prev) => {
        const next = clone(prev);
        const tasks = next[activeCategory]?.levels[level];
        if (!tasks) return prev;
        const idx = tasks.findIndex((t: LadderTask) => t.id === taskId);
        if (idx === -1) return prev;
        tasks[idx] = { ...tasks[idx], completed: !tasks[idx].completed };
        persist(next, activeCategory);
        return next;
      });
    },
    [activeCategory, persist],
  );

  const deleteTask = useCallback(
    (level: number, taskId: string) => {
      setLadders((prev) => {
        const next = clone(prev);
        const tasks = next[activeCategory]?.levels[level];
        if (!tasks) return prev;
        next[activeCategory].levels[level] = tasks.filter((t: LadderTask) => t.id !== taskId);
        persist(next, activeCategory);
        return next;
      });
    },
    [activeCategory, persist],
  );

  const getProgress = useCallback(() => {
    const ladder = ladders[activeCategory];
    if (!ladder?.levels) return { total: 0, completed: 0, percentage: 0 };
    let total = 0;
    let completed = 0;
    Object.values(ladder.levels).forEach((tasks: LadderTask[]) => {
      tasks.forEach((t) => {
        total++;
        if (t.completed) completed++;
      });
    });
    return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 };
  }, [ladders, activeCategory]);

  return { ladders, activeCategory, loading, changeCategory, addTask, toggleTask, deleteTask, getProgress };
}
