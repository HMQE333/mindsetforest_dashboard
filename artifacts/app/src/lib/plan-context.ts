import { supabase } from "@/integrations/supabase/client";
import { gatherContext, ScopeId } from "@/lib/assistant-context";

/**
 * Context the plan assistant gets about the user. It reuses the assistant's
 * existing per-section gatherers, plus one extra rule:
 *
 * **The productivity/consistency picture is only included once there is enough
 * history to justify it.** With a fresh or nearly-empty account the assistant
 * is told, explicitly, that it must not read anything into streaks or
 * completion counts — no "you have not been consistent" from three days of
 * data.
 */

/** Minimum signal before productivity history is worth interpreting. */
const MIN_ACTIVE_DAYS = 14;
const MIN_COMPLETIONS = 30;
const MIN_ACCOUNT_DAYS = 21;

/** Sections that describe how the user actually spends their days. */
const PRODUCTIVITY_SCOPES: ScopeId[] = ["dashboard", "tracker", "habitloop"];

/** Sections that describe *what* the user is working on (safe from day one). */
const STRUCTURE_SCOPES: ScopeId[] = ["planning", "ladder"];

export interface ProductivityReadiness {
  enough: boolean;
  activeDays: number;
  completions: number;
  accountDays: number;
}

export async function checkProductivityHistory(userId: string): Promise<ProductivityReadiness> {
  let activeDays = 0;
  let completions = 0;
  let accountDays = 0;

  try {
    const { data } = await supabase
      .from("daily_completions")
      .select("date,missions_completed")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(400);
    const rows = (data || []) as Array<{ date: string; missions_completed: number | null }>;
    activeDays = rows.filter((r) => (r.missions_completed || 0) > 0).length;
    completions = rows.reduce((sum, r) => sum + (r.missions_completed || 0), 0);
    if (rows.length > 0) {
      const first = new Date(rows[0].date).getTime();
      if (Number.isFinite(first)) accountDays = Math.max(0, Math.round((Date.now() - first) / 86400000));
    }
  } catch {
    // Treat an unreadable history as "not enough" — the safe direction.
  }

  const enough = activeDays >= MIN_ACTIVE_DAYS && completions >= MIN_COMPLETIONS && accountDays >= MIN_ACCOUNT_DAYS;
  return { enough, activeDays, completions, accountDays };
}

/**
 * Builds the context block for the plan chat. `extraScopes` lets the user opt
 * additional sections in from the chat itself.
 */
export async function gatherPlanContext(
  userId: string,
  extraScopes: ScopeId[] = [],
  question?: string,
): Promise<{ text: string; usedProductivity: boolean; readiness: ProductivityReadiness }> {
  const readiness = await checkProductivityHistory(userId);

  const scopes = new Set<ScopeId>([...STRUCTURE_SCOPES, ...extraScopes]);
  if (readiness.enough) for (const s of PRODUCTIVITY_SCOPES) scopes.add(s);
  else for (const s of PRODUCTIVITY_SCOPES) scopes.delete(s);

  const { text } = await gatherContext(userId, Array.from(scopes), [], question);

  const guard = readiness.enough
    ? `## ⏱️ How to read the productivity data\nThere is enough history (${readiness.activeDays} active days, ${readiness.completions} completed missions) to reason about patterns. Still describe, never scold.`
    : `## ⏱️ Productivity history withheld\nThis account does not yet have enough history to say anything about the user's consistency (${readiness.activeDays} active day(s), ${readiness.completions} completed mission(s)), so that data is deliberately NOT included above.\nYou must not comment on, infer, or plan around the user's consistency, streaks, discipline or follow-through. Do not say they are inconsistent, do not congratulate them on streaks, and do not add steps whose purpose is to fix a habit problem you have no evidence for. Plan as if for a capable person you have just met.`;

  return { text: `${text}\n\n${guard}`.trim(), usedProductivity: readiness.enough, readiness };
}
