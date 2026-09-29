/** Pure plan helpers, kept apart from path-writes so they can be unit-tested without the Supabase client. */

import { DEFAULT_STEP_XP, StepMode } from "@/lib/path-data";

const normTitle = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Pairs each planned step with the live step it edits: by id when the caller
 * gave one, otherwise by title (accent- and case-insensitive), each live step
 * used at most once. The assistant only ever speaks in titles, so without this
 * every rewrite that kept a step's name would add a duplicate next to it.
 */
export function matchPlanToCurrent<T extends { id?: string; title: string }>(
  nextPlan: T[],
  current: { id: string; title: string }[],
): (string | null)[] {
  const used = new Set<string>();
  const byId = new Map(current.map(s => [s.id, s]));
  const out: (string | null)[] = nextPlan.map(p => {
    if (p.id && byId.has(p.id) && !used.has(p.id)) { used.add(p.id); return p.id; }
    return null;
  });
  nextPlan.forEach((p, i) => {
    if (out[i]) return;
    const want = normTitle(p.title);
    const hit = current.find(s => !used.has(s.id) && normTitle(s.title) === want);
    if (hit) { used.add(hit.id); out[i] = hit.id; }
  });
  return out;
}

/**
 * The columns a planned step writes. When it edits a live step, whatever the
 * plan leaves out (mode, target, XP) is kept from that step: a rewrite that
 * restates a title must not turn a 30-day habit into a one-off worth 20 XP.
 * A new step falls back to the defaults.
 */
export function planStepFields(
  p: { title: string; stage?: string | null; mode?: StepMode; repsTarget?: number; xp?: number },
  live: { mode: StepMode; reps_target: number; xp: number } | null | undefined,
  sortOrder: number,
) {
  const mode: StepMode = p.mode || live?.mode || "once";
  const liveTarget = live?.mode === "reps" ? live.reps_target : undefined;
  return {
    title: p.title,
    stage: p.stage ?? null,
    mode,
    reps_target: mode === "reps" ? Math.max(1, p.repsTarget || liveTarget || 7) : 1,
    xp: p.xp ?? live?.xp ?? DEFAULT_STEP_XP,
    sort_order: sortOrder,
  };
}

/** Sort order for a step appended after `siblings`, past the highest one even when older rows left gaps or repeats. */
export function nextSortOrder(siblings: { sort_order: number }[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.sort_order), -1) + 1;
}

/**
 * Moves one step up or down an ordered list and renumbers it 0..n-1. Swapping
 * the two sort_order values is a no-op when they are equal, which older rows
 * can be; renumbering means a move always moves. Returns only the rows whose
 * sort_order changed, or null when the step cannot go that way.
 */
export function moveStepOrder(
  ordered: { id: string; sort_order: number }[],
  id: string,
  direction: -1 | 1,
): { id: string; sort_order: number }[] | null {
  const from = ordered.findIndex(s => s.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return null;
  const next = [...ordered];
  [next[from], next[to]] = [next[to], next[from]];
  return next
    .map((s, i) => ({ id: s.id, sort_order: i, before: s.sort_order }))
    .filter(s => s.before !== s.sort_order)
    .map(({ id: stepId, sort_order }) => ({ id: stepId, sort_order }));
}
