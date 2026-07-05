import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/dashboard-data";
import { TRACKER_METRICS } from "@/lib/tracker-data";

export type ScopeId =
  | "dashboard"
  | "tracker"
  | "ladder"
  | "habitloop"
  | "planning"
  | "health"
  | "finance"
  | "oracle";

export interface ScopeDef {
  id: ScopeId;
  label: string;
  icon: string;
}

export const SCOPES: ScopeDef[] = [
  { id: "dashboard", label: "Dashboard", icon: "🎮" },
  { id: "tracker", label: "Tracker stats", icon: "📊" },
  { id: "ladder", label: "Ladder", icon: "🪜" },
  { id: "habitloop", label: "Habit Loop", icon: "🔄" },
  { id: "planning", label: "Planning", icon: "🧠" },
  { id: "health", label: "Health", icon: "❤️" },
  { id: "finance", label: "Finance", icon: "💰" },
  { id: "oracle", label: "Oracle", icon: "🔮" },
];

export const SCOPE_MAP: Record<ScopeId, ScopeDef> = Object.fromEntries(
  SCOPES.map((s) => [s.id, s]),
) as Record<ScopeId, ScopeDef>;

export interface ArchiveItemRef {
  id: string;
  title: string;
}

export interface Citation {
  key: string;
  label: string;
  icon: string;
}

const catName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name || id;
const metricLabel = (id: string) => TRACKER_METRICS.find((m) => m.id === id)?.label || id;

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().split("T")[0];
}

async function gatherDashboard(userId: string): Promise<string> {
  const { data } = await supabase
    .from("dashboard_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "No dashboard activity recorded yet.";
  const cats = (data.categories_engaged || []).map(catName).join(", ") || "none";
  return [
    `Total XP: ${data.current_xp}`,
    `Level: ${data.current_level}`,
    `Current streak: ${data.streak_days} day(s)`,
    `Missions completed today: ${data.missions_completed}`,
    `Categories engaged today: ${cats}`,
    `Last completion date: ${data.last_completion_date || "none"}`,
  ].join("\n");
}

async function gatherTracker(userId: string): Promise<string> {
  const since = daysAgoISO(30);
  const { data } = await supabase
    .from("tracker_entries")
    .select("metric_id,value,date")
    .eq("user_id", userId)
    .gte("date", since);
  if (!data || data.length === 0) return "No tracker entries in the last 30 days.";

  const totals: Record<string, number> = {};
  const days: Record<string, Set<string>> = {};
  const allDays = new Set<string>();
  for (const e of data) {
    totals[e.metric_id] = (totals[e.metric_id] || 0) + Number(e.value || 0);
    (days[e.metric_id] ||= new Set()).add(e.date);
    allDays.add(e.date);
  }
  const lines = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([id, total]) => `- ${metricLabel(id)}: ${Math.round(total * 10) / 10} total over ${days[id].size} active day(s)`);
  return [
    `Tracker summary for the last 30 days (${allDays.size} active days):`,
    ...lines,
  ].join("\n");
}

async function gatherLadder(userId: string): Promise<string> {
  const { data } = await supabase
    .from("ladder_state")
    .select("ladders,active_category")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.ladders) return "No ladder data yet.";
  const ladders = data.ladders as Record<string, { levels?: Record<string, Array<{ text?: string; completed?: boolean }>> }>;
  const lines: string[] = [];
  for (const [cat, ladder] of Object.entries(ladders)) {
    let total = 0;
    let done = 0;
    Object.values(ladder?.levels || {}).forEach((tasks) => {
      (tasks || []).forEach((t) => {
        total++;
        if (t.completed) done++;
      });
    });
    if (total > 0) lines.push(`- ${catName(cat)}: ${done}/${total} rungs completed`);
  }
  if (lines.length === 0) return "No ladder rungs created yet.";
  return [`Active ladder: ${catName(data.active_category || "")}`, ...lines].join("\n");
}

async function gatherHabitLoop(userId: string): Promise<string> {
  const { data } = await supabase
    .from("habit_loops")
    .select("category_id,current_loop,loops")
    .eq("user_id", userId);
  if (!data || data.length === 0) return "No habit loops set up yet.";
  const lines = (data as Array<{ category_id: string; current_loop: number; loops: unknown }>).map((row) => {
    const loops = Array.isArray(row.loops) ? row.loops : [];
    return `- ${catName(row.category_id)}: ${loops.length} loop(s), currently on loop ${(row.current_loop || 0) + 1}`;
  });
  return ["Habit loop progress:", ...lines].join("\n");
}

async function gatherPlanning(userId: string): Promise<string> {
  const { data } = await supabase
    .from("planning_tasks")
    .select("title,level,done,deadline")
    .eq("user_id", userId)
    .limit(300);
  if (!data || data.length === 0) return "No planning tasks yet.";
  const total = data.length;
  const done = data.filter((t) => t.done).length;
  const byLevel: Record<string, number> = {};
  for (const t of data) byLevel[t.level] = (byLevel[t.level] || 0) + 1;
  const upcoming = data
    .filter((t) => !t.done && t.deadline)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 8)
    .map((t) => `- ${t.title} (due ${t.deadline})`);
  const openTitles = data
    .filter((t) => !t.done)
    .slice(0, 12)
    .map((t) => `- ${t.title} [${t.level}]`);
  const parts = [
    `Planning: ${done}/${total} tasks done. Breakdown: ${Object.entries(byLevel).map(([l, n]) => `${l}=${n}`).join(", ")}.`,
  ];
  if (upcoming.length) parts.push("Upcoming deadlines:", ...upcoming);
  if (openTitles.length) parts.push("Open tasks (sample):", ...openTitles);
  return parts.join("\n");
}

