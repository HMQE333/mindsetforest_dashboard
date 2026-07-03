import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";
import { AllHabitLoops, CategoryHabitLoops, HabitTask, HabitLoop, createEmptyHabitLoops, isLoopComplete } from "@/lib/habit-loop-data";

export function useHabitLoopState() {
  const { user } = useAuth();
  const [allLoops, setAllLoops] = useState<AllHabitLoops>(createEmptyHabitLoops());
  const [activeCategory, setActiveCategory] = useState("mind");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const load = async () => {
      const { data, error } = await supabase
        .from("habit_loops" as any)
        .select("*")
        .eq("user_id", user.id);

      if (data && !error) {
        const merged = createEmptyHabitLoops();
        (data as any[]).forEach((row: any) => {
          merged[row.category_id] = {
            currentLoop: row.current_loop || 0,
            loops: Array.isArray(row.loops) ? row.loops : [],
          };
        });
        setAllLoops(merged);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const persist = useCallback(async (categoryId: string, state: CategoryHabitLoops) => {
    if (!user) return;
    const { error } = await (supabase.from("habit_loops" as any) as any).upsert([{
      user_id: user.id,
      category_id: categoryId,
      current_loop: state.currentLoop,
      loops: state.loops,
    }], { onConflict: "user_id,category_id" });
    if (error) toast({ title: "Save failed", description: "Could not save habit loops.", variant: "destructive" });
  }, [user]);

  const changeCategory = useCallback((cat: string) => {
    setActiveCategory(cat);
  }, []);

  const currentState = allLoops[activeCategory] || { currentLoop: 0, loops: [] };

  const logRep = useCallback((loopIndex: number, taskId: string) => {
    setAllLoops(prev => {
      const next = structuredClone(prev);
      const cat = next[activeCategory];
      if (!cat?.loops[loopIndex]) return prev;
      const task = cat.loops[loopIndex].tasks.find((t: HabitTask) => t.id === taskId);
      if (!task) return prev;
      const repsRequired = cat.loops[loopIndex].repsRequired;
      if (task.completedReps >= repsRequired) return prev;
      task.completedReps++;

      // Check if loop is now complete and auto-advance
      if (isLoopComplete(cat.loops[loopIndex]) && loopIndex === cat.currentLoop && loopIndex < cat.loops.length - 1) {
        cat.currentLoop = loopIndex + 1;
      }

      persist(activeCategory, cat);
      return next;
    });
  }, [activeCategory, persist]);

  const addTask = useCallback((loopIndex: number, text: string) => {
    setAllLoops(prev => {
      const next = structuredClone(prev);
      const cat = next[activeCategory];
      if (!cat?.loops[loopIndex]) return prev;
      cat.loops[loopIndex].tasks.push({
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        text,
        completedReps: 0,
      });
      persist(activeCategory, cat);
      return next;
    });
  }, [activeCategory, persist]);

  const deleteTask = useCallback((loopIndex: number, taskId: string) => {
    setAllLoops(prev => {
      const next = structuredClone(prev);
      const cat = next[activeCategory];
      if (!cat?.loops[loopIndex]) return prev;
      cat.loops[loopIndex].tasks = cat.loops[loopIndex].tasks.filter((t: HabitTask) => t.id !== taskId);
      persist(activeCategory, cat);
      return next;
    });
  }, [activeCategory, persist]);

  const setLoops = useCallback((loops: HabitLoop[]) => {
    setAllLoops(prev => {
      const next = structuredClone(prev);
      next[activeCategory] = { currentLoop: 0, loops };
      persist(activeCategory, next[activeCategory]);
      return next;
    });
  }, [activeCategory, persist]);

  const addLoops = useCallback((newLoops: HabitLoop[]) => {
    setAllLoops(prev => {
      const next = structuredClone(prev);
      const cat = next[activeCategory] || { currentLoop: 0, loops: [] };
      cat.loops = [...cat.loops, ...newLoops];
      next[activeCategory] = cat;
      persist(activeCategory, cat);
      return next;
    });
  }, [activeCategory, persist]);
  const resetLoop = useCallback(() => {
    setAllLoops(prev => {
      const next = structuredClone(prev);
      const cat = next[activeCategory];
      if (!cat) return prev;
      cat.loops.forEach(loop => {
        loop.tasks.forEach(t => { t.completedReps = 0; });
      });
      cat.currentLoop = 0;
      persist(activeCategory, cat);
      return next;
    });
  }, [activeCategory, persist]);

  return {
    allLoops,
    activeCategory,
    currentState,
    loading,
    changeCategory,
    logRep,
    addTask,
    deleteTask,
    setLoops,
    addLoops,
    resetLoop,
  };
}
