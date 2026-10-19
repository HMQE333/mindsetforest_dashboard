import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";
import {
  MIN_SIMILARITY,
  NEIGHBOURS_K,
  SUGGEST_TOOL,
  buildVocabulary,
  combineSuggestions,
  detectType,
  latestFeedback,
  looksLikeCredential,
  normaliseTag,
  noteForPrompt,
  parseAiPicks,
  scoreNeighbours,
  systemPrompt,
  type AiPick,
  type Evidence,
  type Feedback,
  type Neighbour,
  type Suggestion,
} from "../_shared/archive-tags.ts";

/**
 * Tag suggestions for Archive notes. Two modes.
 *
 * items (the original; the Inbox's AI Tag button): { items: string[], existingTags?: string[] }
 *   -> { tags: string[][] }, one list per item, from the model alone.
 *
 * learn: { mode: "learn", blockIds: string[] } (at most 20 of the caller's notes)
 *   -> { suggestions: { [blockId]: Suggestion[] }, notes: { [blockId]: NoteInfo }, ai, aiError?, costUsd, model }
 *   Chips that learn from his own data, per note:
 *   1. neighbours: up to 12 of his most similar tagged notes (similar_archive_blocks, which only the
 *      service role may run) score each of their tags by summed similarity;
 *   2. feedback: on those notes, a tag he turned down loses and one he accepted gains
 *      (archive_tag_feedback); a tag he turned down for this very note is never offered again;
 *   3. type: detectType when the text leaves no doubt, else the model's pick, else fragment;
 *   4. the model (one call for every note): text (capped, redacted), his vocabulary with counts
 *      (top 150), the eight types, the neighbours' candidates; 1 type + 2-4 tags back;
 *   5. combine: at most five chips, the type first, each with a short Polish reason.
 *   Over the monthly cap (TAGS_BUDGET_USD, default 1, ai_usage_log feature "archive-tags"), without
 *   a key, or when the model fails, the neighbours' and the rule's chips still come back. A note
 *   with no embedding yet is embedded first through ai-embed-block. A note that looks like it holds
 *   a password or a token is never sent to a model (neither the chat model nor, from here, the
 *   embedding). Neighbours give only their tags; their text is never read.
 *
 * Everything else is read with the caller's token, so RLS keeps it to his own rows.
 */

const MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
const FEATURE = "archive-tags";
const MAX_BLOCKS = 20;
const PAGE = 1000;
const MAX_PAGES = 10;
const EMBED_TIMEOUT_MS = 12_000;
/** The text checked for secrets: what the model and the embedding could ever see of a note. */
const SECRET_SCAN_CHARS = 10_000;
// Per user and month, this feature only. A call for 20 notes costs about a tenth of a cent, so the
// cap only stops a loop; past it the free part (neighbours, rule) still answers.
const BUDGET_USD = (() => {
  const n = Number(Deno.env.get("TAGS_BUDGET_USD") || "1");
  return Number.isFinite(n) && n > 0 ? n : 1;
})();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AiStatus = "used" | "capped" | "off" | "failed" | "not-asked";
interface Usage { prompt_tokens?: number; completion_tokens?: number; cost?: number }
interface Block { id: string; title: string; content: string; tags: string[] | null }
interface NoteInfo { neighbours: number; ai: boolean; embedded?: boolean; skipped?: "credential" }

class ModelError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function admin(): SupabaseClient | null {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return key ? createClient(Deno.env.get("SUPABASE_URL")!, key) : null;
}

/** This month's spend of this feature for the user (service role); 0 when it cannot be read. */
async function monthSpend(userId: string): Promise<number> {
  const db = admin();
  if (!db) return 0;
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await db
    .from("ai_usage_log")
    .select("cost_usd")
    .eq("user_id", userId)
    .eq("feature", FEATURE)
    .gte("created_at", start.toISOString())
    .limit(5000);
  if (error || !data) return 0;
  return data.reduce((n: number, r: { cost_usd: unknown }) => n + (Number(r.cost_usd) || 0), 0);
}

