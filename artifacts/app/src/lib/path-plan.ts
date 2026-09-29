/** Pure plan helpers, kept apart from path-writes so they can be unit-tested without the Supabase client. */

const normTitle = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

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
