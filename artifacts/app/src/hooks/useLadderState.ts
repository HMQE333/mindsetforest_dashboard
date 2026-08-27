import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Ladder, LadderTask, LadderLevels, emptyLevels, migrateLadders } from "@/lib/ladder-data";

export function useLadderState() {
  const { user } = useAuth();
  const [ladders, setLadders] = useState<Ladder[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Load + auto-migrate old format.
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("ladder_state")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        const stored = data.ladders as any;
        if (Array.isArray(stored)) {
          // Already in new array format
          setLadders(stored as Ladder[]);
          setActiveId((data as any).active_ladder_id || data.active_category || "");
        } else if (stored && typeof stored === "object") {
          // Old category-keyed format. Migrate
          const migrated = migrateLadders(stored as any);
          setLadders(migrated);
          setActiveId(migrated[0]?.id || "");
          // Persist migration
          await supabase.from("ladder_state").upsert({
            user_id: user.id,
            ladders: migrated as any,
            active_ladder_id: migrated[0]?.id || "",
          }, { onConflict: "user_id" });
        }
      }
      setLoading(false);
    })();
  }, [user]);

  const persist = useCallback(async (list: Ladder[], active: string) => {
    if (!user) return;
    await supabase.from("ladder_state").upsert({
      user_id: user.id,
      ladders: list as any,
      active_ladder_id: active,
    }, { onConflict: "user_id" });
  }, [user]);

  const getActive = useCallback((): Ladder | null => {
    return ladders.find(l => l.id === activeId) || ladders[0] || null;
  }, [ladders, activeId]);

  const changeActive = useCallback((id: string) => {
    setActiveId(id);
    persist(ladders, id);
  }, [ladders, persist]);

  // Create new named ladder
  const createLadder = useCallback((name: string, category?: string) => {
    const ladder: Ladder = {
      id: crypto.randomUUID(),
      name,
      category: category || null,
      levels: emptyLevels(),
    };
    setLadders(prev => {
      const next = [...prev, ladder];
      if (!activeId) setActiveId(ladder.id);
      persist(next, activeId || ladder.id);
      return next;
    });
    return ladder;
  }, [activeId, persist]);

  const renameLadder = useCallback((id: string, name: string, category?: string | null) => {
    setLadders(prev => {
      const next = prev.map(l => l.id === id ? { ...l, name, category: category ?? l.category } : l);
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist]);

  const deleteLadder = useCallback((id: string) => {
    setLadders(prev => {
      const next = prev.filter(l => l.id !== id);
      const nextActive = activeId === id ? next[0]?.id || "" : activeId;
      if (activeId === id) setActiveId(nextActive);
      persist(next, nextActive);
      return next;
    });
  }, [activeId, persist]);

  const addTask = useCallback((level: number) => {
    setLadders(prev => {
      const next = prev.map(l => {
        if (l.id !== activeId) return l;
        const levels = { ...l.levels, [level]: [...(l.levels[level] || []), { id: Date.now().toString(), text: "", completed: false }] };
        return { ...l, levels };
      });
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist]);

  const updateTask = useCallback((level: number, taskId: string, updates: Partial<LadderTask>) => {
    setLadders(prev => {
      const next = prev.map(l => {
        if (l.id !== activeId) return l;
        const tasks = l.levels[level];
        if (!tasks) return l;
        return { ...l, levels: { ...l.levels, [level]: tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) } };
      });
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist]);

  const deleteTask = useCallback((level: number, taskId: string) => {
    setLadders(prev => {
      const next = prev.map(l => {
        if (l.id !== activeId) return l;
        return { ...l, levels: { ...l.levels, [level]: (l.levels[level] || []).filter(t => t.id !== taskId) } };
      });
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist]);

  const setLevelTasks = useCallback((level: number, tasks: LadderTask[]) => {
    setLadders(prev => {
      const next = prev.map(l => {
        if (l.id !== activeId) return l;
        return { ...l, levels: { ...l.levels, [level]: tasks } };
      });
      persist(next, activeId);
      return next;
    });
  }, [activeId, persist]);

  const getProgress = useCallback(() => {
    const l = getActive();
    if (!l?.levels) return { total: 0, completed: 0, percentage: 0 };
    let total = 0, completed = 0;
    Object.values(l.levels).forEach((tasks) => {
      tasks.forEach(t => { total++; if (t.completed) completed++; });
    });
    return { total, completed, percentage: total ? Math.round((completed / total) * 100) : 0 };
  }, [getActive]);

  const isLevelComplete = useCallback((level: number) => {
    const l = getActive();
    const tasks = l?.levels[level] || [];
    return tasks.length > 0 && tasks.every(t => t.completed);
  }, [getActive]);

  return {
    ladders,
    activeId,
    activeLadder: getActive(),
    loading,
    changeActive,
    createLadder,
    renameLadder,
    deleteLadder,
    addTask, updateTask, deleteTask, setLevelTasks,
    getProgress,
    isLevelComplete,
  };
}