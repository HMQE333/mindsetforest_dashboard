import { supabase } from "@/integrations/supabase/client";
import { CATEGORIES } from "@/lib/dashboard-data";
import { TRACKER_METRICS } from "@/lib/tracker-data";
import { addDays, logicalDate, todayKey } from "@/lib/today";
import {
  aggregateUsage,
  classifyAll,
  formatHm,
  APP_KINDS,
  type AppKind,
  type UsageAggregate,
  type UsageSession,
} from "@/lib/app-usage-classify";
import { DAILY_COLUMNS, dailyRowToSession, rowToClass, rowToRule } from "@/lib/app-usage-rows";
import { formatMissionList, listTodayMissions } from "@/lib/mission-match";
import { parseMissionMap } from "@/lib/mission-presets";
import { loadMetrics } from "@/lib/assistant-writes";

export type ScopeId =
  | "dashboard"
  | "tracker"
  | "computer"
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
  /** One line for the router model: what this section contains. */
  description: string;
}

export const SCOPES: ScopeDef[] = [
  { id: "dashboard", label: "Dashboard", icon: "🎮", description: "Home: XP, level, streak, today's missions per pillar with done/not-done, saved mission presets. Needed to tick missions, load presets, add missions." },
  { id: "tracker", label: "Tracker stats", icon: "📊", description: "Daily tracked metrics for the last 30 days (sleep, steps, reading minutes, custom numbers), totals and active days." },
  { id: "computer", label: "Komputer", icon: "💻", description: "Screen time from the desktop tracker: apps and window titles by day, work vs waste vs learning classes, folders and rules." },
  { id: "paths", label: "Paths", icon: "🪜", description: "Long-term goals as paths with ordered steps, the active step, reps logged per day, diagnoses of the binding constraint. Needed for revise_path." },
  { id: "planning", label: "Planning", icon: "🧠", description: "Planning board: tasks with deadlines, mindmap trees of goals/phases/tasks, what is overdue. Needed for add_task and mindmap actions." },
  { id: "health", label: "Health", icon: "❤️", description: "Health log: weight, workouts, watch data (HRV, resting HR, sleep), lab results, recovery." },
  { id: "finance", label: "Finance", icon: "💰", description: "Money: income, expenses by category, subscriptions, monthly totals and budgets." },
  { id: "oracle", label: "Oracle", icon: "🔮", description: "Oracle: XP sacrifices, rewards and boons the user bought with XP, reward history." },
  { id: "archive", label: "Archive", icon: "📦", description: "Archive of notes and ideas with tags and pillars; a semantic search over the notes for the question. Needed for add_note and questions about what the user wrote down." },
  { id: "breathing", label: "Breathing", icon: "🫁", description: "Breathing exercise sessions: patterns practised, minutes, frequency." },
  { id: "cooking", label: "Cooking", icon: "🍳", description: "Recipes, meal plans, ingredients and cooking history." },
  { id: "calendar", label: "Calendar", icon: "📅", description: "Calendar events for the coming days: appointments, blocks, deadlines with times." },
  { id: "library", label: "Library", icon: "📚", description: "Books and courses: reading list, progress, finished titles, notes per book." },
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
  return addDays(todayKey(), -days);
}