async function logUsage(userId: string, usage: Usage | null) {
  try {
    await admin()?.from("ai_usage_log").insert({
      user_id: userId,
      feature: FEATURE,
      model: MODEL,
      prompt_tokens: Math.max(0, Math.round(Number(usage?.prompt_tokens ?? 0) || 0)),
      completion_tokens: Math.max(0, Math.round(Number(usage?.completion_tokens ?? 0) || 0)),
      cost_usd: Math.max(0, Number(usage?.cost ?? 0) || 0),
    });
  } catch (e) {
    console.error("ai_usage_log insert failed:", e);
  }
}

async function post(payload: Record<string, unknown>): Promise<{ status: number; data: any; text: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
      "HTTP-Referer": "https://mindsetforest.app",
      "X-Title": "MindsetForest",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  // OpenRouter can also answer 200 with an error body.
  const status = !res.ok ? res.status : data?.error ? Number(data.error.code) || 502 : 200;
  return { status, data, text };
}

/** One model call with a forced tool call, from endpoints that keep no prompts when there is one. */
async function askTool(payload: Record<string, unknown>): Promise<{ args: unknown; usage: Usage | null }> {
  let r = await post({ ...payload, provider: { data_collection: "deny" } });
  if (r.status !== 200 && /no endpoints/i.test(r.text)) {
    console.warn("ai-suggest-tags: no endpoint without data collection, asking without the restriction");
    r = await post(payload);
  }
  if (r.status !== 200) {
    console.error("ai-suggest-tags model error:", r.status, r.text.slice(0, 300));
    throw new ModelError(r.status === 429 ? "Rate limit exceeded" : r.status === 402 ? "Payment required" : "AI gateway error", r.status);
  }
  const message = r.data?.choices?.[0]?.message;
  return { args: message?.tool_calls?.[0]?.function?.arguments ?? message?.content, usage: r.data?.usage ?? null };
}

const BUDGET_MESSAGE = "Miesięczny limit AI dla tagów jest wyczerpany";

// ---------------------------------------------------------------- items mode

