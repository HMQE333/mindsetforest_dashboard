import { CATEGORIES, type Mission } from "@/lib/dashboard-data";
import { logicalDate } from "@/lib/today";

/**
 * Today's mission list as one flat table, shared by the assistant context
 * (so the model can name missions exactly) and the complete_mission executor
 * (so a spoken "I did the pushups" lands on the right checkbox).
 */
export interface MissionEntry {
  categoryId: string;
  categoryName: string;
  /** Index into the unfiltered list: the completion id is `${categoryId}-${index}`. */
  index: number;
  title: string;
  xp: number;
  done: boolean;
}

// The weekday of the app's day (04:00 boundary), so at 01:00 on Tuesday the
// missions shown are still Monday's, like the date they are recorded under.
export function isMissionVisibleToday(mission: Mission, today: number = logicalDate().getDay()): boolean {
  if (!mission.daysOfWeek || mission.daysOfWeek.length === 0 || mission.daysOfWeek.length === 7) return true;
  return mission.daysOfWeek.includes(today);
}

export function listTodayMissions(
  customMissions: Record<string, Mission[]>,
  completed: Iterable<string>,
  projectNames: Record<string, string> = {},
  today: number = logicalDate().getDay(),
): MissionEntry[] {
  const done = new Set(completed);
  const out: MissionEntry[] = [];
  const push = (categoryId: string, categoryName: string, list: Mission[]) => {
    list.forEach((m, index) => {
      if (!m || typeof m.title !== "string" || !isMissionVisibleToday(m, today)) return;
      out.push({
        categoryId,
        categoryName,
        index,
        title: m.title,
        xp: Number(m.xp) || 0,
        done: done.has(`${categoryId}-${index}`),
      });
    });
  };
  for (const c of CATEGORIES) {
    const custom = customMissions[c.id];
    push(c.id, c.name, custom && custom.length > 0 ? custom : c.missions);
  }
  for (const [key, list] of Object.entries(customMissions)) {
    if (!key.startsWith("project-") || !Array.isArray(list) || list.length === 0) continue;
    push(key, projectNames[key] || projectNames[key.slice("project-".length)] || "Project", list);
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ąćęłńóśźż\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Best mission for a spoken or typed title. Exact match first, then a unique
 * containment either way, then the entry sharing the most words (needs at
 * least two shared words, or one when the title is a single word).
 */
export function findMission(entries: MissionEntry[], title: string, categoryId?: string): MissionEntry | null {
  const wanted = norm(title);
  if (!wanted) return null;
  const pool = categoryId ? entries.filter((e) => e.categoryId === categoryId) : entries;
  const candidates = pool.length > 0 ? pool : entries;

  const exact = candidates.filter((e) => norm(e.title) === wanted);
  if (exact.length > 0) return exact.find((e) => !e.done) ?? exact[0];

  const contains = candidates.filter((e) => {
    const t = norm(e.title);
    return t.includes(wanted) || wanted.includes(t);
  });
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) return contains.find((e) => !e.done) ?? contains[0];

  const words = new Set(wanted.split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)));
  if (words.size === 0) return null;
  const scored = candidates
    .map((e) => ({ e, shared: norm(e.title).split(" ").filter((w) => words.has(w)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || Number(a.e.done) - Number(b.e.done));
  if (scored.length === 0) return null;
  const top = scored[0];
  const contenders = scored.filter((x) => x.shared === top.shared);
  // Two shared words is a match; one shared word only when nothing else shares any.
  if (top.shared >= 2 || scored.length === 1) return contenders.find((x) => !x.e.done)?.e ?? top.e;
  return null;
}

/** Filler words a spoken request carries that say nothing about which mission. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "was", "were", "did", "done", "already", "finished", "completed",
  "mission", "missions", "task", "today", "just", "have", "had",
  "moja", "moje", "moj", "swoja", "swoje", "misja", "misje", "misji", "misje", "zadanie", "zrobic", "zrobilem",
  "zrobilam", "skonczylem", "skonczylam", "dzis", "dzisiaj", "juz", "wlasnie", "oraz", "dla",
]);

/** Compact one-line-per-pillar rendering for the assistant context. */
export function formatMissionList(entries: MissionEntry[]): string {
  const groups = new Map<string, MissionEntry[]>();
  for (const e of entries) {
    const list = groups.get(e.categoryId) ?? [];
    list.push(e);
    groups.set(e.categoryId, list);
  }
  const lines: string[] = [];
  for (const list of groups.values()) {
    const name = list[0].categoryName;
    const items = list.map((e) => `${e.done ? "[x]" : "[ ]"} ${e.title} (+${e.xp} XP)`).join("; ");
    lines.push(`- ${name} (${list[0].categoryId}): ${items}`);
  }
  return lines.join("\n");
}
