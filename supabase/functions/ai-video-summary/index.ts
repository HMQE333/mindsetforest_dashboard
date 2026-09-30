import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getUserClient, replaceDashes } from "../_shared/planner.ts";

/**
 * Summaries of YouTube videos, on request (a button, never automatic: most
 * saved links are never worth the cost). One row per user and video in
 * link_summaries, attached to the link rather than written into a note.
 *
 * Passes, so each does one job well and the video is paid for once:
 * 1. transcript: Gemini watches the video (OpenRouter `video_url`, the only
 *    form that works; a link in plain text gets a confident invention) and
 *    writes the speech with [mm:ss] marks. Speech only: asking the same pass
 *    to log the visuals thins the transcript.
 * 2. summary: text only, from the transcript. Compression that keeps the
 *    functions of the material, not just its propositions.
 * 3. workshop: on its own request, a second watch for how the video is made.
 * Questions (`ask`) are answered from the stored transcript, text only.
 *
 * `summarize` and `workshop` return at once and finish in the background;
 * the client polls the row.
 *
 * Actions: summarize { url } | workshop { url } | ask { url, question }
 */

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const VIDEO_MODEL = Deno.env.get("VIDEO_MODEL") || "google/gemini-2.5-flash";
const TEXT_MODEL = Deno.env.get("VIDEO_TEXT_MODEL") || VIDEO_MODEL;
// A run that has not moved for this long died with its worker; start again.
const STALE_MS = 12 * 60 * 1000;

interface Usage { prompt_tokens?: number; completion_tokens?: number; cost?: number }

