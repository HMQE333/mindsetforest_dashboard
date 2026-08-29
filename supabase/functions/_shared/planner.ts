/**
 * Shared planner plumbing for the AI functions that suggest work
 * (`ai-mission-suggest`, `ai-path-suggest`).
 *
 * Before this existed, each function wrote its own prompt from whatever the
 * client happened to pass in - a category name and a list of titles. It did not
 * know what the user had done, what they keep skipping, how much time they have
 * today, or who they are. That is the whole reason its suggestions felt generic.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resolves the caller. Returns null (and the caller should 401) if unauthenticated. */
export async function getUserClient(req: Request): Promise<{ client: SupabaseClient; userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { client, userId: data.claims.sub as string };
}

/** What the client tells us about *now* - the server has no idea of local time. */
export interface LocalMoment {
  /** Local calendar date, YYYY-MM-DD. */
  date?: string;
  /** Local hour, 0-23. */
  hour?: number;
  /** Minutes the user believes they have left today, if the client knows. */
  freeMinutes?: number;
}

const DAY_MS = 86400000;

function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * DAY_MS);
  return d.toISOString().split("T")[0];
}

function partOfDay(hour: number | undefined): string {
  if (hour === undefined) return "unknown";
  if (hour < 5) return "late night";
  if (hour < 11) return "morning";
  if (hour < 15) return "midday";
  if (hour < 19) return "afternoon";
  return "evening";
}

