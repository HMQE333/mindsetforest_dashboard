import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getUserClient, replaceDashes } from "../_shared/planner.ts";

/**
 * Proposes one of the user's app_classes for screen-time app keys that the
 * catalog, rules and keywords left without one ("Przypisz w 10 sekund").
 *
 * The answer is a suggestion, never a classification: the triage dialog shows
 * it and only a confirmed one becomes an app_rules row. Every answer is kept
 * in app_class_suggestions, so a repeated run sends the model only what it has
 * not seen against the same vocabulary; a key the user skipped is never sent
 * again, and one they decided comes back as their own earlier pick.
 *
 * Classes, projects, notes and the titles opt-out are read here, not taken
 * from the body, so the client cannot inflate the prompt and the cache is
 * keyed on what the database says the vocabulary is. Every key and title is
 * redacted here before the prompt is built, whatever the client did.
 *
 * Body:   { items: [{ app_key, app, device: "pc" | "phone", minutes, titles: string[] }] }
 * Answer: { suggestions: [{ app_key, class_id, alt_class_id, confidence, multi, why, cached, decided? }],
 *           asked, cached, skipped, failed, costUsd, model }
 */

const MAX_ITEMS = 60;
const MAX_TITLES = 3;
const MAX_VALUE = 200;
const BATCH = 20;
const PAGE = 1000;
const MAX_PAGES = 10;
const MODEL = Deno.env.get("CLASSIFY_MODEL") || Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
// A key the user decided before comes back below any pre-selection threshold.
const DECIDED_CONFIDENCE = 0.5;
const DECIDED_WHY = "Twój wcześniejszy wybór";
const CONFLICT = "user_id,item_type,app_key,title_key";
// Per user and month, this feature only: the cache keeps a real user near a cent a month,
// so the cap only stops a script sending fresh keys in a loop.
const BUDGET_USD = (() => {
  const n = Number(Deno.env.get("CLASSIFY_BUDGET_USD") || "1");
  return Number.isFinite(n) && n > 0 ? n : 1;
})();

interface Item { app_key: string; app: string; device: "pc" | "phone"; minutes: number; titles: string[] }
interface Usage { prompt_tokens?: number; completion_tokens?: number; cost?: number }
interface Answer { i: number; c: string; alt: string; conf: number; multi: boolean; why: string }
interface Known {
  app_key: string;
  class_id: string | null;
  alt_class_id: string | null;
  confidence: number | string;
  multi_purpose: boolean;
  reason: string;
  status: string;
  final_class_id: string | null;
  vocab_hash: string;
  decided_at: string | null;
}
interface Suggestion {
  app_key: string;
  class_id: string | null;
  alt_class_id: string | null;
  confidence: number;
  multi: boolean;
  why: string;
  cached: boolean;
  decided?: boolean;
}

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const unit = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));

// Keep normTitle and redactForPrompt identical to the copies in
// artifacts/app/src/lib/app-usage-ai.ts (a test there compares them).

const BROWSER_SUFFIX = /\s+[-–—]\s+(?:Google Chrome|Brave|Microsoft\u200B?\s?Edge|Mozilla Firefox|Firefox|Opera(?: GX)?|Vivaldi|Arc|Zen)$/i;

/** A tab's identity: no "(3) " counter, no " - Brave" suffix, single spaces. Not redacted. */
function normTitle(title: string): string {
  return String(title || "").replace(/^\(\d[\d\s,.]*\)\s*/, "").replace(/\s+/g, " ").trim().replace(BROWSER_SUFFIX, "").trim();
}