async function itemsMode(userId: string, body: any): Promise<Response> {
  // Bounded: all of this goes to a paid model.
  const items: string[] | null = Array.isArray(body.items) ? body.items.slice(0, 100).map((t: unknown) => String(t ?? "").slice(0, 4_000)) : null;
  const existingTags: string[] = Array.isArray(body.existingTags) ? body.existingTags.map((t: unknown) => String(t).slice(0, 60)) : [];
  if (!Array.isArray(items) || items.length === 0) throw new Error("No items provided");
  if (!Deno.env.get("OPENROUTER_API_KEY")) throw new Error("OPENROUTER_API_KEY not configured");
  if ((await monthSpend(userId)) >= BUDGET_USD) return jsonResponse({ error: BUDGET_MESSAGE }, 429);

  const vocab = existingTags.length > 0
    ? `\n\nThe user's existing tag vocabulary (STRONGLY prefer reusing these when they fit, to keep the knowledge base consistent):\n${existingTags.slice(0, 200).join(", ")}`
    : "";

  const system = `You suggest tags for notes in a personal knowledge base.

Rules:
1. For EACH numbered item, suggest 2-4 short tags capturing its topic, domain, and type
2. Tags are lowercase, single words or hyphenated (e.g. trading, self-improvement, threejs); Polish letters are fine
3. Prefer broad reusable ontological categories over one-off hyper-specific tags
4. Never invent near-duplicates of existing vocabulary (if "crypto" exists, don't add "cryptocurrency")
5. Skip tags already present as #hashtags inside the item
6. Return exactly one tag array per input item, in the same order${vocab}

You MUST respond using the suggest_tags tool.`;

  let result: { args: unknown; usage: Usage | null };
  try {
    result = await askTool({
      model: MODEL,
      usage: { include: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: items.map((it: string, i: number) => `[${i + 1}]\n${it}`).join("\n\n") },
      ],
      tools: [{
        type: "function",
        function: {
          name: "suggest_tags",
          description: "Return suggested tags for each item, in input order",
          parameters: {
            type: "object",
            properties: {
              tags: {
                type: "array",
                description: "One array of tags per input item, same order as input",
                items: { type: "array", items: { type: "string" } },
              },
            },
            required: ["tags"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "suggest_tags" } },
    });
  } catch (e) {
    if (e instanceof ModelError && (e.status === 429 || e.status === 402)) return jsonResponse({ error: e.message }, e.status);
    throw e;
  }
  await logUsage(userId, result.usage);

  let tags: string[][] = items.map(() => []);
  try {
    const parsed = (typeof result.args === "string" ? JSON.parse(result.args) : result.args as { tags?: unknown })?.tags;
    if (Array.isArray(parsed)) {
      tags = items.map((_: string, i: number) => {
        const list = Array.isArray(parsed[i]) ? parsed[i] : [];
        const out: string[] = [];
        for (const t of list) {
          const n = typeof t === "string" ? normaliseTag(t) : "";
          if (n && !out.includes(n)) out.push(n);
        }
        return out;
      });
    }
  } catch { /* fall back to empty tags */ }
  return jsonResponse({ tags });
}

// ---------------------------------------------------------------- learn mode

/** Embeds the notes through ai-embed-block (the app's own path), three at a time. Resolves the ids that made it. */
async function embedFirst(req: Request, ids: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  if (!ids.length) return done;
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-embed-block`;
  const headers = {
    Authorization: req.headers.get("Authorization") ?? "",
    apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    "Content-Type": "application/json",
  };
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const res = await fetch(url, {
          method: "POST", headers, body: JSON.stringify({ action: "embed", blockId: id }),
          signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
        });
        const text = await res.text();
        if (res.ok) done.add(id);
        else console.warn("ai-suggest-tags: embedding failed", res.status, text.slice(0, 200));
      } catch (e) {
        console.warn("ai-suggest-tags: embedding failed", e instanceof Error ? e.message : e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
  return done;
}

/** His answers on these notes. A missing table (migration not applied) reads as none. */
async function readFeedback(client: SupabaseClient, userId: string, blockIds: string[]): Promise<Feedback[]> {
  const out: Feedback[] = [];
  for (let i = 0; i < blockIds.length; i += 100) {
    const { data, error } = await client
      .from("archive_tag_feedback")
      .select("block_id,tag,accepted,created_at")
      .eq("user_id", userId)
      .in("block_id", blockIds.slice(i, i + 100))
      .limit(5000);
    if (error) {
      console.error("archive_tag_feedback read failed:", error.message);
      return out;
    }
    out.push(...((data ?? []) as Feedback[]));
  }
  return out;
}

/** Every tag on his notes with its count, plus his saved (empty) folders. */
async function readVocabulary(client: SupabaseClient, userId: string): Promise<Map<string, number>> {
  const lists: string[][] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await client
      .from("archive_blocks")
      .select("tags")
      .eq("user_id", userId)
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      console.error("archive_blocks tags read failed:", error.message);
      break;
    }
    lists.push(...((data ?? []) as { tags: string[] | null }[]).map((r) => r.tags ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  const { data: saved } = await client.from("user_saved_tags").select("tag").eq("user_id", userId).in("module", ["archive", "all"]);
  return buildVocabulary(lists, ((saved ?? []) as { tag: string }[]).map((r) => r.tag));
}

async function learnMode(req: Request, client: SupabaseClient, userId: string, body: any): Promise<Response> {
  const ids = [...new Set<string>(
    (Array.isArray(body?.blockIds) ? body.blockIds : []).filter((x: unknown): x is string => typeof x === "string" && UUID.test(x)),
  )].slice(0, MAX_BLOCKS);
  const suggestions: Record<string, Suggestion[]> = {};
  const notes: Record<string, NoteInfo> = {};
  if (ids.length === 0) return jsonResponse({ suggestions, notes, ai: "not-asked", costUsd: 0, model: MODEL });

  const [blocksRes, embeddedRes] = await Promise.all([
    client.from("archive_blocks").select("id,title,content,tags").eq("user_id", userId).in("id", ids),
    client.from("archive_blocks").select("id").eq("user_id", userId).in("id", ids).not("embedding", "is", null),
  ]);
  if (blocksRes.error) throw new Error(blocksRes.error.message);
  const byId = new Map(((blocksRes.data ?? []) as Block[]).map((b) => [b.id, b]));
  const blocks = ids.map((id) => byId.get(id)).filter((b): b is Block => !!b);
  const embedded = new Set(((embeddedRes.data ?? []) as { id: string }[]).map((r) => r.id));
  const secret = new Set(
    blocks.filter((b) => looksLikeCredential(`${b.title ?? ""}\n\n${b.content ?? ""}`.slice(0, SECRET_SCAN_CHARS))).map((b) => b.id),
  );

  // Just saved: embed it now, or it has no neighbours (and is asked of the model on its text alone).
  const justEmbedded = await embedFirst(
    req,
    blocks.filter((b) => !embedded.has(b.id) && !secret.has(b.id) && `${b.title ?? ""}${b.content ?? ""}`.trim()).map((b) => b.id),
  );
  for (const id of justEmbedded) embedded.add(id);

  const db = admin();
  const neighbours = new Map<string, Neighbour[]>();
  if (db) {
    await Promise.all(blocks.filter((b) => embedded.has(b.id)).map(async (b) => {
      const { data, error } = await db.rpc("similar_archive_blocks", { p_user: userId, p_block: b.id, p_k: NEIGHBOURS_K });
      if (error) {
        console.error("similar_archive_blocks failed:", error.message);
        return;
      }
      neighbours.set(b.id, ((data ?? []) as Neighbour[]).filter((n) => n.id !== b.id));
    }));
  }

  const feedbackIds = [...new Set([...ids, ...[...neighbours.values()].flat().map((n) => n.id)])];
  const [feedbackRows, vocabulary] = await Promise.all([readFeedback(client, userId, feedbackIds), readVocabulary(client, userId)]);
  const feedback = latestFeedback(feedbackRows);
  const evidence = new Map<string, Evidence>(blocks.map((b) => [b.id, scoreNeighbours(neighbours.get(b.id) ?? [], feedback)]));

  const askable = blocks.filter((b) => !secret.has(b.id));
  const picks = new Map<string, AiPick>();
  let ai: AiStatus = "not-asked";
  let aiError: string | undefined;
  let costUsd = 0;
  if (askable.length) {
    if (!Deno.env.get("OPENROUTER_API_KEY")) ai = "off";
    else if ((await monthSpend(userId)) >= BUDGET_USD) {
      ai = "capped";
      aiError = BUDGET_MESSAGE;
    } else {
      try {
        const { args, usage } = await askTool({
          model: MODEL,
          temperature: 0.2,
          max_tokens: 2500,
          reasoning: { enabled: false },
          usage: { include: true },
          messages: [
            { role: "system", content: systemPrompt(vocabulary) },
            { role: "user", content: askable.map((b, k) => noteForPrompt(k + 1, { title: b.title ?? "", content: b.content ?? "", tags: b.tags ?? [] }, evidence.get(b.id)!)).join("\n\n") },
          ],
          tools: [SUGGEST_TOOL],
          tool_choice: { type: "function", function: { name: "suggest" } },
        });
        await logUsage(userId, usage);
        costUsd = Number(usage?.cost ?? 0) || 0;
        parseAiPicks(args, askable.length).forEach((p, k) => { if (p) picks.set(askable[k].id, p); });
        ai = "used";
      } catch (e) {
        ai = "failed";
        aiError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  for (const b of blocks) {
    const rejectedHere = new Set([...(feedback.get(b.id) ?? [])].filter(([, accepted]) => !accepted).map(([tag]) => tag));
    suggestions[b.id] = combineSuggestions({
      current: b.tags ?? [],
      ruleType: detectType(b.content || b.title || ""),
      evidence: evidence.get(b.id)!,
      rejectedHere,
      ai: picks.get(b.id) ?? null,
      vocabulary,
    });
    notes[b.id] = {
      neighbours: (neighbours.get(b.id) ?? []).filter((n) => Number(n.similarity) >= MIN_SIMILARITY).length,
      ai: picks.has(b.id),
      ...(justEmbedded.has(b.id) ? { embedded: true } : {}),
      ...(secret.has(b.id) ? { skipped: "credential" as const } : {}),
    };
  }
  return jsonResponse({ suggestions, notes, ai, ...(aiError ? { aiError } : {}), costUsd, model: MODEL });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "learn") return await learnMode(req, auth.client, auth.userId, body);
    return await itemsMode(auth.userId, body);
  } catch (e) {
    console.error("ai-suggest-tags error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
