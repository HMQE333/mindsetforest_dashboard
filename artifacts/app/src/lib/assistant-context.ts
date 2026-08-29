import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/dashboard-data";
import { TRACKER_METRICS } from "@/lib/tracker-data";

export type ScopeId =
  | "dashboard"
  | "tracker"
  | "paths"
  | "planning"
  | "health"
  | "finance"
  | "oracle"
  | "archive"
  | "breathing"
  | "cooking"
  | "calendar"
  | "library";

export interface ScopeDef {
  id: ScopeId;
  label: string;
  icon: string;
}

export const SCOPES: ScopeDef[] = [
  { id: "dashboard", label: "Dashboard", icon: "🎮" },
  { id: "tracker", label: "Tracker stats", icon: "📊" },
  { id: "paths", label: "Paths", icon: "🪜" },
  { id: "planning", label: "Planning", icon: "🧠" },
  { id: "health", label: "Health", icon: "❤️" },
  { id: "finance", label: "Finance", icon: "💰" },
  { id: "oracle", label: "Oracle", icon: "🔮" },
  { id: "archive", label: "Archive", icon: "📦" },
  { id: "breathing", label: "Breathing", icon: "🫁" },
  { id: "cooking", label: "Cooking", icon: "🍳" },
  { id: "calendar", label: "Calendar", icon: "📅" },
  { id: "library", label: "Library", icon: "📚" },
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

async function gatherPaths(userId: string): Promise<string> {
  // Same fallback as usePaths: one column the database has not got yet must not
  // turn into "you have no paths", which is a confident, wrong answer.
  const readPaths = (cols: string) =>
    (supabase.from("paths" as never) as never as { select: (cols: string) => never })
      .select(cols)
      .eq("user_id", userId) as never as { data: any[] | null; error: any };

  let { data: paths, error } = await readPaths("id,name,category_id,archived,diagnosis");
  if (error) ({ data: paths } = await readPaths("id,name,category_id,archived"));
  if (!paths || paths.length === 0) return "No paths set up yet.";

  const { data: steps } = await (supabase.from("path_steps" as never) as never as { select: (cols: string) => never })
    .select("id,path_id,title,stage,mode,reps_target,reps_done,done,sort_order")
    .eq("user_id", userId) as never as { data: any[] | null };
  const all = steps || [];

  // The full ordered plan, not just a summary line: revise_path replaces the
  // whole list, so the model has to be able to see what it is rewriting.
  const lines = paths
    .filter((p) => !p.archived)
    .map((p) => {
      const mine = all.filter((s) => s.path_id === p.id).sort((a, b) => a.sort_order - b.sort_order);
      const done = mine.filter((s) => s.done).length;
      const head = `- ${p.name}${p.category_id ? ` [${catName(p.category_id)}]` : ""}: ${done}/${mine.length} steps done`;
      const diag = p.diagnosis ? `\n    constraint the user named: "${p.diagnosis}"` : "";
      const active = mine.find((s) => !s.done);
      const steps = mine
        .map((s) => {
          const mark = s.done ? "x" : s.id === active?.id ? ">" : " ";
          const reps = s.mode === "reps" ? ` (${s.reps_done}/${s.reps_target} days)` : "";
          const stage = s.stage ? `[${s.stage}] ` : "";
          return `    [${mark}] ${stage}${s.title}${reps}`;
        })
        .join("\n");
      return steps ? `${head}${diag}\n${steps}` : `${head}${diag}`;
    });
  return lines.length > 0 ? ["Paths:", ...lines].join("\n") : "All paths archived.";
}

async function gatherPlanning(userId: string): Promise<string> {
  const { data } = await (supabase.from("planning_tasks" as never) as never as { select: (cols: string) => never })
    .select("id,title,level,done,deadline,parent_id,notes")
    .eq("user_id", userId)
    .limit(500) as never as { data: any[] | null; error: unknown };
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

  // Build a tree view for the mindmap context
  const rootTasks = data.filter((t) => !t.parent_id);
  function buildTree(parentId: string | null, depth: number): string[] {
    const children = data.filter((t) => t.parent_id === parentId);
    if (children.length === 0) return [];
    const lines: string[] = [];
    const prefix = "  ".repeat(depth);
    for (const child of children) {
      const doneMark = child.done ? " ✓" : "";
      lines.push(`${prefix}- [${child.level}] ${child.title}${doneMark}`);
      lines.push(...buildTree(child.id, depth + 1));
    }
    return lines;
  }
  const tree = buildTree(null, 0);
  const treePreview = tree.length > 0 ? ["Mindmap tree:", ...tree.slice(0, 40)] : [];
  if (tree.length > 40) treePreview.push(`  ... and ${tree.length - 40} more nodes`);

  const parts = [
    `Planning: ${done}/${total} tasks done. Breakdown: ${Object.entries(byLevel).map(([l, n]) => `${l}=${n}`).join(", ")}.`,
  ];
  if (treePreview.length) parts.push(...treePreview);
  if (upcoming.length) parts.push("Upcoming deadlines:", ...upcoming);

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

async function gatherArchive(userId: string, question?: string): Promise<string> {
  // If there's a question, use semantic search to find relevant blocks
  if (question) {
    try {
      const { data, error } = await supabase.functions.invoke("ai-embed-block", {
        body: { action: "search", query: question },
      });
      if (error) throw error;
      const results = (data?.results || []) as Array<{
        id: string; title: string; content: string; similarity: number;
      }>;
      if (results.length === 0) return "Archive search found no matching blocks for your question.";
      return [
        `Archive search for "${question}". Top ${Math.min(results.length, 5)} matches:`,
        ...results.slice(0, 5).map((r, i) =>
          `--- Match ${i + 1} (${Math.round(r.similarity * 100)}%): ${r.title || "Untitled"} ---\n${(r.content || "").slice(0, 2000)}`
        ),
      ].join("\n\n");
    } catch (e) {
      console.error("Semantic archive search failed:", e);
      // Fall through to summary mode
    }
  }

  // Summary mode (no question, or search failed)
  const { data, count } = await supabase
    .from("archive_blocks" as never)
    .select("*", { count: "estimated", head: false })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const blocks = (data as unknown as Array<{ title: string; content: string; tags: string[]; pillars: string[]; directions: string[]; created_at: string }>) || [];
  if (blocks.length === 0) return "No archive blocks yet.";
  const tagCounts: Record<string, number> = {};
  for (const b of blocks) {
    for (const t of b.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
  const topTags = Object.entries(tagCounts).sort((a,b) => b[1]-a[1]).slice(0, 8).map(([t,n]) => `#${t} (${n})`).join(", ");
  const recent = blocks.slice(0, 6).map((b) => `- [${b.created_at?.slice(0,10)}] ${b.title || "Untitled"}`);
  return [
    `Archive: ${count ?? blocks.length} total blocks.`,
    topTags ? `Top tags: ${topTags}` : "",
    "Most recent:",
    ...recent,
  ].filter(Boolean).join("\n");
}

async function gatherBreathing(userId: string): Promise<string> {
  const { data } = await supabase
    .from("breathing_sessions")
    .select("pattern_id,duration_seconds,completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(10);
  if (!data || data.length === 0) return "No breathing sessions yet.";
  const total = data.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0);
  const patterns = [...new Set(data.map((s: any) => s.pattern_id))];
  const recent = data.slice(0, 5).map((s: any) => `- ${s.pattern_id}: ${Math.round(s.duration_seconds/60)}min on ${s.completed_at?.slice(0,10)}`);
  return [
    `Breathing: ${data.length} sessions, ${Math.round(total/60)} total minutes.`,
    `Patterns used: ${patterns.join(", ")}`,
    "Recent sessions:",
    ...recent,
  ].join("\n");
}

async function gatherCooking(userId: string): Promise<string> {
  const { data: recipes } = await supabase
    .from("cooking_recipes")
    .select("title,tags,cooking_time_minutes,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(15);
  const { data: plan } = await supabase
    .from("cooking_plan_entries")
    .select("meal_type,recipe_title,date")
    .eq("user_id", userId)
    .gte("date", daysAgoISO(7))
    .order("date", { ascending: false });
  const recipeList = (recipes || []) as any[];
  const planList = (plan || []) as any[];
  const parts: string[] = [];
  if (recipeList.length > 0) {
    const lines = recipeList.slice(0, 8).map((r: any) => `- ${r.title}${r.cooking_time_minutes ? ` (${r.cooking_time_minutes}min)` : ""}${r.tags?.length ? ` [${r.tags.join(", ")}]` : ""}`);
    parts.push(`Recipes (${recipeList.length} total):`, ...lines);
  }
  if (planList.length > 0) {
    const lines = planList.slice(0, 5).map((p: any) => `- ${p.date}: ${p.meal_type}. ${p.recipe_title}`);
    parts.push(`Meal plan (last 7 days, ${planList.length} entries):`, ...lines);
  }
  return parts.length > 0 ? parts.join("\n") : "No cooking recipes or meal plans yet.";
}

async function gatherCalendar(userId: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const { data } = await supabase
    .from("calendar_events")
    .select("title,start_time,end_time,all_day,color")
    .eq("user_id", userId)
    .gte("start_time", today)
    .lte("start_time", future)
    .order("start_time")
    .limit(30);
  if (!data || data.length === 0) return "No upcoming calendar events in the next 30 days.";
  const lines = (data as any[]).map((e: any) => {
    const time = e.all_day ? "all day" : e.start_time?.slice(11, 16) || "";
    return `- ${e.start_time?.slice(0,10)} ${time}: ${e.title}`;
  });
  return [`Calendar: ${data.length} upcoming events in next 30 days:`, ...lines].join("\n");
}

async function gatherLibrary(userId: string): Promise<string> {
  const { data } = await supabase
    .from("library_shares")
    .select("title,type,category,tags,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!data || data.length === 0) return "No library items shared yet.";
  const items = data as any[];
  const byType: Record<string, number> = {};
  for (const i of items) byType[i.type] = (byType[i.type] || 0) + 1;
  const recent = items.slice(0, 8).map((i: any) => `- ${i.title} [${i.type}]${i.tags?.length ? ` tags: ${i.tags.join(", ")}` : ""}`);
  return [
    `Library: ${items.length} shared items. Types: ${Object.entries(byType).map(([t,n]) => `${t}(${n})`).join(", ")}`,
    "Recent:",
    ...recent,
  ].join("\n");
}

const GATHERERS: Record<ScopeId, (userId: string, question?: string) => Promise<string>> = {
  dashboard: gatherDashboard,
  tracker: gatherTracker,
  paths: gatherPaths,
  planning: gatherPlanning,
  health: gatherHealth,
  finance: gatherFinance,
  oracle: gatherOracle,
  archive: gatherArchive,
  breathing: gatherBreathing,
  cooking: gatherCooking,
  calendar: gatherCalendar,
  library: gatherLibrary,
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
  question?: string,
): Promise<{ text: string; citations: Citation[] }> {
  const sections: string[] = [];
  const citations: Citation[] = [];

  for (const scope of scopes) {
    const gatherer = GATHERERS[scope];
    if (!gatherer) continue;
    let body: string;
    try {
      body = await gatherer(userId, question);
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