async function gatherDashboard(userId: string): Promise<string> {
  const [{ data }, { data: presets }, { data: projects }, { data: reviews }] = await Promise.all([
    supabase.from("dashboard_state").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("mission_presets")
      .select("name,emoji,description")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .limit(30),
    supabase.from("user_projects").select("id,name").eq("user_id", userId),
    supabase.from("reviews").select("kind,period,qa").eq("user_id", userId).eq("status", "done").order("created_at", { ascending: false }).limit(2),
  ]);
  // The user's own account of recent days, from the morning review.
  const reviewLine = (reviews || []).length > 0
    ? "Recent reviews (the user's own words):\n" + (reviews || [])
        .map((r) => `- ${r.kind} ${r.period}: ` + ((r.qa as { question: string; answer: string }[] | null) || [])
          .map((x) => `${x.question} -> ${x.answer}`).join(" | "))
        .join("\n")
    : "";
  const presetLine =
    presets && presets.length > 0
      ? "Saved mission presets (loadable with apply_preset): " +
        presets.map((p) => `"${p.name}"${p.description ? ` - ${p.description}` : ""}`).join("; ")
      : "Saved mission presets: none";
  if (!data) return ["No dashboard activity recorded yet.", presetLine].join("\n");
  const cats = (data.categories_engaged || []).map(catName).join(", ") || "none";
  // Completions belong to the day the row was last written; after the 04:00
  // rollover (done on the client) they are stale, so show them as not done.
  const sameDay = !data.day_key || data.day_key === todayKey();
  const projectNames: Record<string, string> = {};
  for (const p of projects || []) projectNames[`project-${p.id}`] = p.name;
  const missions = listTodayMissions(parseMissionMap(data.custom_missions), sameDay ? data.completed_missions || [] : [], projectNames);
  const missionBlock = missions.length > 0
    ? "Today's missions ([x] done, [ ] not yet; use complete_mission with the exact title to tick one):\n" + formatMissionList(missions)
    : "Today's missions: none";
  return [
    `Total XP: ${data.current_xp}`,
    `Level: ${data.current_level}`,
    `Current streak: ${data.streak_days} day(s)`,
    `Missions completed today: ${data.missions_completed}`,
    `Categories engaged today: ${cats}`,
    `Last completion date: ${data.last_completion_date || "none"}`,
    missionBlock,
    presetLine,
    reviewLine,
  ].filter(Boolean).join("\n");
}

async function gatherTracker(userId: string): Promise<string> {
  const since = daysAgoISO(30);
  const [{ data }, metrics] = await Promise.all([
    supabase.from("tracker_entries").select("metric_id,value,date").eq("user_id", userId).gte("date", since),
    loadMetrics(userId),
  ]);
  const labelOf = (id: string) => metrics.find((m) => m.id === id)?.label || metricLabel(id);
  const loggable =
    "Metrics you can log with log_metric (id: label, unit): " +
    metrics.map((m) => `${m.id}: ${m.label} (${m.unit})`).join("; ");
  if (!data || data.length === 0) return ["No tracker entries in the last 30 days.", loggable].join("\n");

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
    .map(([id, total]) => `- ${labelOf(id)}: ${Math.round(total * 10) / 10} total over ${days[id].size} active day(s)`);
  const today = todayKey();
  const todayLines = data
    .filter((e) => e.date === today)
    .map((e) => `${labelOf(e.metric_id)} ${Math.round(Number(e.value) * 10) / 10}`);
  return [
    `Tracker summary for the last 30 days (${allDays.size} active days):`,
    ...lines,
    `Logged today: ${todayLines.length > 0 ? todayLines.join(", ") : "nothing yet"}`,
    loggable,
  ].join("\n");
}

const KIND_NAMES: Record<AppKind, string> = {
  work: "work",
  learning: "learning",
  communication: "communication",
  watching: "watching",
  waste: "waste",
  neutral: "neutral",
};

function kindLine(agg: UsageAggregate): string {
  const parts = APP_KINDS.filter((k) => agg.byKind[k] > 0).map((k) => `${KIND_NAMES[k]} ${formatHm(agg.byKind[k])}`);
  if (agg.unclassifiedSeconds > 0) parts.push(`unassigned ${formatHm(agg.unclassifiedSeconds)}`);
  return parts.length > 0 ? parts.join(", ") : "nothing counted";
}

function focusText(ratio: number | null): string {
  return ratio === null ? "n/a" : `${Math.round(ratio * 100)}%`;
}

/**
 * Screen time from the desktop agent, summarised from the daily rollup view
 * (no window titles, so title rules do not apply here; the Stats page has the
 * exact numbers). Same classifier and aggregation as the Stats section.
 */
