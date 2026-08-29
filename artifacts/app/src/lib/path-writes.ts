import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STEP_XP, PathSnapshot, RevisionSource, StepMode, snapshotOf } from "@/lib/path-data";
import type { Path, PathStep } from "@/lib/path-data";

/**
 * Re-planning a path from outside the Paths screen.
 *
 * This lives here rather than inside `usePaths` because two callers need it and
 * they must not disagree: the Paths view, and the assistant applying a revision
 * it proposed mid-conversation. The rule about which steps survive a re-plan is
 * a rule, and a rule implemented twice is a rule that eventually drifts.
 */

export interface PlanStep {
  /** Present when the model is editing an existing step rather than adding one. */
  id?: string;
  title: string;
  stage?: string | null;
  mode?: StepMode;
  repsTarget?: number;
  xp?: number;
}

export interface RevisionRequest {
  userId: string;
  pathId: string;
  /** Why the plan changed. Stored on the revision row and shown in the history. */
  reason: string;
  source: RevisionSource;
  nextPlan: PlanStep[];
  /** Optionally rewrite the binding constraint in the same move. */
  diagnosis?: string | null;
}

/**
 * Snapshots the current plan, then replaces it.
 *
 * Steps the user has actually worked on are never deleted, whatever the new
 * plan says: the revision changes the map, and the logged days are the record.
 */
export async function revisePathPlan(req: RevisionRequest): Promise<{ ok: boolean; kept: number }> {
  const { userId, pathId, reason, source, nextPlan, diagnosis } = req;

  const [pathRes, stepsRes, logsRes] = await Promise.all([
    (supabase.from("paths" as any) as any)
      .select("id,name,category_id,archived,sort_order,diagnosis,diagnosis_verdict,diagnosis_actual,scored_at")
      .eq("id", pathId).maybeSingle(),
    (supabase.from("path_steps" as any) as any)
      .select("id,path_id,title,stage,mode,reps_target,reps_done,xp,done,done_at,sort_order,snoozed_until,created_at")
      .eq("path_id", pathId).order("sort_order", { ascending: true }),
    (supabase.from("path_step_logs" as any) as any).select("step_id").eq("path_id", pathId),
  ]);

  const path = pathRes?.data as Path | null;
  if (!path) return { ok: false, kept: 0 };
  const current = (stepsRes?.data as PathStep[]) || [];
  const loggedStepIds = new Set(((logsRes?.data as { step_id: string }[]) || []).map(l => l.step_id));

  const snapshot: PathSnapshot = snapshotOf(path, current);
  await (supabase.from("path_revisions" as any) as any).insert({
    user_id: userId,
    path_id: pathId,
    snapshot,
    reason: reason || null,
    source,
  });

  const keepIds = new Set(nextPlan.map(p => p.id).filter(Boolean) as string[]);
  const writes: Promise<unknown>[] = [];

  nextPlan.forEach((p, index) => {
    const mode: StepMode = p.mode || "once";
    const plan = {
      title: p.title,
      stage: p.stage ?? null,
      mode,
      reps_target: mode === "reps" ? Math.max(1, p.repsTarget || 7) : 1,
      xp: p.xp ?? DEFAULT_STEP_XP,
      sort_order: index,
    };
    if (p.id && current.some(s => s.id === p.id)) {
      writes.push((supabase.from("path_steps" as any) as any).update(plan).eq("id", p.id));
    } else {
      writes.push((supabase.from("path_steps" as any) as any)
        .insert({ ...plan, user_id: userId, path_id: pathId }));
    }
  });

  let kept = 0;
  for (const live of current) {
    if (keepIds.has(live.id)) continue;
    if (loggedStepIds.has(live.id) || live.reps_done > 0 || live.done) { kept++; continue; }
    writes.push((supabase.from("path_steps" as any) as any).delete().eq("id", live.id));
  }

  if (diagnosis !== undefined && diagnosis !== null && diagnosis !== path.diagnosis) {
    writes.push((supabase.from("paths" as any) as any).update({ diagnosis }).eq("id", pathId));
  }

  await Promise.all(writes);
  return { ok: true, kept };
}

/** Resolve the path the assistant referred to by name. Case- and space-insensitive. */
export async function findPathByName(userId: string, name: string): Promise<{ id: string; name: string } | null> {
  const { data } = await (supabase.from("paths" as any) as any)
    .select("id,name")
    .eq("user_id", userId)
    .eq("archived", false);
  const rows = (data as { id: string; name: string }[]) || [];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(name);
  return rows.find(r => norm(r.name) === target)
    || rows.find(r => norm(r.name).includes(target) || target.includes(norm(r.name)))
    || null;
}
