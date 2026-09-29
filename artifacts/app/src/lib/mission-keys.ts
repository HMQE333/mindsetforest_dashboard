import { CATEGORIES, type Mission, type MissionVariant } from "@/lib/dashboard-data";

/**
 * Home identifies a mission by its position: the completion mark and the
 * rolled variant of the third mission in "body" are both stored under
 * `body-2`, indexing the category's full list (every weekday, not just the
 * ones shown today). These helpers keep those keys pointing at the same
 * mission when the list changes, and read back what a key stands for.
 */

/** The list a category's keys index: the custom one if set, else the built-in defaults. */
export function categoryMissions(customMissions: Record<string, Mission[]>, categoryId: string): Mission[] {
  const custom = customMissions[categoryId];
  return custom && custom.length > 0 ? custom : CATEGORIES.find((c) => c.id === categoryId)?.missions || [];
}

/** The mission as shown today: the rolled variant's title, text and XP when it has variants. */
export function withVariant(mission: Mission, rolledIndex: number | undefined): Mission {
  const variants = mission.variants;
  if (!variants || variants.length === 0) return mission;
  const v = variants[Math.min(Math.max(0, rolledIndex ?? 0), variants.length - 1)];
  return { ...mission, title: v.title, description: v.description, duration: v.duration, xp: v.xp, url: v.url };
}

/** Split `body-2` into its category and index; null for anything else. */
function parseKey(key: string): { categoryId: string; index: number } | null {
  const at = key.lastIndexOf("-");
  if (at <= 0 || !/^\d+$/.test(key.slice(at + 1))) return null;
  return { categoryId: key.slice(0, at), index: Number(key.slice(at + 1)) };
}

/**
 * Title and XP of every ticked mission as Home shows it: the full list indexed
 * by the key (not today's weekday-filtered one), with the rolled variant.
 */
export function completedMissionDetails(
  completed: Iterable<string>,
  customMissions: Record<string, Mission[]>,
  rolledVariants: Record<string, number>,
): { title: string; xp: number }[] {
  const out: { title: string; xp: number }[] = [];
  for (const key of completed) {
    const k = parseKey(key);
    const m = k ? categoryMissions(customMissions, k.categoryId)[k.index] : undefined;
    if (!m) continue;
    const shown = withVariant(m, rolledVariants[key]);
    out.push({ title: shown.title, xp: Number(shown.xp) || 0 });
  }
  return out;
}

const normTitle = (s: string | undefined) => (s || "").trim().toLowerCase();

/**
 * For each mission of a new list, the index it had in the old one: the
 * `__originalIndex` an editor carried through, else the first unclaimed old
 * mission with the same title, else null (a new mission).
 */
export function missionSources(oldList: Mission[], newList: Mission[]): (number | null)[] {
  const claimed = new Set<number>();
  const sources = newList.map((m) => {
    const i = m.__originalIndex;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= oldList.length || claimed.has(i)) return null;
    claimed.add(i);
    return i;
  });
  return sources.map((src, j) => {
    if (src !== null) return src;
    const title = normTitle(newList[j].title);
    if (!title) return null;
    const i = oldList.findIndex((m, k) => !claimed.has(k) && normTitle(m.title) === title);
    if (i < 0) return null;
    claimed.add(i);
    return i;
  });
}

/**
 * Re-key one category's completion marks and rolled variants after its list
 * changed, given where each new mission came from (`sources[j]` = old index).
 * A tick follows its mission, so it can't be earned twice or land on a
 * neighbour; ticks of dropped missions go (their XP stays earned). A kept
 * mission keeps its rolled variant if it still exists; others roll fresh.
 * Other categories' keys are returned untouched.
 */
export function remapCategoryKeys(
  categoryId: string,
  sources: (number | null)[],
  newList: Mission[],
  completed: Iterable<string>,
  rolled: Record<string, number>,
  roll: (variants: MissionVariant[]) => number,
): { completed: Set<string>; rolled: Record<string, number> } {
  const ownKey = (key: string) => parseKey(key)?.categoryId === categoryId;
  const newIndexOf = new Map<number, number>();
  sources.forEach((src, j) => { if (src !== null) newIndexOf.set(src, j); });

  const nextCompleted = new Set<string>();
  for (const key of completed) {
    if (!ownKey(key)) { nextCompleted.add(key); continue; }
    const j = newIndexOf.get(parseKey(key)!.index);
    if (j !== undefined) nextCompleted.add(`${categoryId}-${j}`);
  }

  const nextRolled: Record<string, number> = {};
  for (const [key, v] of Object.entries(rolled)) if (!ownKey(key)) nextRolled[key] = v;
  newList.forEach((m, j) => {
    if (!m.variants || m.variants.length === 0) return;
    const src = sources[j];
    const kept = src !== null && src !== undefined ? rolled[`${categoryId}-${src}`] : undefined;
    nextRolled[`${categoryId}-${j}`] =
      typeof kept === "number" && Number.isInteger(kept) && kept >= 0 && kept < m.variants.length ? kept : roll(m.variants);
  });

  return { completed: nextCompleted, rolled: nextRolled };
}

/** Drop the runtime-only `__originalIndex` before a list is stored. */
export function stripOriginalIndex(list: Mission[]): Mission[] {
  return list.map((m) => {
    if (!("__originalIndex" in m)) return m;
    const { __originalIndex: _drop, ...rest } = m;
    return rest;
  });
}

/** A category's full list tagged with each mission's index, for editors that save the whole list back. */
export function taggedMissions(customMissions: Record<string, Mission[]>, categoryId: string): Mission[] {
  return categoryMissions(customMissions, categoryId).map((m, i) => ({ ...m, __originalIndex: i }));
}