async function safe<T>(p: PromiseLike<{ data: T | null }>): Promise<T | null> {
  try {
    const { data } = await p;
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Builds the situational block that goes into every planning prompt.
 * Every section degrades to nothing if its table is empty or missing, so a
 * half-set-up account still gets a working (if thinner) prompt.
 */
export async function buildPlannerContext(
  client: SupabaseClient,
  userId: string,
  moment: LocalMoment = {},
): Promise<{ profile: string; situation: string }> {
  const today = moment.date || new Date().toISOString().split("T")[0];

  const [ctx, dash, history, paths, steps, planning, events, watch, suggestions] = await Promise.all([
    safe(client.from("user_context").select("notes").eq("user_id", userId).maybeSingle()),
    safe(client.from("dashboard_state")
      .select("current_xp,current_level,streak_days,missions_completed,categories_engaged,custom_missions,last_completion_date")
      .eq("user_id", userId).maybeSingle()),
    safe(client.from("daily_completions")
      .select("date,missions_completed,xp_earned,categories_engaged,completed_mission_titles")
      .eq("user_id", userId).gte("date", daysAgo(14)).order("date", { ascending: false })),
    safe(client.from("paths").select("id,name,category_id,archived").eq("user_id", userId)),
    safe(client.from("path_steps").select("path_id,title,mode,reps_target,reps_done,done,sort_order").eq("user_id", userId)),
    safe(client.from("planning_tasks").select("title,level,done,deadline").eq("user_id", userId).eq("done", false).limit(50)),
    safe(client.from("calendar_events").select("title,event_date").eq("user_id", userId).eq("event_date", today)),
    safe(client.from("watch_entries").select("entry_date,body_battery,sleep_score,resting_hr,stress_level,recovery_time_hrs")
      .eq("user_id", userId).order("entry_date", { ascending: false }).limit(3)),
    safe(client.from("ai_suggestion_log").select("title,status,scope")
      .eq("user_id", userId).neq("status", "offered").order("created_at", { ascending: false }).limit(40)),
  ]);

  // ---- profile (stable; belongs in the system prompt) ----
  const notes = ((ctx as { notes?: string } | null)?.notes || "").trim();
  const profile = notes
    ? `WHO YOU ARE PLANNING FOR (written by the user):\n${notes}`
    : "The user has not written a personal context yet. Keep suggestions general and low-risk, and prefer short tasks.";

  // ---- situation (volatile; belongs in the user message) ----
  const lines: string[] = [];
  lines.push(`Local date: ${today} (${partOfDay(moment.hour)}${moment.hour !== undefined ? `, ${moment.hour}:00` : ""}).`);
  if (moment.freeMinutes !== undefined) {
    lines.push(`Time the user expects to have left today: about ${moment.freeMinutes} minutes.`);
  }

  const d = dash as Record<string, unknown> | null;
  if (d) {
    lines.push(
      `Today so far: ${d.missions_completed ?? 0} task(s) done, level ${d.current_level ?? 1}, ${d.current_xp ?? 0} XP, ${d.streak_days ?? 0}-day streak.`,
    );
    const engaged = (d.categories_engaged as string[] | null) || [];
    if (engaged.length > 0) lines.push(`Categories already touched today: ${engaged.join(", ")}.`);
  }

  const days = (history as Record<string, unknown>[] | null) || [];
  if (days.length > 0) {
    const activeDays = days.filter((x) => Number(x.missions_completed || 0) > 0).length;
    const avgXp = Math.round(days.reduce((s, x) => s + Number(x.xp_earned || 0), 0) / Math.max(1, days.length));
    lines.push(`Last 14 days: active on ${activeDays} of ${days.length} recorded days, ~${avgXp} XP per day.`);

    const doneTitles = new Set<string>();
    for (const day of days) {
      for (const t of ((day.completed_mission_titles as string[] | null) || [])) doneTitles.add(t);
    }

    // The most useful signal in here: tasks the user keeps on the board but
    // never actually does. Suggesting more of those is how a planner loses trust.
    const custom = (d?.custom_missions as Record<string, { title?: string }[]> | null) || {};
    const neverDone: string[] = [];
    for (const missions of Object.values(custom)) {
      for (const m of missions || []) {
        if (m?.title && !doneTitles.has(m.title)) neverDone.push(m.title);
      }
    }
    if (neverDone.length > 0) {
      lines.push(`Tasks on the board but NOT completed once in 14 days (do not suggest more of these): ${neverDone.slice(0, 12).join("; ")}.`);
    }

    const recent = [...doneTitles].slice(0, 12);
    if (recent.length > 0) lines.push(`Recently completed: ${recent.join("; ")}.`);
  }

  const livePaths = ((paths as Record<string, unknown>[] | null) || []).filter((p) => !p.archived);
  if (livePaths.length > 0) {
    const allSteps = (steps as Record<string, unknown>[] | null) || [];
    const pathLines = livePaths.map((p) => {
      const mine = allSteps
        .filter((s) => s.path_id === p.id)
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
      const active = mine.find((s) => !s.done);
      const done = mine.filter((s) => s.done).length;
      const activeLabel = active
        ? `${active.title}${active.mode === "reps" ? ` (${active.reps_done}/${active.reps_target} days)` : ""}`
        : "finished";
      return `  - ${p.name}: ${done}/${mine.length} steps, current step "${activeLabel}"`;
    });
    lines.push(`Active paths:\n${pathLines.join("\n")}`);
  }

  const openTasks = (planning as Record<string, unknown>[] | null) || [];
  if (openTasks.length > 0) {
    const withDeadline = openTasks.filter((t) => t.deadline).slice(0, 5);
    lines.push(`Planning: ${openTasks.length} open node(s).${withDeadline.length ? ` Nearest deadlines: ${withDeadline.map((t) => `${t.title} (${t.deadline})`).join("; ")}.` : ""}`);
  }

  const todayEvents = (events as Record<string, unknown>[] | null) || [];
  if (todayEvents.length > 0) {
    lines.push(`Calendar today: ${todayEvents.map((e) => e.title).join("; ")}. Assume less free time than usual.`);
  }

  const watchRows = (watch as Record<string, unknown>[] | null) || [];
  if (watchRows.length > 0) {
    const w = watchRows[0];
    const bits: string[] = [];
    if (w.sleep_score) bits.push(`sleep score ${w.sleep_score}`);
    if (w.body_battery) bits.push(`body battery ${w.body_battery}`);
    if (w.stress_level) bits.push(`stress ${w.stress_level}`);
    if (w.recovery_time_hrs) bits.push(`${w.recovery_time_hrs}h recovery time left`);
    if (w.resting_hr) bits.push(`resting HR ${w.resting_hr}`);
    if (bits.length > 0) lines.push(`Latest watch data (${w.entry_date}): ${bits.join(", ")}.`);
  }

  const decided = (suggestions as Record<string, unknown>[] | null) || [];
  if (decided.length > 0) {
    const accepted = decided.filter((s) => s.status === "accepted").map((s) => s.title).slice(0, 8);
    const rejected = decided.filter((s) => s.status === "rejected").map((s) => s.title).slice(0, 8);
    if (accepted.length > 0) lines.push(`Past suggestions the user accepted: ${accepted.join("; ")}.`);
    if (rejected.length > 0) lines.push(`Past suggestions the user REJECTED (avoid this shape): ${rejected.join("; ")}.`);
  }

  return { profile, situation: lines.join("\n") };
}

/** House rules shared by every planning prompt. */
export const PLANNER_RULES = [
  "Suggest work that fits the situation you are given. If energy is low or the day is nearly over, suggest smaller things; do not propose a two-hour deep work block at 22:00.",
  "Never repeat, reword, or re-skin a task the user already has, and never revive one they keep skipping.",
  "XP scales with effort: 10-15 for 5-10 minutes, 15-25 for 15-30 minutes, 25-40 for an hour or more. Above 60 only for genuinely demanding multi-hour work.",
  "Every suggestion must be doable without buying anything or waiting on another person, unless the user's context says otherwise.",
  "Write plain text. No markdown symbols, no bold, no headings.",
  "Give each suggestion a one-line reason tied to something concrete in the situation you were given.",
].join("\n");

interface ChatOptions {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  parameters: Record<string, unknown>;
}

/** One OpenRouter call with a forced tool call. Returns the parsed arguments. */
export async function callPlanner({ systemPrompt, userPrompt, toolName, toolDescription, parameters }: ChatOptions): Promise<Record<string, unknown>> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  const model = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://mindsetforest.app",
      "X-Title": "MindsetForest",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters } }],
      tool_choice: { type: "function", function: { name: toolName } },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit exceeded, please try again later.");
    if (response.status === 402) throw new Error("Payment required. Please add AI credits.");
    console.error("AI gateway error:", response.status, await response.text());
    throw new Error("AI gateway error");
  }

  const data = await response.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return {};
  try {
    return JSON.parse(args);
  } catch {
    console.error("Failed to parse tool call arguments");
    return {};
  }
}