async function gatherHealth(userId: string): Promise<string> {
  const { data } = await supabase
    .from("health_entries")
    .select("entry_date,weight_kg,bp_systolic,bp_diastolic,resting_hr,fasting_glucose_mgdl,self_rating,notes")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .limit(5);
  if (!data || data.length === 0) return "No health entries recorded yet.";
  const lines = data.map((e) => {
    const bits: string[] = [`${e.entry_date}`];
    if (e.weight_kg != null) bits.push(`weight ${e.weight_kg}kg`);
    if (e.bp_systolic != null && e.bp_diastolic != null) bits.push(`BP ${e.bp_systolic}/${e.bp_diastolic}`);
    if (e.resting_hr != null) bits.push(`RHR ${e.resting_hr}`);
    if (e.fasting_glucose_mgdl != null) bits.push(`glucose ${e.fasting_glucose_mgdl}`);
    bits.push(`self-rating ${e.self_rating}/10`);
    return `- ${bits.join(", ")}`;
  });
  return ["Most recent health entries:", ...lines].join("\n");
}

async function gatherFinance(userId: string): Promise<string> {
  const since = daysAgoISO(90);
  const { data } = await supabase
    .from("finance_transactions")
    .select("type,title,amount,category,date")
    .eq("user_id", userId)
    .gte("date", since)
    .order("date", { ascending: false })
    .limit(200);
  if (!data || data.length === 0) return "No finance transactions in the last 90 days.";
  let income = 0;
  let expenses = 0;
  const byCat: Record<string, number> = {};
  for (const t of data) {
    const amt = Number(t.amount || 0);
    if (t.type === "income" || t.type === "loan_in") income += amt;
    if (t.type === "expense" || t.type === "subscription" || t.type === "loan_out") {
      expenses += amt;
      byCat[t.category] = (byCat[t.category] || 0) + amt;
    }
  }
  const topCats = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, n]) => `- ${c}: ${Math.round(n)}`);
  const recent = data.slice(0, 8).map((t) => `- ${t.date} ${t.type}: ${t.title} (${Math.round(Number(t.amount))})`);
  return [
    `Finance (last 90 days): income ${Math.round(income)}, expenses ${Math.round(expenses)}, net ${Math.round(income - expenses)}.`,
    "Top expense categories:",
    ...topCats,
    "Recent transactions:",
    ...recent,
  ].join("\n");
}

async function gatherOracle(userId: string): Promise<string> {
  const { data } = await supabase
    .from("oracle_state")
    .select("oracle_xp,total_xp_sacrificed,rewards_purchased")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "No oracle activity yet.";
  const rewards = Array.isArray(data.rewards_purchased) ? data.rewards_purchased.length : 0;
  return [
    `Oracle XP available: ${data.oracle_xp}`,
    `Total XP sacrificed: ${data.total_xp_sacrificed}`,
    `Rewards purchased: ${rewards}`,
  ].join("\n");
}

const GATHERERS: Record<ScopeId, (userId: string) => Promise<string>> = {
  dashboard: gatherDashboard,
  tracker: gatherTracker,
  ladder: gatherLadder,
  habitloop: gatherHabitLoop,
  planning: gatherPlanning,
  health: gatherHealth,
  finance: gatherFinance,
  oracle: gatherOracle,
};

async function gatherArchiveItems(userId: string, items: ArchiveItemRef[]): Promise<string> {
  const ids = items.map((i) => i.id);
  const { data } = await supabase
    .from("archive_blocks" as never)
    .select("title,content")
    .eq("user_id", userId)
    .in("id", ids);
  if (!data || (data as unknown[]).length === 0) return "The selected archive item(s) could not be loaded.";
  return (data as Array<{ title: string; content: string }>)
    .map((b) => `--- Archive note: ${b.title || "Untitled"} ---\n${(b.content || "").slice(0, 4000)}`)
    .join("\n\n");
}

/** Search archive block titles for the in-chat item picker (titles only, lean). */
export async function searchArchiveItems(userId: string, query: string): Promise<ArchiveItemRef[]> {
  let q = supabase
    .from("archive_blocks" as never)
    .select("id,title")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (query.trim()) q = (q as never as { ilike: (c: string, v: string) => typeof q }).ilike("title", `%${query.trim()}%`);
  const { data } = await q;
  return ((data as unknown as Array<{ id: string; title: string }>) || []).map((b) => ({
    id: b.id,
    title: b.title || "Untitled",
  }));
}

export async function gatherContext(
  userId: string,
  scopes: ScopeId[],
  archiveItems: ArchiveItemRef[] = [],
): Promise<{ text: string; citations: Citation[] }> {
  const sections: string[] = [];
  const citations: Citation[] = [];

  for (const scope of scopes) {
    const gatherer = GATHERERS[scope];
    if (!gatherer) continue;
    let body: string;
    try {
      body = await gatherer(userId);
    } catch (e) {
      body = "(section unavailable)";
    }
    const def = SCOPE_MAP[scope];
    sections.push(`## ${def.icon} ${def.label}\n${body}`);
    citations.push({ key: scope, label: def.label, icon: def.icon });
  }

  if (archiveItems.length > 0) {
    let body: string;
    try {
      body = await gatherArchiveItems(userId, archiveItems);
    } catch {
      body = "(archive items unavailable)";
    }
    sections.push(`## 📦 Archive items\n${body}`);
    for (const it of archiveItems) {
      citations.push({ key: `archive:${it.id}`, label: it.title, icon: "📦" });
    }
  }

  return { text: sections.join("\n\n"), citations };
}
