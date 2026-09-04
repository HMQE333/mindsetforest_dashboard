import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import {
  Plan,
  PlanOp,
  applyOps,
  emptyPlan,
  normalizePlan,
  normalizeOps,
  planToOutline,
} from "@/lib/plan-model";
import { AIModelChoice } from "@/lib/ai-model";

export interface PlanSimulation {
  id: string;
  user_id: string;
  board_id: string | null;
  project_id: string | null;
  title: string;
  brief: string;
  plan: Plan;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanVersion {
  id: string;
  simulation_id: string;
  plan: Plan;
  label: string;
  source: string;
  created_at: string;
}

export interface PlanChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  research: string | null;
  ops: PlanOp[] | null;
  created_at: string;
}

/** Untyped table access — these tables are newer than the generated types. */
const table = (name: string) => (supabase.from(name as never) as unknown as {
  select: (cols: string) => any;
  insert: (rows: unknown[]) => any;
  update: (values: unknown) => any;
  delete: () => any;
});

/** How many versions we keep per simulation before trimming the oldest. */
const MAX_VERSIONS = 40;

export function usePlanSimulations(boardId?: string) {
  const { user } = useAuth();
  const [simulations, setSimulations] = useState<PlanSimulation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSimulations = useCallback(async () => {
    if (!user) { setSimulations([]); setLoading(false); return; }
    let query = table("plan_simulations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (boardId) query = query.eq("board_id", boardId);
    const { data, error } = await query;
    if (!error && data) {
      setSimulations((data as PlanSimulation[]).map((s) => ({ ...s, plan: normalizePlan(s.plan, s.title) })));
    }
    setLoading(false);
  }, [user, boardId]);

  useEffect(() => { fetchSimulations(); }, [fetchSimulations]);

  /** Generates a fresh simulation from a brief and stores it. */
  const generate = useCallback(async (opts: {
    brief: string;
    title?: string;
    boardName?: string;
    context?: string;
    modelChoice: AIModelChoice;
    targetSteps?: number;
  }): Promise<PlanSimulation | null> => {
    if (!user) return null;
    const { data, error } = await supabase.functions.invoke("ai-plan-simulate", {
      body: {
        brief: opts.brief,
        title: opts.title,
        boardName: opts.boardName,
        context: opts.context,
        modelChoice: opts.modelChoice,
        targetSteps: opts.targetSteps,
      },
    });
    if (error || !data?.plan) {
      toast.error(data?.error || "Could not build the simulation");
      return null;
    }
    const plan = normalizePlan(data.plan, opts.title || "Simulation");
    const { data: row, error: insErr } = await table("plan_simulations")
      .insert([{
        user_id: user.id,
        board_id: boardId ?? null,
        title: plan.title || opts.title || "Simulation",
        brief: opts.brief,
        plan,
        model: data.model ?? null,
      }])
      .select("*")
      .single();
    if (insErr || !row) {
      toast.error("Could not save the simulation");
      return null;
    }
    const sim = { ...(row as PlanSimulation), plan };
    setSimulations((prev) => [sim, ...prev]);
    return sim;
  }, [user, boardId]);

  /** Snapshots the current plan, then writes the new one. */
  const savePlan = useCallback(async (
    sim: PlanSimulation,
    nextPlan: Plan,
    label: string,
    source: "ai" | "manual" | "undo" = "manual",
  ) => {
    if (!user) return;
    // The snapshot is the plan *before* this change, so restoring it undoes it.
    if (source !== "undo") {
      await table("plan_simulation_versions").insert([{
        simulation_id: sim.id,
        user_id: user.id,
        plan: sim.plan,
        label,
        source,
      }]);
      const { data: old } = await table("plan_simulation_versions")
        .select("id")
        .eq("simulation_id", sim.id)
        .order("created_at", { ascending: false })
        .range(MAX_VERSIONS, MAX_VERSIONS + 50);
      const stale = (old as { id: string }[] | null) || [];
      if (stale.length > 0) {
        await table("plan_simulation_versions").delete().in("id", stale.map((r) => r.id));
      }
    }

    const { error } = await table("plan_simulations")
      .update({ plan: nextPlan, title: nextPlan.title, updated_at: new Date().toISOString() })
      .eq("id", sim.id)
      .eq("user_id", user.id);
    if (error) { toast.error("Could not save the change"); return; }
    setSimulations((prev) => prev.map((s) => (s.id === sim.id ? { ...s, plan: nextPlan, title: nextPlan.title } : s)));
  }, [user]);

  /** Replaces a simulation's plan with a regenerated one, keeping its history. */
  const regenerate = useCallback(async (sim: PlanSimulation, opts: {
    context?: string;
    modelChoice: AIModelChoice;
    targetSteps?: number;
  }): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase.functions.invoke("ai-plan-simulate", {
      body: {
        brief: sim.brief || sim.title,
        title: sim.title,
        context: opts.context,
        modelChoice: opts.modelChoice,
        targetSteps: opts.targetSteps,
        regenerate: true,
        previousTitles: sim.plan.phases.map((p) => p.title),
      },
    });
    if (error || !data?.plan) {
      toast.error(data?.error || "Could not regenerate");
      return false;
    }
    const plan = normalizePlan(data.plan, sim.title);
    await savePlan(sim, plan, "Regenerated", "ai");
    return true;
  }, [user, savePlan]);

  /** Applies edit operations (from the AI or from dragging) to a simulation. */
  const applyPlanOps = useCallback(async (sim: PlanSimulation, ops: PlanOp[], label: string, source: "ai" | "manual" = "manual") => {
    const result = applyOps(sim.plan, ops);
    if (result.applied.length === 0) {
      if (result.errors.length > 0) toast.error(result.errors[0]);
      return result;
    }
    await savePlan(sim, result.plan, label, source);
    if (result.errors.length > 0) {
      toast.warning(`${result.errors.length} change(s) could not be applied`);
    }
    return result;
  }, [savePlan]);

  const listVersions = useCallback(async (simulationId: string): Promise<PlanVersion[]> => {
    if (!user) return [];
    const { data } = await table("plan_simulation_versions")
      .select("*")
      .eq("simulation_id", simulationId)
      .order("created_at", { ascending: false })
      .limit(MAX_VERSIONS);
    return ((data as PlanVersion[] | null) || []).map((v) => ({ ...v, plan: normalizePlan(v.plan, "Simulation") }));
  }, [user]);

  /** Restores an earlier version. The current plan is kept as a new snapshot. */
  const restoreVersion = useCallback(async (sim: PlanSimulation, version: PlanVersion) => {
    if (!user) return;
    await table("plan_simulation_versions").insert([{
      simulation_id: sim.id,
      user_id: user.id,
      plan: sim.plan,
      label: "Before restore",
      source: "manual",
    }]);
    await savePlan(sim, version.plan, "Restored", "undo");
    await table("plan_simulation_versions").delete().eq("id", version.id);
  }, [user, savePlan]);

  const deleteSimulation = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await table("plan_simulations").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error("Could not delete"); return; }
    setSimulations((prev) => prev.filter((s) => s.id !== id));
  }, [user]);

  const renameSimulation = useCallback(async (sim: PlanSimulation, title: string) => {
    if (!user || !title.trim()) return;
    const plan = { ...sim.plan, title: title.trim() };
    await table("plan_simulations")
      .update({ title: title.trim(), plan })
      .eq("id", sim.id)
      .eq("user_id", user.id);
    setSimulations((prev) => prev.map((s) => (s.id === sim.id ? { ...s, title: title.trim(), plan } : s)));
  }, [user]);

  /* ------------------------------------------------------------- chat --- */

  const loadChat = useCallback(async (simulationId: string): Promise<PlanChatMessage[]> => {
    if (!user) return [];
    const { data } = await table("plan_chat_messages")
      .select("*")
      .eq("simulation_id", simulationId)
      .order("created_at", { ascending: true })
      .limit(200);
    return (data as PlanChatMessage[] | null) || [];
  }, [user]);

  const saveChatMessage = useCallback(async (
    simulationId: string,
    msg: { role: "user" | "assistant"; content: string; research?: string | null; ops?: PlanOp[] | null },
  ): Promise<PlanChatMessage | null> => {
    if (!user) return null;
    const { data } = await table("plan_chat_messages")
      .insert([{
        simulation_id: simulationId,
        user_id: user.id,
        role: msg.role,
        content: msg.content,
        research: msg.research ?? null,
        ops: msg.ops ?? null,
      }])
      .select("*")
      .single();
    return (data as PlanChatMessage) || null;
  }, [user]);

  /** Asks the assistant about a plan. It researches first, then proposes ops. */
  const askAssistant = useCallback(async (opts: {
    sim: PlanSimulation;
    message: string;
    history: { role: "user" | "assistant"; content: string }[];
    context: string;
    modelChoice: AIModelChoice;
  }): Promise<{ reply: string; research: string; ops: PlanOp[] } | null> => {
    const { data, error } = await supabase.functions.invoke("ai-plan-chat", {
      body: {
        message: opts.message,
        history: opts.history,
        planOutline: planToOutline(opts.sim.plan),
        context: opts.context,
        modelChoice: opts.modelChoice,
      },
    });
    if (error || !data || data.error) {
      toast.error(data?.error || "The assistant could not answer");
      return null;
    }
    return {
      reply: typeof data.reply === "string" ? data.reply : "",
      research: typeof data.research === "string" ? data.research : "",
      ops: normalizeOps(data.ops),
    };
  }, []);

  /** A blank, hand-built simulation for people who'd rather not generate one. */
  const createEmpty = useCallback(async (title: string): Promise<PlanSimulation | null> => {
    if (!user) return null;
    const plan = emptyPlan(title.trim() || "New simulation");
    const { data } = await table("plan_simulations")
      .insert([{ user_id: user.id, board_id: boardId ?? null, title: plan.title, brief: "", plan }])
      .select("*")
      .single();
    if (!data) return null;
    const sim = { ...(data as PlanSimulation), plan };
    setSimulations((prev) => [sim, ...prev]);
    return sim;
  }, [user, boardId]);

  return {
    simulations,
    loading,
    refetch: fetchSimulations,
    generate,
    regenerate,
    createEmpty,
    savePlan,
    applyPlanOps,
    listVersions,
    restoreVersion,
    deleteSimulation,
    renameSimulation,
    loadChat,
    saveChatMessage,
    askAssistant,
  };
}