/** What may leave for the model: addresses, DM handles, URL queries, ids, tokens and long numbers masked. */
function redactForPrompt(text: string, max = 80): string {
  let t = normTitle(text);
  // Folders before the file name (they carry the user's name): "C:\Users\Jan\a.pdf" -> "a.pdf".
  t = t.replace(/(?:\b[A-Za-z]:|\\\\[^\\\s|]+)\\(?:[^\\|]*\\)*/g, "");
  t = t.replace(/(?:\/(?:home|Users)\/|~\/)(?:[^/|]*\/)*/g, "");
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>");
  t = t.replace(/(^|[\s|(])@[^|]*/g, "$1@<osoba> ");
  t = t.replace(/((?:https?:\/\/|blob:)?[\w-]+(?:\.[\w-]+)+(?:\/[^\s?#]*)?)[?#]\S+/gi, "$1");
  t = t.replace(/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  t = t.replace(/\b[0-9a-f]{20,}\b/gi, "<id>");
  t = t.replace(/\beyJ[\w-]{8,}(?:\.[\w-]+){0,2}/g, "<id>");
  t = t.replace(/(?<![\w-])(?=[\w-]*\d)(?=[\w-]*[a-z])(?=[\w-]*[A-Z])[\w-]{24,}(?![\w-])/g, "<id>");
  t = t.replace(/(?<![\w.,/])\+?\d(?:[ -]?\d){6,}(?![\w.,/])/g, "#");
  return t.replace(/\s+/g, " ").trim().slice(0, max);
}

/** One item per key (the one with more minutes wins), the most-used first. The key itself is never altered. */
function parseItems(body: any): Item[] {
  const raw = Array.isArray(body?.items) ? body.items.slice(0, 500) : [];
  const byKey = new Map<string, Item>();
  for (const r of raw) {
    const app_key = typeof r?.app_key === "string" ? r.app_key : "";
    if (!app_key.trim() || app_key.length > MAX_VALUE) continue;
    const minutes = Math.max(0, Math.min(100000, Math.round(Number(r?.minutes) || 0)));
    const prev = byKey.get(app_key);
    if (prev && prev.minutes >= minutes) continue;
    byKey.set(app_key, {
      app_key,
      app: str(r?.app, MAX_VALUE),
      device: r?.device === "phone" ? "phone" : "pc",
      minutes,
      titles: Array.isArray(r?.titles)
        ? r.titles.slice(0, 20).map((t: unknown) => str(t, MAX_VALUE)).filter(Boolean).slice(0, MAX_TITLES)
        : [],
    });
  }
  return [...byKey.values()].sort((a, b) => b.minutes - a.minutes).slice(0, MAX_ITEMS);
}

async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function admin() {
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
    .eq("feature", "usage-classify")
    .gte("created_at", start.toISOString())
    .limit(5000);
  if (error || !data) return 0;
  return data.reduce((n: number, r: { cost_usd: unknown }) => n + (Number(r.cost_usd) || 0), 0);
}

async function logUsage(userId: string, usage: Usage | null) {
  try {
    await admin()?.from("ai_usage_log").insert({
      user_id: userId,
      feature: "usage-classify",
      model: MODEL,
      prompt_tokens: Math.max(0, Math.round(Number(usage?.prompt_tokens ?? 0) || 0)),
      completion_tokens: Math.max(0, Math.round(Number(usage?.completion_tokens ?? 0) || 0)),
      cost_usd: Math.max(0, Number(usage?.cost ?? 0) || 0),
    });
  } catch (e) {
    console.error("ai_usage_log insert failed:", e);
  }
}

/** Every 'key' row of the user, a page at a time. A missing table reads as none. */
async function readKnown(client: SupabaseClient, userId: string): Promise<Known[]> {
  const out: Known[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await client
      .from("app_class_suggestions")
      .select("app_key,class_id,alt_class_id,confidence,multi_purpose,reason,status,final_class_id,vocab_hash,decided_at")
      .eq("user_id", userId)
      .eq("item_type", "key")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      console.error("app_class_suggestions read failed:", error.message);
      break;
    }
    out.push(...((data ?? []) as Known[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

const KINDS = `- work: paid work and work on the user's projects (code, admin panels, developer consoles of their shops, documents they write)
- learning: study, lectures, courses, reading or asking in order to understand something
- communication: messaging, mail, calls, penpals
- watching: films, series, anime, streams, long video
- waste: time the user wants to shrink (feeds, short video, aimless browsing)
- neutral: the system and life admin, counted as neither (launcher, settings, clock, camera, gallery, app store, maps, transport, taxis, banking, food delivery, shopping, password managers)`;

function systemPrompt(classes: string, projects: string, notes: string, history: string): string {
  return `You sort screen-time items into the user's own time classes. The user is Polish; window titles mix Polish and English.

CLASSES (answer with the id):
${classes}

What the kinds mean:
${KINDS}

THE USER'S PROJECTS (time spent on these is work):
${projects || "(none)"}

ABOUT THE USER (their own words):
${notes || "(nothing written)"}
${history ? `\nHOW THIS USER DECIDED BEFORE (follow their taste over your defaults):\n${history}\n` : ""}
Each item is one app or site with the device, the minutes spent in it recently, its key, the app's name and up to three window titles. "Browser | X" is time in browser tabs on the site X (a name or a domain). Phone keys are Android package names: use what you know about the app. Personal data is masked as <email>, <osoba>, <id> and #.

For every item return:
- c: the class id, or "none" when you cannot tell at all
- alt: the second most likely class id, or "none"
- conf: 0.9-1 the app has one obvious purpose that maps onto exactly one class (a phone dialer is communication); 0.7-0.9 likely; 0.5-0.7 it depends on how this person uses it; below 0.5 a guess
- multi: true when the app serves many purposes (browsers, AI chats, notes, search), else false
- why: at most 8 words, in Polish

Rules:
1. A class keyword or a project name in the key or a title decides.
2. Do not stretch: if an item could fall in two classes, lower conf and give alt.
3. Never invent a class id. Answer every item, in order, with the classify tool.`;
}

const quoted = (s: string) => `"${s.replace(/"/g, "'")}"`;

function itemLine(it: Item, n: number, titlesAllowed: boolean): string {
  const app = redactForPrompt(it.app, 60);
  const seen = new Set(["", app.toLowerCase()]);
  const titles = titlesAllowed
    ? it.titles.map((t) => redactForPrompt(t)).filter((t) => !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()))
    : [];
  return `[${n}] ${it.device} | ${it.minutes} min | key ${quoted(redactForPrompt(it.app_key, 120))} | app ${quoted(app)}`
    + (titles.length ? ` | titles: ${titles.map(quoted).join(" / ")}` : "");
}

function classifyTool(enumIds: string[]) {
  return {
    type: "function",
    function: {
      name: "classify",
      description: "One answer per input item, in input order",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                i: { type: "integer", description: "The item's number" },
                c: { type: "string", enum: enumIds },
                alt: { type: "string", enum: enumIds },
                conf: { type: "number" },
                multi: { type: "boolean" },
                why: { type: "string" },
              },
              required: ["i", "c", "alt", "conf", "multi", "why"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
  };
}

class ModelError extends Error {
  constructor(message: string, public status: number) { super(message); }
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

async function askBatch(system: string, batch: Item[], ids: string[], titlesAllowed: boolean): Promise<{ answers: Answer[]; usage: Usage | null }> {
  const payload = {
    model: MODEL,
    temperature: 0,
    max_tokens: 3000,
    reasoning: { enabled: false },
    usage: { include: true },
    messages: [
      { role: "system", content: system },
      { role: "user", content: batch.map((it, k) => itemLine(it, k + 1, titlesAllowed)).join("\n") },
    ],
    tools: [classifyTool([...ids, "none"])],
    tool_choice: { type: "function", function: { name: "classify" } },
  };
  // Only endpoints that neither store nor train on prompts. If that leaves the
  // model with none, ask once without the restriction rather than not at all.
  let r = await post({ ...payload, provider: { data_collection: "deny" } });
  if (r.status !== 200 && /no endpoints/i.test(r.text)) {
    console.warn("ai-usage-classify: no endpoint without data collection, asking without the restriction");
    r = await post(payload);
  }
  if (r.status !== 200) {
    console.error("ai-usage-classify model error:", r.status, r.text.slice(0, 300));
    throw new ModelError(r.status === 429 ? "Rate limit exceeded" : r.status === 402 ? "Payment required" : "AI gateway error", r.status);
  }
  const message = r.data?.choices?.[0]?.message;
  const args = message?.tool_calls?.[0]?.function?.arguments ?? message?.content;
  let answers: Answer[] = [];
  try {
    const parsed = typeof args === "string" ? JSON.parse(args) : args;
    if (Array.isArray(parsed?.items)) answers = parsed.items;
  } catch { /* nothing usable: the batch counts as failed */ }
  return { answers, usage: r.data?.usage ?? null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
    const { client, userId } = auth;

    const body = await req.json().catch(() => ({}));
    const items = parseItems(body);
    const empty = { suggestions: [], asked: 0, cached: 0, skipped: 0, failed: 0, costUsd: 0, model: MODEL };
    if (items.length === 0) return jsonResponse(empty);

    const [classesRes, projectsRes, ctxRes, privacyRes, known] = await Promise.all([
      client.from("app_classes").select("id,name,kind,keywords,project_id,sort_order").eq("user_id", userId).order("sort_order"),
      client.from("user_projects").select("id,name").eq("user_id", userId),
      client.from("user_context").select("notes").eq("user_id", userId).maybeSingle(),
      client.from("app_tracking_privacy").select("ai_titles").eq("user_id", userId).maybeSingle(),
      readKnown(client, userId),
    ]);
    const classes = (classesRes.data ?? []) as { id: string; name: string; kind: string; keywords: string[] | null; project_id: string | null }[];
    if (classes.length === 0) return jsonResponse({ error: "No classes" }, 400);
    // Missing row or column (migration not applied) reads as the default: titles allowed.
    const titlesAllowed = (privacyRes.data as { ai_titles?: boolean } | null)?.ai_titles !== false;

    // Short ids c1..cN keep the output small and make an invented uuid impossible.
    const shortToId = new Map(classes.map((c, i) => [`c${i + 1}`, c.id]));
    const idToShort = new Map([...shortToId].map(([s, id]) => [id, s]));
    const projectRows = (projectsRes.data ?? []) as { id: string; name: string }[];
    const projectById = new Map(projectRows.map((p) => [p.id, str(p.name, 60)]));
    const classLines = classes.map((c, i) =>
      `c${i + 1} ${quoted(str(c.name, 60))} - ${c.kind}`
      + (c.project_id && projectById.get(c.project_id) ? ` - project ${projectById.get(c.project_id)}` : "")
      + ((c.keywords ?? []).length ? ` - keywords: ${(c.keywords ?? []).slice(0, 20).map((k) => str(k, 40)).join(", ")}` : "")).join("\n");
    const projectNames = projectRows.map((p) => str(p.name, 60)).filter(Boolean).slice(0, 40);
    const notes = str((ctxRes.data as { notes?: string } | null)?.notes, 600);
    const vocab = await sha(JSON.stringify([
      [...classes].sort((a, b) => a.id.localeCompare(b.id)).map((c) => [c.id, c.name, c.kind]),
      [...projectNames].sort(),
    ]));

    const knownByKey = new Map(known.map((r) => [r.app_key, r]));
    // The user's own corrections are the best examples of their taste there are; the latest 20.
    const history = known
      .filter((r) => r.status === "corrected" && r.final_class_id && idToShort.has(r.final_class_id))
      .sort((a, b) => String(b.decided_at ?? "").localeCompare(String(a.decided_at ?? "")))
      .slice(0, 20)
      .map((r) => `- ${quoted(redactForPrompt(r.app_key, 60))} -> ${idToShort.get(r.final_class_id!)}`)
      .join("\n");

    const out: Suggestion[] = [];
    const misses: Item[] = [];
    let skipped = 0;
    for (const it of items) {
      const hit = knownByKey.get(it.app_key);
      if (hit?.status === "dismissed") { skipped++; continue; }            // skipped: never sent again
      if ((hit?.status === "accepted" || hit?.status === "corrected") && hit.final_class_id && idToShort.has(hit.final_class_id)) {
        // Decided before, yet unassigned again (its rule is gone): the user's own pick, free, never pre-selected.
        out.push({
          app_key: it.app_key, class_id: hit.final_class_id, alt_class_id: null,
          confidence: Math.min(unit(hit.confidence), DECIDED_CONFIDENCE), multi: hit.multi_purpose === true,
          why: DECIDED_WHY, cached: true, decided: true,
        });
        continue;
      }
      if (hit?.status === "offered" && hit.vocab_hash === vocab && (!hit.class_id || idToShort.has(hit.class_id))) {
        out.push({
          app_key: it.app_key, class_id: hit.class_id, alt_class_id: hit.alt_class_id && idToShort.has(hit.alt_class_id) ? hit.alt_class_id : null,
          confidence: unit(hit.confidence), multi: hit.multi_purpose === true, why: hit.reason ?? "", cached: true,
        });
        continue;
      }
      misses.push(it);
    }

    let failed = 0;
    let costUsd = 0;
    const failures: ModelError[] = [];
    const rows: Record<string, unknown>[] = [];
    if (misses.length && !Deno.env.get("OPENROUTER_API_KEY")) {
      failed = misses.length;
      failures.push(new ModelError("OPENROUTER_API_KEY is not configured", 500));
    } else if (misses.length && (await monthSpend(userId)) >= BUDGET_USD) {
      failed = misses.length;                                                 // cached answers still go back
      failures.push(new ModelError("Miesięczny limit AI dla kategorii jest wyczerpany", 429));
    } else if (misses.length) {
      const system = systemPrompt(classLines, projectNames.join(", "), notes, history);
      const batches: Item[][] = [];
      for (let i = 0; i < misses.length; i += BATCH) batches.push(misses.slice(i, i + BATCH));
      const settled = await Promise.allSettled(batches.map((b) => askBatch(system, b, [...shortToId.keys()], titlesAllowed)));

      await Promise.all(settled.map(async (s, bi) => {
        if (s.status === "rejected") {
          failed += batches[bi].length;                                       // not cached: asked again next run
          failures.push(s.reason instanceof ModelError ? s.reason : new ModelError(String(s.reason?.message ?? s.reason), 500));
          return;
        }
        await logUsage(userId, s.value.usage);
        costUsd += Number(s.value.usage?.cost ?? 0) || 0;
        const byIndex = new Map<number, Answer>();
        for (const a of s.value.answers) if (!byIndex.has(Number(a?.i))) byIndex.set(Number(a?.i), a);
        batches[bi].forEach((it, k) => {
          const a = byIndex.get(k + 1);
          // "none" is an answer ("cannot tell", kept); a missing or invented id is not (asked again next run).
          const classId = a?.c === "none" ? null : a ? shortToId.get(String(a.c)) : undefined;
          if (!a || classId === undefined) { failed++; return; }
          const sugg: Suggestion = {
            app_key: it.app_key,
            class_id: classId,
            alt_class_id: (a.alt !== a.c && shortToId.get(String(a.alt))) || null,
            confidence: unit(a.conf),
            multi: a.multi === true,
            why: replaceDashes(str(a.why, 80)),
            cached: false,
          };
          out.push(sugg);
          rows.push({
            user_id: userId, item_type: "key", app_key: it.app_key, title_key: "",
            class_id: sugg.class_id, alt_class_id: sugg.alt_class_id, confidence: sugg.confidence,
            multi_purpose: sugg.multi, reason: sugg.why, model: MODEL, vocab_hash: vocab, status: "offered",
            final_class_id: null, preselected: false, decided_at: null, seconds_at_offer: it.minutes * 60,
          });
        });
      }));
    }

    // Written with the user's own token (RLS). New keys insert-only, a row read
    // stale is replaced only while it is still what was read: a decision the
    // user made while the model was thinking is never overwritten.
    if (rows.length) {
      const fresh = rows.filter((r) => !knownByKey.has(r.app_key as string));
      const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
      if (fresh.length) writes.push(client.from("app_class_suggestions").upsert(fresh, { onConflict: CONFLICT, ignoreDuplicates: true }));
      for (const r of rows) {
        const was = knownByKey.get(r.app_key as string);
        if (!was) continue;
        let q = client.from("app_class_suggestions").update(r)
          .eq("user_id", userId).eq("item_type", "key").eq("title_key", "").eq("app_key", r.app_key as string).eq("status", was.status);
        if (was.status !== "offered") q = q.is("final_class_id", null);
        writes.push(q);
      }
      for (const { error } of await Promise.all(writes)) {
        if (error) console.error("app_class_suggestions write failed:", error.message);
      }
    }

    if (failed > 0 && out.length === 0) {
      const first = failures.find((f) => f.status === 429 || f.status === 402) ?? failures[0];
      if (first && (first.status === 429 || first.status === 402)) return jsonResponse({ error: first.message }, first.status);
      return jsonResponse({ error: first?.message || "The model gave no usable answer" }, 500);
    }
    return jsonResponse({
      suggestions: out,
      asked: misses.length,
      cached: out.filter((s) => s.cached).length,
      skipped,
      failed,
      costUsd,
      model: MODEL,
    });
  } catch (e) {
    console.error("ai-usage-classify error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
