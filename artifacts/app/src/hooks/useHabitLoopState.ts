import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "./useAuth";
import { HabitLoopProject, HabitLoop, HabitTask, isLoopComplete } from "@/lib/habit-loop-data";

export function useHabitLoopState() {
  const { user } = useAuth();
  const [loops, setLoops] = useState<HabitLoopProject[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("habit_loops" as any)
        .select("*")
        .eq("user_id", user.id);

      if (data && !error) {
        const rows = data as any[];
        const projects: HabitLoopProject[] = rows.map((row: any) => ({
          id: row.id,
          name: row.name || row.category_id || "Untitled",
          category: row.category_id || null,
          currentLoop: row.current_loop || 0,
          loops: Array.isArray(row.loops) ? row.loops : [],
        }));
        setLoops(projects);
        setActiveId(projects[0]?.id || "");
      }
      setLoading(false);
    })();
  }, [user]);

  const persist = useCallback(async (id: string, project: HabitLoopProject) => {
    if (!user) return;
    const { error } = await (supabase.from("habit_loops" as any) as any).upsert({
      id,
      user_id: user.id,
      name: project.name,
      category_id: project.category || null,
      current_loop: project.currentLoop,
      loops: project.loops,
    }, { onConflict: "id" });
    if (error) toast({ title: "Save failed", description: "Could not save habit loops.", variant: "destructive" });
  }, [user]);

  const getActive = useCallback((): HabitLoopProject | null => {
    return loops.find(l => l.id === activeId) || loops[0] || null;
  }, [loops, activeId]);

  const changeActive = useCallback((id: string) => setActiveId(id), []);

  const createProject = useCallback((name: string, category?: string) => {
    const project: HabitLoopProject = {
      id: crypto.randomUUID(),
      name,
      category: category || null,
      currentLoop: 0,
      loops: [],
    };
    setLoops(prev => {
      const next = [...prev, project];
      if (!activeId) setActiveId(project.id);
      persist(project.id, project);
      return next;
    });
    return project;
  }, [activeId, persist]);

  const renameProject = useCallback((id: string, name: string, category?: string | null) => {
    setLoops(prev => {
      const next = prev.map(l => {
        if (l.id !== id) return l;
        const updated = { ...l, name, category: category ?? l.category };
        persist(id, updated);
        return updated;
      });
      return next;
    });
  }, [persist]);

  const deleteProject = useCallback((id: string) => {
    (supabase.from("habit_loops" as any) as any).delete().eq("id", id);
    setLoops(prev => {
      const next = prev.filter(l => l.id !== id);
      if (activeId === id) setActiveId(next[0]?.id || "");
      return next;
    });
  }, [activeId]);

  const currentState = getActive() || { id: "", name: "", currentLoop: 0, loops: [] };

  const logRep = useCallback((loopIndex: number, taskId: string) => {
    const active = getActive();
    if (!active) return;
    const next = { ...active, loops: active.loops.map((lp, i) => i === loopIndex ? { ...lp, tasks: lp.tasks.map(t => t.id === taskId && t.completedReps < lp.repsRequired ? { ...t, completedReps: t.completedReps + 1 } : t) } : lp) };
    const completedLoop = next.loops[loopIndex];
    if (completedLoop && isLoopComplete(completedLoop) && loopIndex === next.currentLoop && loopIndex < next.loops.length - 1) {
      next.currentLoop = loopIndex + 1;
    }
    setLoops(prev => prev.map(l => l.id === next.id ? next : l));
    persist(next.id, next);
  }, [getActive, persist]);

  const addTask = useCallback((loopIndex: number, text: string) => {
    const active = getActive();
    if (!active?.loops[loopIndex]) return;
    const next = { ...active, loops: active.loops.map((lp, i) => i === loopIndex ? { ...lp, tasks: [...lp.tasks, { id: Date.now().toString() + Math.random().toString(36).slice(2, 6), text, completedReps: 0 }] } : lp) };
    setLoops(prev => prev.map(l => l.id === next.id ? next : l));
    persist(next.id, next);
  }, [getActive, persist]);

  const deleteTask = useCallback((loopIndex: number, taskId: string) => {
    const active = getActive();
    if (!active) return;
    const next = { ...active, loops: active.loops.map((lp, i) => i === loopIndex ? { ...lp, tasks: lp.tasks.filter(t => t.id !== taskId) } : lp) };
    setLoops(prev => prev.map(l => l.id === next.id ? next : l));
    persist(next.id, next);
  }, [getActive, persist]);

  const setLoopsForActive = useCallback((newLoops: HabitLoop[]) => {
    const active = getActive();
    if (!active) return;
    const next = { ...active, currentLoop: 0, loops: newLoops };
    setLoops(prev => prev.map(l => l.id === next.id ? next : l));
    persist(next.id, next);
  }, [getActive, persist]);

  const addLoops = useCallback((newLoops: HabitLoop[]) => {
    const active = getActive();
    if (!active) return;
    const next = { ...active, loops: [...active.loops, ...newLoops] };
    setLoops(prev => prev.map(l => l.id === next.id ? next : l));
    persist(next.id, next);
  }, [getActive, persist]);

  const resetLoop = useCallback(() => {
    const active = getActive();
    if (!active) return;
    const next = {
      ...active,
      currentLoop: 0,
      loops: active.loops.map(loop => ({ ...loop, tasks: loop.tasks.map(t => ({ ...t, completedReps: 0 })) })),
    };
    setLoops(prev => prev.map(l => l.id === next.id ? next : l));
    persist(next.id, next);
  }, [getActive, persist]);

  return {
    projects: loops,
    activeId,
    activeProject: getActive(),
    currentState,
    loading,
    changeActive,
    createProject,
    renameProject,
    deleteProject,
    logRep,
    addTask,
    deleteTask,
    setLoops: setLoopsForActive,
    addLoops,
    resetLoop,
  };
}