async function gatherComputer(userId: string): Promise<string> {
  const today = todayKey();
  const from30 = daysAgoISO(29);
  const from7 = daysAgoISO(6);

  const [classRes, ruleRes, projRes, syncRes] = await Promise.all([
    supabase.from("app_classes").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("app_rules").select("*").eq("user_id", userId),
    supabase.from("user_projects").select("id,name").eq("user_id", userId),
    supabase
      .from("app_usage_sessions")
      .select("ended_at,device_id")
      .eq("user_id", userId)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (classRes.error || syncRes.error) return "Computer time is not set up yet (usage tables missing).";
  if (!syncRes.data) return "No computer sessions yet: the desktop agent has not synced anything.";

  // A failed rules or projects read must not masquerade as "everything is unassigned".
  const caveats: string[] = [];
  if (ruleRes.error) caveats.push("Rules could not be loaded (reguły niedostępne): the split below uses class keywords only, so unassigned time is overstated.");
  if (projRes.error) caveats.push("Projects could not be loaded (projekty niedostępne): no per-project totals.");

  const rows: UsageSession[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 10_000; offset += PAGE) {
    // Full ordering matches the view's grouping key, so pages never overlap or skip.
    const { data, error } = await supabase
      .from("app_usage_daily")
      .select(DAILY_COLUMNS)
      .eq("user_id", userId)
      .gte("local_date", from30)
      .lte("local_date", today)
      .order("local_date", { ascending: true })
      .order("device_id", { ascending: true })
      .order("app_key", { ascending: true })
      .order("idle", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    for (const r of data) {
      const s = dailyRowToSession(r);
      if (s) rows.push(s);
    }
    if (data.length < PAGE) break;
  }
  if (rows.length === 0) return `No computer sessions in the last 30 days. Last sync: ${syncRes.data.ended_at}.`;

  const classes = (classRes.data || []).map(rowToClass);
  const rules = ruleRes.error ? [] : (ruleRes.data || []).map(rowToRule);
  const projects = projRes.error ? [] : (projRes.data || []).map((p) => ({ id: p.id, name: p.name }));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const projectLines = (agg: UsageAggregate) =>
    Object.entries(agg.byProject)
      .sort((a, b) => b[1] - a[1])
      .map(([id, secs]) => `${projectName.get(id) || id} ${formatHm(secs)}`)
      .join(", ");
  const ctx = { classes, rules, projects };
  const classifications = classifyAll(rows, ctx);
  const agg30 = aggregateUsage(rows, classes, classifications);

  const idx7 = rows.map((s, i) => (s.local_date >= from7 ? i : -1)).filter((i) => i >= 0);
  const agg7 = aggregateUsage(idx7.map((i) => rows[i]), classes, idx7.map((i) => classifications[i]));
  const idxToday = rows.map((s, i) => (s.local_date === today ? i : -1)).filter((i) => i >= 0);
  const aggToday = aggregateUsage(idxToday.map((i) => rows[i]), classes, idxToday.map((i) => classifications[i]));

  const classById = new Map(classes.map((c) => [c.id, c]));
  const classLines = (agg: UsageAggregate) =>
    Object.entries(agg.byClass)
      .sort((a, b) => b[1] - a[1])
      .map(([id, secs]) => {
        const c = classById.get(id);
        return `${c ? c.name : id} ${formatHm(secs)}${c ? ` (${KIND_NAMES[c.kind]})` : ""}`;
      })
      .join(", ") || "none";

  const topPerKind = (agg: UsageAggregate) =>
    APP_KINDS.map((k) => {
      const apps = agg.topAppKeys.filter((t) => t.kind === k).slice(0, 5);
      return apps.length > 0 ? `  ${KIND_NAMES[k]}: ${apps.map((t) => `${t.appKey} ${formatHm(t.seconds)}`).join(", ")}` : "";
    })
      .concat(
        agg.topAppKeys.filter((t) => t.kind === null).length > 0
          ? [`  unassigned: ${agg.topAppKeys.filter((t) => t.kind === null).slice(0, 5).map((t) => `${t.appKey} ${formatHm(t.seconds)}`).join(", ")}`]
          : [],
      )
      .filter(Boolean);

  const scoredDays = agg30.byDay.filter((d) => d.focusRatio !== null && d.total >= 1800);
  const byFocus = [...scoredDays].sort((a, b) => (b.focusRatio ?? 0) - (a.focusRatio ?? 0));
  const best = byFocus[0];
  const worst = byFocus[byFocus.length - 1];

  const lines = [
    `Screen time from the desktop agent. Last sync: ${syncRes.data.ended_at} (device ${syncRes.data.device_id.slice(0, 8)}).`,
    ...caveats,
    `Today so far: ${formatHm(aggToday.totalSeconds)}, focus ${focusText(aggToday.focusRatio)} (${kindLine(aggToday)}).`,
    `Last 7 days: ${formatHm(agg7.totalSeconds)} total, focus ratio ${focusText(agg7.focusRatio)} (work+learning over all active non-neutral time).`,
    `  Per kind: ${kindLine(agg7)}`,
    `  Per class: ${classLines(agg7)}`,
    ...(projectLines(agg7) ? [`  Per project: ${projectLines(agg7)}`] : []),
    "  Top apps per kind:",
    ...topPerKind(agg7),
    `Last 30 days: ${formatHm(agg30.totalSeconds)} total, focus ratio ${focusText(agg30.focusRatio)}, unassigned ${formatHm(agg30.unclassifiedSeconds)}.`,
    `  Per kind: ${kindLine(agg30)}`,
    `  Per class: ${classLines(agg30)}`,
    ...(projectLines(agg30) ? [`  Per project: ${projectLines(agg30)}`] : []),
  ];
  if (best && worst && best.date !== worst.date) {
    lines.push(
      `Best day by focus: ${best.date} (${focusText(best.focusRatio)}, ${formatHm(best.total)}). Worst: ${worst.date} (${focusText(worst.focusRatio)}, ${formatHm(worst.total)}).`,
    );
  }
  if (agg30.unclassifiedSeconds > 0) {
    lines.push(`Unassigned time is not in any class yet; the user assigns classes on the Stats page (Komputer > Foldery).`);
  }
  return lines.join("\n");
}

async function gatherPaths(userId: string): Promise<string> {
  // Same reason as usePaths: naming a column the database has not got yet turns
  // "here are your paths" into "you have no paths", which is a confident lie.
  const { data: paths } = await supabase.from("paths").select("*").eq("user_id", userId);
  if (!paths || paths.length === 0) return "No paths set up yet.";

  const { data: steps } = await supabase.from("path_steps").select("*").eq("user_id", userId);
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
  const { data: planningRows } = await supabase
    .from("planning_tasks")
    .select("id,title,level,done,deadline,parent_id,notes")
    .eq("user_id", userId)
    .limit(500);
  if (!planningRows || planningRows.length === 0) return "No planning tasks yet.";
  const data = planningRows;

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
  const { data: cats } = await supabase.from("finance_categories").select("name,kind").eq("user_id", userId);
  const categoryLine = cats && cats.length > 0
    ? "Categories (use with add_transaction): " + cats.map((c) => `${c.name}${c.kind ? ` [${c.kind}]` : ""}`).join(", ")
    : "Categories: none defined yet";
  const { data } = await supabase
    .from("finance_transactions")
    .select("type,title,amount,category,date")
    .eq("user_id", userId)
    .gte("date", since)
    .order("date", { ascending: false })
    .limit(200);
  if (!data || data.length === 0) return ["No finance transactions in the last 90 days.", categoryLine].join("\n");
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
    categoryLine,
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
    .select("pattern,duration_seconds,completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(10);
  if (!data || data.length === 0) return "No breathing sessions yet.";
  const total = data.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
  const patterns = [...new Set(data.map((s) => s.pattern))];
  const recent = data.slice(0, 5).map((s) => `- ${s.pattern}: ${Math.round((s.duration_seconds || 0) / 60)}min on ${s.completed_at?.slice(0, 10)}`);
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
    .select("id,title,cook_time,difficulty,status,rating")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(15);
  const { data: plan } = await supabase
    .from("cooking_plan_entries")
    .select("plan_date,meal_type,custom_label,recipe_id")
    .eq("user_id", userId)
    .gte("plan_date", daysAgoISO(7))
    .order("plan_date", { ascending: false });
  const recipeList = recipes || [];
  const planList = plan || [];

  // Plan rows point at recipes by id; older recipes may fall outside the list above.
  const titleOf = new Map(recipeList.map((r) => [r.id, r.title]));
  const missing = [...new Set(planList.map((p) => p.recipe_id).filter((id): id is string => !!id && !titleOf.has(id)))];
  if (missing.length > 0) {
    const { data: extra } = await supabase.from("cooking_recipes").select("id,title").in("id", missing);
    for (const r of extra || []) titleOf.set(r.id, r.title);
  }

  const parts: string[] = [];
  if (recipeList.length > 0) {
    const lines = recipeList.slice(0, 8).map((r) => {
      const bits = [r.cook_time, r.difficulty, r.status, r.rating != null ? `${r.rating}/5` : ""].filter(Boolean);
      return `- ${r.title}${bits.length ? ` (${bits.join(", ")})` : ""}`;
    });
    parts.push(`Recipes (${recipeList.length} total):`, ...lines);
  }
  if (planList.length > 0) {
    const lines = planList.slice(0, 5).map((p) => {
      const what = (p.recipe_id && titleOf.get(p.recipe_id)) || p.custom_label || "unnamed";
      return `- ${p.plan_date}: ${p.meal_type}. ${what}`;
    });
    parts.push(`Meal plan (last 7 days, ${planList.length} entries):`, ...lines);
  }
  return parts.length > 0 ? parts.join("\n") : "No cooking recipes or meal plans yet.";
}

async function gatherCalendar(userId: string): Promise<string> {
  const today = todayKey();
  const future = addDays(today, 30);
  const { data } = await supabase
    .from("calendar_events")
    .select("date,title,tag,notes")
    .eq("user_id", userId)
    .gte("date", today)
    .lte("date", future)
    .order("date")
    .limit(30);
  if (!data || data.length === 0) return "No upcoming calendar events in the next 30 days.";
  const lines = data.map((e) =>
    `- ${e.date}: ${e.title}${e.tag ? ` [${e.tag}]` : ""}${e.notes ? `. ${e.notes.slice(0, 80)}` : ""}`
  );
  return [`Calendar: ${data.length} upcoming events in next 30 days:`, ...lines].join("\n");
}

async function gatherLibrary(userId: string): Promise<string> {
  const [{ data: books }, { data: courses }] = await Promise.all([
    supabase
      .from("user_books")
      .select("title,author,status,pages_read,total_pages")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("user_courses")
      .select("title,platform,progress_pct,status")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);
  const bookList = books || [];
  const courseList = courses || [];
  if (bookList.length === 0 && courseList.length === 0) return "No books or courses in the library yet.";
  const parts: string[] = [];
  if (bookList.length > 0) {
    const lines = bookList.slice(0, 10).map((b) => {
      const progress = b.total_pages > 0 ? ` ${b.pages_read}/${b.total_pages} pages` : "";
      return `- ${b.title}${b.author ? ` by ${b.author}` : ""} [${b.status}]${progress}`;
    });
    parts.push(`Books (${bookList.length}):`, ...lines);
  }
  if (courseList.length > 0) {
    const lines = courseList.slice(0, 10).map((c) =>
      `- ${c.title}${c.platform ? ` (${c.platform})` : ""} [${c.status}] ${c.progress_pct}%`
    );
    parts.push(`Courses (${courseList.length}):`, ...lines);
  }
  return parts.join("\n");
}

const GATHERERS: Record<ScopeId, (userId: string, question?: string) => Promise<string>> = {
  dashboard: gatherDashboard,
  tracker: gatherTracker,
  computer: gatherComputer,
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

  const now = new Date();
  // Weekday of the logical date, so "2026-09-28 (Monday)" still holds at 01:00 Tuesday.
  const header =
    `Now: ${todayKey()} (${logicalDate(now).toLocaleDateString("en-US", { weekday: "long" })}), local time ` +
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}. ` +
    "The app's day starts at 04:00, so before 04:00 \"today\" is still the previous date.";
  return { text: [header, ...sections].join("\n\n"), citations };
}
