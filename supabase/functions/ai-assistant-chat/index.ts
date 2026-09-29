import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getUserClient } from "../_shared/planner.ts";

/**
 * The in-app assistant. Three modes on one endpoint:
 *
 * - (default) chat: streams a reply from the "smart" model, or from the cheap
 *   model once this user's month-to-date spend crosses ASSISTANT_BUDGET_USD.
 *   Every answered request is logged to ai_usage_log with OpenRouter's own
 *   cost accounting, which is what the budget guard reads next time.
 * - route: a small, fast model picks which context sections (scopes) the
 *   latest message needs, so the user does not have to tick them by hand.
 * - status: model names, budget and this month's spend for the Settings tab.
 *
 * Models are OpenRouter slugs. Override with secrets:
 *   ASSISTANT_MODEL           smart chat model   (default anthropic/claude-haiku-4.5; anthropic/claude-sonnet-5.5 for the best quality)
 *   ASSISTANT_FALLBACK_MODEL  over-budget model  (default OPENROUTER_MODEL or google/gemini-2.5-flash)
 *   ASSISTANT_ROUTER_MODEL    scope router       (default google/gemini-2.5-flash)
 *   ASSISTANT_BUDGET_USD      monthly cap per user, USD (default 10)
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SMART_MODEL = Deno.env.get("ASSISTANT_MODEL") || "anthropic/claude-haiku-4.5";
const CHEAP_MODEL = Deno.env.get("ASSISTANT_FALLBACK_MODEL") || Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
const ROUTER_MODEL = Deno.env.get("ASSISTANT_ROUTER_MODEL") || "google/gemini-2.5-flash";
const BUDGET_USD = (() => {
  const n = Number(Deno.env.get("ASSISTANT_BUDGET_USD") || "10");
  return Number.isFinite(n) && n > 0 ? n : 10;
})();

const EXPOSED = { ...corsHeaders, "Access-Control-Expose-Headers": "X-Assistant-Model, X-Assistant-Budget" };

type Msg = { role: "system" | "user" | "assistant"; content: string };

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Month-to-date spend for the user; 0 when the usage table is not there yet. */
async function monthSpend(userId: string): Promise<{ cost: number; requests: number; ready: boolean }> {
  const admin = adminClient();
  if (!admin) return { cost: 0, requests: 0, ready: false };
  const { data, error } = await admin.rpc("ai_usage_month", { p_user: userId });
  if (error) return { cost: 0, requests: 0, ready: false };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    cost: Number(row?.cost_usd ?? 0) || 0,
    requests: Number(row?.requests ?? 0) || 0,
    ready: true,
  };
}

async function logUsage(userId: string, feature: string, model: string, usage: Usage | null) {
  const admin = adminClient();
  if (!admin) return;
  try {
    await admin.from("ai_usage_log").insert({
      user_id: userId,
      feature,
      model,
      prompt_tokens: Math.max(0, Math.round(Number(usage?.prompt_tokens ?? 0) || 0)),
      completion_tokens: Math.max(0, Math.round(Number(usage?.completion_tokens ?? 0) || 0)),
      cost_usd: Math.max(0, Number(usage?.cost ?? 0) || 0),
    });
  } catch (e) {
    console.error("ai_usage_log insert failed:", e);
  }
}

async function openrouter(body: Record<string, unknown>): Promise<Response> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://mindsetforest.app",
      "X-Title": "MindsetForest",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, usage: { include: true } }),
  });
}

function gatewayError(response: Response, text: string): Response {
  if (response.status === 429) return jsonResponse({ error: "Rate limit exceeded, please try again later." }, 429);
  if (response.status === 402) return jsonResponse({ error: "Payment required. Please add AI credits." }, 402);
  console.error("AI gateway error:", response.status, text);
  return jsonResponse({ error: "AI gateway error" }, 502);
}