/** The 11-character id from any YouTube link form; null for anything else. */
function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "music.youtube.com") {
      id = u.searchParams.get("v");
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/);
      if (!id && m) id = m[1];
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function logUsage(userId: string, feature: string, model: string, usage: Usage | null) {
  try {
    await admin().from("ai_usage_log").insert({
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

/** One chat call; returns the text and what it cost. */
async function chat(
  userId: string,
  feature: string,
  model: string,
  messages: unknown[],
  maxTokens: number,
): Promise<{ text: string; cost: number }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`,
      "HTTP-Referer": "https://mindsetforest.app",
      "X-Title": "MindsetForest",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2, usage: { include: true } }),
  });
  const raw = await res.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok || body?.error) {
    const msg = String(body?.error?.message || raw || res.status).slice(0, 300);
    if (/token|context|too long|exceeds/i.test(msg)) throw new Error("The video is too long for one pass (about 50 minutes is the limit).");
    if (/private|unavailable|not found|permission|403|404/i.test(msg)) throw new Error("The model could not open this video. It may be private, age-restricted or removed.");
    throw new Error(`The model failed: ${msg}`);
  }
  const usage: Usage | null = body?.usage ?? null;
  await logUsage(userId, feature, model, usage);
  const text = String(body?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("The model returned nothing.");
  return { text, cost: Number(usage?.cost ?? 0) || 0 };
}

async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/** Title and channel from YouTube itself, so the model never guesses them. */
async function oembed(url: string): Promise<{ title: string; channel: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const d = await res.json();
    return { title: String(d?.title ?? "").slice(0, 300), channel: String(d?.author_name ?? "").slice(0, 120) };
  } catch {
    return null;
  }
}

const TRANSCRIPT_PROMPT = `Transcribe the speech in this video.
- Start a new paragraph every 20 to 60 seconds and whenever the topic changes, beginning with the time as [mm:ss] (or [h:mm:ss] past an hour).
- Write what is said, in the language it is said. Drop filler (um, uh, false starts); otherwise keep the words. Do not summarise and do not skip parts.
- Only when the speech points at something the words alone do not carry (a slide, code, a chart), add one short line: [on screen: ...].
- No title, no commentary, nothing but the transcript.`;

const SUMMARY_PROMPT = `You turn a video transcript into a second-brain note. Compress without losing function.

Semantic compression is not functional preservation. For every part ask: "if this is removed, what function is lost?" A part can inform, draw a distinction, give a mental model, raise salience, build emotional conviction, motivate, reinforce identity, offer an analogy, give context, make something memorable, give permission, simulate an experience, operationalise an abstraction, or integrate ideas. Cut only what carries no function, or a function already carried elsewhere. A story that builds conviction stays, compressed to two or three sentences, because the principle alone does not carry what the story does.

Judge depth first, honestly:
- shallow: one idea, repeated or motivational, little method or evidence. Write a short note (under 12 lines). Do not pad.
- solid: several distinct ideas, some explanation or method.
- deep: a coherent model with mechanisms, evidence or hard-won detail you would not guess from the title.

Use only what is in the transcript. Keep its [mm:ss] marks where you cite a part. Write in English whatever the language of the video. Markdown, no em dashes, no preamble.

# {title}
{channel} · Depth: shallow | solid | deep
**Thesis:** one line.

## Core principles
One line each, with [mm:ss].

## What it does to the mind
Key idea -> its function(s) -> the carrier worth keeping (story, analogy, example).

## Stories and analogies worth keeping
Two or three sentences each, and what they do.

## Bridge
Abstract -> explanation -> example -> one concrete operationalisation.

## Where it misleads or needs context

Leave out any section with nothing real to put in it.`;

const PERSONAL_SECTION = `

Then add a last section, "## Bridge for me", using the reader's context below: which one or two ideas meet where they are now, and the smallest concrete next step for each. Two to five lines. If nothing in the video meets their context, leave the section out.`;

const WORKSHOP_PROMPT = `Watch this video as a video maker studying the craft, not the topic. The reader records short videos and wants to learn from this one.
You see about one frame per second: describe rhythm and editing qualitatively, never exact cut counts.
The thumbnail is attached as an image; the title is given.

Markdown, English, no em dashes, no preamble. Cite moments as [mm:ss]. Leave out a section with nothing real in it.

## Hook (first 15 seconds)
What happens, and why it holds or loses attention.
## Structure and retention
How the video is built and what keeps people watching (open loops, payoffs, pattern breaks).
## Visual language
Framing, camera, lighting, colour, setting.
## Text and graphics
Captions, titles, overlays, their style and when they appear.
## B-roll and cutaways
What is shown instead of the speaker, and why there.
## Pacing and sound
Tempo of speech and edits, music, sound effects, silence.
## Title and thumbnail
How they work together and with the opening.
## Three things to steal
Concrete, doable in a phone recording of a minute or two.`;

const ASK_PROMPT = `You answer questions about one video from its transcript (and its summary). Cite where it is said as [mm:ss].
If the video does not say, say so plainly; you may then add general knowledge, clearly marked as not from the video.
Answer in the language of the question. Be concise. No em dashes.`;

async function readerContext(client: ReturnType<typeof admin>, userId: string): Promise<string> {
  const { data } = await client.from("user_context").select("notes,lenses,season").eq("user_id", userId).maybeSingle();
  const parts = [
    data?.season ? `What is true now: ${String(data.season).slice(0, 1500)}` : "",
    data?.notes ? `About them: ${String(data.notes).slice(0, 1500)}` : "",
    data?.lenses ? `How they think: ${String(data.lenses).slice(0, 800)}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

/** Transcript (unless already there), then summary and its vector. */
async function runSummary(userId: string, videoId: string, url: string, title: string, channel: string) {
  const db = admin();
  const row = await db.from("link_summaries").select("transcript,cost_usd").eq("user_id", userId).eq("video_id", videoId).single();
  let transcript = String(row.data?.transcript ?? "");
  let cost = Number(row.data?.cost_usd ?? 0) || 0;
  try {
    if (!transcript) {
      const t = await chat(userId, "video-transcript", VIDEO_MODEL, [
        { role: "user", content: [{ type: "text", text: TRANSCRIPT_PROMPT }, { type: "video_url", video_url: { url } }] },
      ], 60000);
      transcript = t.text;
      cost += t.cost;
      await db.from("link_summaries").update({ transcript, status: "summarizing", cost_usd: cost }).eq("user_id", userId).eq("video_id", videoId);
    }
    const context = await readerContext(db, userId);
    const s = await chat(userId, "video-summary", TEXT_MODEL, [
      { role: "system", content: SUMMARY_PROMPT + (context ? PERSONAL_SECTION : "") },
      {
        role: "user",
        content: `Title: ${title || "(unknown)"}\nChannel: ${channel || "(unknown)"}\n` +
          (context ? `\nReader's context:\n${context}\n` : "") +
          `\nTranscript:\n${transcript}`,
      },
    ], 8000);
    const summary = replaceDashes(s.text);
    cost += s.cost;
    const vector = await embed(`${title}\n${channel}\n\n${summary}`);
    await db.from("link_summaries").update({
      summary,
      status: "ready",
      error: null,
      cost_usd: cost,
      ...(vector ? { embedding: JSON.stringify(vector) } : {}),
    }).eq("user_id", userId).eq("video_id", videoId);
  } catch (e) {
    await db.from("link_summaries").update({
      status: "error",
      error: e instanceof Error ? e.message : "Something went wrong.",
      cost_usd: cost,
    }).eq("user_id", userId).eq("video_id", videoId);
  }
}

async function runWorkshop(userId: string, videoId: string, url: string, title: string) {
  const db = admin();
  const row = await db.from("link_summaries").select("cost_usd").eq("user_id", userId).eq("video_id", videoId).single();
  let cost = Number(row.data?.cost_usd ?? 0) || 0;
  try {
    const w = await chat(userId, "video-workshop", VIDEO_MODEL, [
      {
        role: "user",
        content: [
          { type: "text", text: `${WORKSHOP_PROMPT}\n\nTitle: ${title || "(unknown)"}` },
          { type: "image_url", image_url: { url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` } },
          { type: "video_url", video_url: { url } },
        ],
      },
    ], 6000);
    cost += w.cost;
    await db.from("link_summaries").update({ workshop: replaceDashes(w.text), workshop_status: "ready", workshop_error: null, cost_usd: cost })
      .eq("user_id", userId).eq("video_id", videoId);
  } catch (e) {
    await db.from("link_summaries").update({
      workshop_status: "error",
      workshop_error: e instanceof Error ? e.message : "Something went wrong.",
      cost_usd: cost,
    }).eq("user_id", userId).eq("video_id", videoId);
  }
}

function background(task: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
  else task.catch((e) => console.error("background task failed:", e));
}

const PUBLIC_COLUMNS = "id,video_id,url,title,channel,status,error,transcript,summary,workshop,workshop_status,workshop_error,qa,cost_usd,created_at,updated_at";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
    if (!Deno.env.get("OPENROUTER_API_KEY")) return jsonResponse({ error: "OPENROUTER_API_KEY is not configured" }, 500);
    const userId = auth.userId;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const id = youtubeId(String(body.url || ""));
    if (!id) return jsonResponse({ error: "Only YouTube videos can be summarised." }, 400);
    const url = `https://www.youtube.com/watch?v=${id}`;
    const db = admin();

    const { data: existing } = await db.from("link_summaries").select(PUBLIC_COLUMNS).eq("user_id", userId).eq("video_id", id).maybeSingle();

    if (action === "ask") {
      const question = String(body.question || "").trim().slice(0, 1000);
      if (!question) return jsonResponse({ error: "Ask something." }, 400);
      if (!existing?.transcript) return jsonResponse({ error: "Summarise the video first; questions are answered from its transcript." }, 400);
      const earlier = (Array.isArray(existing.qa) ? existing.qa : []).slice(-4)
        .flatMap((x: { q: string; a: string }) => [{ role: "user", content: x.q }, { role: "assistant", content: x.a }]);
      const a = await chat(userId, "video-ask", TEXT_MODEL, [
        { role: "system", content: `${ASK_PROMPT}\n\nTitle: ${existing.title}\nChannel: ${existing.channel}\n\nSummary:\n${existing.summary}\n\nTranscript:\n${existing.transcript}` },
        ...earlier,
        { role: "user", content: question },
      ], 2000);
      const entry = { q: question, a: replaceDashes(a.text), at: new Date().toISOString() };
      const qa = [...(Array.isArray(existing.qa) ? existing.qa : []), entry].slice(-50);
      await db.from("link_summaries").update({ qa, cost_usd: (Number(existing.cost_usd) || 0) + a.cost }).eq("user_id", userId).eq("video_id", id);
      return jsonResponse({ answer: entry });
    }

    if (action !== "summarize" && action !== "workshop") return jsonResponse({ error: "Invalid action" }, 400);

    const meta = existing?.title ? { title: existing.title, channel: existing.channel } : await oembed(url);
    if (!existing && !meta) return jsonResponse({ error: "YouTube does not know this video. It may be private or removed." }, 404);
    const title = meta?.title || "";
    const channel = meta?.channel || "";
    const stale = (at?: string) => !at || Date.now() - new Date(at).getTime() > STALE_MS;

    if (action === "summarize") {
      const busy = existing && (existing.status === "transcribing" || existing.status === "summarizing") && !stale(existing.updated_at);
      if (existing?.status === "ready" || busy) return jsonResponse({ row: existing });
      // A transcript already paid for is kept; only the text passes run again.
      const status = existing?.transcript ? "summarizing" : "transcribing";
      const { data: row, error } = await db.from("link_summaries").upsert(
        { user_id: userId, video_id: id, url, title, channel, status, error: null },
        { onConflict: "user_id,video_id" },
      ).select(PUBLIC_COLUMNS).single();
      if (error) throw error;
      background(runSummary(userId, id, url, title, channel));
      return jsonResponse({ row });
    }

    // workshop
    const busy = existing?.workshop_status === "running" && !stale(existing.updated_at);
    if (existing?.workshop_status === "ready" || busy) return jsonResponse({ row: existing });
    const { data: row, error } = await db.from("link_summaries").upsert(
      { user_id: userId, video_id: id, url, title, channel, workshop_status: "running", workshop_error: null },
      { onConflict: "user_id,video_id" },
    ).select(PUBLIC_COLUMNS).single();
    if (error) throw error;
    background(runWorkshop(userId, id, url, title));
    return jsonResponse({ row });
  } catch (e) {
    console.error("ai-video-summary error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