function cleanHistory(history: unknown, limit: number): Msg[] {
  if (!Array.isArray(history)) return [];
  const out: Msg[] = [];
  for (const h of history.slice(-limit)) {
    if (h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string" && h.content.trim()) {
      out.push({ role: h.role, content: h.content.slice(0, 6000) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// route: which sections does this message need?
// ---------------------------------------------------------------------------
interface ScopeSpec { id: string; label: string; description: string }

async function routeScopes(userId: string, body: Record<string, unknown>): Promise<Response> {
  const message = String(body.message ?? "").slice(0, 4000);
  const specs: ScopeSpec[] = Array.isArray(body.scopes)
    ? body.scopes
        .filter((s: unknown) => s && typeof s === "object" && typeof (s as ScopeSpec).id === "string")
        .map((s: ScopeSpec) => ({ id: s.id.slice(0, 40), label: String(s.label || s.id).slice(0, 60), description: String(s.description || "").slice(0, 300) }))
        .slice(0, 30)
    : [];
  const ids = new Set(specs.map((s) => s.id));
  const current = typeof body.current === "string" && ids.has(body.current) ? body.current : null;
  const pinned = Array.isArray(body.pinned) ? body.pinned.filter((p: unknown) => typeof p === "string" && ids.has(p)) : [];
  const fallback = [current || "dashboard"].filter((s) => ids.has(s));
  if (specs.length === 0 || !message.trim()) return jsonResponse({ scopes: fallback, reason: "no input" });

  const history = cleanHistory(body.history, 6);
  const sections = specs.map((s) => `- ${s.id}: ${s.label}. ${s.description}`).join("\n");
  const system = [
    "You choose which sections of a user's personal data an assistant must read to answer their latest message well.",
    "The assistant can only see the sections you pick, so missing one makes it answer 'I don't have that data'. Picking a section costs little; be generous when in doubt, but do not pick sections that are clearly unrelated.",
    "Available sections:",
    sections,
    "",
    "Rules:",
    "- Return JSON only: {\"scopes\": [ids], \"reason\": \"one short line\"}.",
    "- Pick every section the message plausibly needs, usually 1-3, at most 5.",
    "- A short follow-up (\"and yesterday?\", \"why?\", \"ok do it\") continues the previous topic: keep the sections that topic needed.",
    current ? `- The user is currently looking at the "${current}" section; include it when the message is about what they see.` : "",
    pinned.length ? `- The user pinned these sections themselves; always keep them: ${pinned.join(", ")}.` : "",
    "- Requests to navigate the app, tick a mission, load a preset, add a mission or save a note need 'dashboard' (missions, presets) or the section they belong to.",
    "- If nothing fits, return [\"dashboard\"].",
  ].filter(Boolean).join("\n");

  const messages: Msg[] = [{ role: "system", content: system }];
  if (history.length) {
    messages.push({
      role: "user",
      content: "Recent conversation (oldest first):\n" + history.map((h) => `${h.role}: ${h.content.slice(0, 500)}`).join("\n"),
    });
    messages.push({ role: "assistant", content: "Noted. Send the latest message." });
  }
  messages.push({ role: "user", content: `Latest message: ${message}` });

  const response = await openrouter({
    model: ROUTER_MODEL,
    messages,
    stream: false,
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  if (!response.ok) {
    const text = await response.text();
    console.error("router gateway error:", response.status, text);
    return jsonResponse({ scopes: fallback, reason: "router unavailable" });
  }
  const data = await response.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "");
  let picked: string[] = [];
  let reason = "";
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    if (Array.isArray(parsed?.scopes)) picked = parsed.scopes.filter((s: unknown) => typeof s === "string" && ids.has(s));
    if (typeof parsed?.reason === "string") reason = parsed.reason.slice(0, 200);
  } catch {
    picked = [];
  }
  const scopes = Array.from(new Set([...pinned, ...picked])).slice(0, 6);
  await logUsage(userId, "assistant-route", ROUTER_MODEL, data?.usage ?? null);
  return jsonResponse({ scopes: scopes.length ? scopes : fallback, reason, model: ROUTER_MODEL });
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------
async function chat(userId: string, body: Record<string, unknown>): Promise<Response> {
  const { message, history, context, scopes } = body;
  const voice = body.voice === true;

  const spend = await monthSpend(userId);
  const overBudget = spend.ready && spend.cost >= BUDGET_USD;
  const model = overBudget ? CHEAP_MODEL : SMART_MODEL;

  const scopeList = Array.isArray(scopes) && scopes.length > 0 ? scopes.join(", ") : "none";
  const ctx = String(context || "").slice(0, 120_000);

  const voiceBlock = voice
    ? [
        "",
        "VOICE MODE: the user is talking hands-free and your reply will be read aloud by a speech synthesizer.",
        "Answer in one to three short spoken sentences. No lists, no headings, no URLs, no symbols, no emoji.",
        "Say the important number or name first. If you need a decision from the user, ask one short question.",
        "When you propose actions, keep the action block exactly as specified; it is executed, not spoken.",
      ].join("\n")
    : "";

  const systemPrompt = `You are the in-app AI assistant for MindsetForest, a gamified life & productivity tracker ("Your Life. Your Quest."). You help the user reflect on and understand their own data, and you can operate the app for them through the actions listed below.

Answer the user's question using ONLY the user data provided below. If the data does not contain the answer, say so plainly and name which section would have it (sections are picked automatically per message; the user can also pin them in the Context menu). Never invent numbers or facts that are not in the data. Be concise, warm, and specific: quote concrete numbers from the data when relevant.

The data sections and the available actions are chosen fresh for EVERY message, so earlier turns in this conversation were answered from sections and actions you may not see right now. That is normal. Never retract, doubt or "correct" something you said earlier only because its data or its action is not in front of you now; the earlier answer stands. Actions marked in the history as "[Applied by the user, these happened: ...]" really happened (the note was saved, the mission ticked, the preset loaded), so refer to them as done. If the user asks about something outside the current sections, say which section holds it rather than claiming it does not exist or was not saved.

Reply in the language the user writes or speaks in (Polish or English). Keep mission, preset and section names exactly as they appear in the data.

The sections available for this question: ${scopeList}.

=== USER DATA (only the sections available) ===
${ctx || "No data was shared for this question."}
=== END USER DATA ===
${voiceBlock}

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and plain hyphens (-) for structure. Never use em dashes (—) or en dashes as punctuation. Use a comma, a full stop, or an arrow (→) instead. Keep it clean and readable as raw text. (The one exception is the \`\`\`action block described above, when applicable.)`;

  const messages: Msg[] = [{ role: "system", content: systemPrompt }, ...cleanHistory(history, 12)];
  messages.push({ role: "user", content: String(message ?? "").slice(0, 8000) });

  const response = await openrouter({
    model,
    messages,
    stream: true,
    // No voice cap: the prompt keeps spoken prose short, and a cap cuts
    // action blocks mid-JSON (a preset with a dozen missions is long).
    max_tokens: 4000,
  });
  if (!response.ok || !response.body) return gatewayError(response, await response.text());

  // Pass the SSE stream through untouched, but read the usage object OpenRouter
  // appends to the final chunk so the request can be logged when the stream ends.
  let usage: Usage | null = null;
  let tail = "";
  let logged = false;
  const decoder = new TextDecoder();
  const scan = (line: string) => {
    const t = line.trim();
    if (!t.startsWith("data:") || !t.includes('"usage"')) return;
    try {
      const json = JSON.parse(t.slice(5).trim());
      if (json && json.usage) usage = json.usage as Usage;
    } catch { /* partial or non-JSON line */ }
  };
  // Awaited (not fire-and-forget) so the isolate is not torn down before the
  // row lands; the budget guard depends on it. Runs once, on end or on cancel.
  const logOnce = () => {
    if (logged) return Promise.resolve();
    logged = true;
    if (tail) { scan(tail); tail = ""; }
    return logUsage(userId, "assistant-chat", model, usage);
  };
  const tap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      tail += decoder.decode(chunk, { stream: true });
      const lines = tail.split("\n");
      tail = lines.pop() || "";
      for (const line of lines) scan(line);
    },
    flush() {
      return logOnce();
    },
    // The client pressed Stop: OpenRouter still bills what was generated, so
    // log whatever usage arrived (usually none, then the row records the model only).
    cancel() {
      return logOnce();
    },
  });

  return new Response(response.body.pipeThrough(tap), {
    headers: {
      ...EXPOSED,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Assistant-Model": model,
      "X-Assistant-Budget": overBudget ? "exceeded" : "ok",
    },
  });
}

// ---------------------------------------------------------------------------
// status (Settings -> AI)
// ---------------------------------------------------------------------------
async function status(userId: string): Promise<Response> {
  const spend = await monthSpend(userId);
  return jsonResponse({
    smartModel: SMART_MODEL,
    cheapModel: CHEAP_MODEL,
    routerModel: ROUTER_MODEL,
    budgetUsd: BUDGET_USD,
    monthCostUsd: spend.cost,
    monthRequests: spend.requests,
    overBudget: spend.ready && spend.cost >= BUDGET_USD,
    usageTableReady: spend.ready,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: EXPOSED });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.mode === "route") return await routeScopes(auth.userId, body);
    if (body.mode === "status") return await status(auth.userId);
    return await chat(auth.userId, body);
  } catch (e) {
    console.error("ai-assistant-chat error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
