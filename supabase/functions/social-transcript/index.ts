import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";

/**
 * A reel or short (Instagram, TikTok, X, Facebook, YouTube) as an Archive
 * note: what it says, in a few points, and the whole transcript.
 *
 *   { url }    -> { status: "done", note } | { status: "pending", jobId } | { error }
 *   { jobId, url } -> the same, for a transcript Supadata is still making.
 *
 * 1. Supadata metadata (caption, author, cover) and transcript (the
 *    platform's own captions, else generated from the audio).
 * 2. The cover is copied into archive-images (platform image links expire).
 * 3. OpenRouter writes a title and the key points from the transcript.
 * The caller saves the note; nothing is stored here but the cover.
 */
const SUPADATA = "https://api.supadata.ai/v1";
const APIFY = "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items";
const TRANSCRIBE_MODEL = Deno.env.get("TRANSCRIBE_MODEL") || "openai/gpt-4o-transcribe";
const MAX_VIDEO_BYTES = 24_000_000;

interface Found { transcript: string; caption: string; author: string | null; title: string; coverUrl?: string; platform: string; via: string; duration: number | null }

/**
 * Instagram the cheap way: Apify's Instagram scraper (about $0.002 a post,
 * inside Apify's free monthly credit) gives the video file, caption, author
 * and cover; our own speech model writes the transcript (about $0.003 a
 * minute). Null when anything fails, so Supadata can take over.
 */
async function viaApify(url: string): Promise<Found | null> {
  const token = Deno.env.get("APIFY_TOKEN");
  const orKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!token || !orKey || !/instagram\.com\//i.test(url)) return null;
  try {
    const res = await fetch(`${APIFY}?timeout=90`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false }),
      signal: AbortSignal.timeout(110_000),
    });
    const items = await res.json().catch(() => null);
    const it = Array.isArray(items) ? items[0] : null;
    if (!res.ok || !it) { console.error("apify", res.status, JSON.stringify(items).slice(0, 300)); return null; }
    const caption = String(it.caption ?? "").trim();
    let transcript = "";
    if (it.videoUrl) {
      const v = await fetch(it.videoUrl, { signal: AbortSignal.timeout(30_000) });
      const buf = new Uint8Array(await v.arrayBuffer());
      if (!v.ok || buf.length > MAX_VIDEO_BYTES) return null;
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const stt = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${orKey}`, "Content-Type": "application/json" },
        // An mp4 reel is an m4a container to the speech API.
        body: JSON.stringify({ model: TRANSCRIBE_MODEL, input_audio: { data: btoa(bin), format: "m4a" }, temperature: 0 }),
      });
      if (!stt.ok) { console.error("stt", stt.status, (await stt.text()).slice(0, 300)); return null; }
      transcript = String((await stt.json())?.text ?? "").trim();
    }
    return { transcript, caption, author: it.ownerUsername ?? it.ownerFullName ?? null, title: "", coverUrl: it.displayUrl, platform: "instagram", via: "apify", duration: Number(it.videoDuration) || null };
  } catch (e) {
    console.error("apify path", e);
    return null;
  }
}
const MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
const SOCIAL = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|tiktok\.com|vm\.tiktok\.com|x\.com|twitter\.com|facebook\.com|fb\.watch|youtube\.com|youtu\.be)\//i;

async function supa(path: string, key: string) {
  const res = await fetch(`${SUPADATA}${path}`, { headers: { "x-api-key": key } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function copyCover(url: string | undefined, userId: string): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const path = `${userId}/reel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.storage.from("archive-images").upload(path, buf, { contentType: type });
    if (error) return null;
    return admin.storage.from("archive-images").getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

async function summarize(transcript: string, caption: string) {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key || (!transcript.trim() && !caption.trim())) return null;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You turn a short video's transcript into a note for the viewer's personal archive. " +
            'Return JSON {"title": string, "points": string[]}. title: under 70 characters, says what the video teaches or claims, not "Video about". ' +
            "points: 2 to 6 short bullet points with the actual ideas, steps, numbers or names from the video, in the language of the transcript. " +
            "No filler, nothing that is not in the video. If it says nothing of substance, one point saying so.",
        },
        { role: "user", content: `Caption:\n${caption.slice(0, 2000)}\n\nTranscript:\n${transcript.slice(0, 24000)}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  try {
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
    const points = Array.isArray(parsed.points) ? parsed.points.filter((p: unknown) => typeof p === "string" && p.trim()).slice(0, 8) : [];
    return { title: typeof parsed.title === "string" ? parsed.title.slice(0, 120) : "", points };
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
type Result = { status: "done"; note: any } | { status: "pending"; jobId: string } | { error: string; code?: string; httpStatus: number };

/** One step of reading a video: done, still pending at Supadata (jobId), or an error. */
async function readVideo(url: string, jobId: string | null, userId: string): Promise<Result> {
  // 1. Instagram through Apify and our own speech model (cheapest); 2. Supadata for the rest, or when that fails.
  if (!jobId) {
    const found = await viaApify(url);
    if (found) {
      const [summary, cover] = await Promise.all([summarize(found.transcript, found.caption), copyCover(found.coverUrl, userId)]);
      return {
        status: "done",
        note: { url, platform: found.platform, author: found.author, title: summary?.title || found.caption.split("\n")[0].slice(0, 100) || "Saved video", points: summary?.points ?? [], transcript: found.transcript, caption: found.caption, cover, lang: "", duration: found.duration, via: found.via },
      };
    }
  }
  const key = Deno.env.get("SUPADATA_API_KEY");
  if (!key) return { error: "The video could not be read (no fallback service set up)", httpStatus: 502 };

  let transcript = "";
  let lang = "";
  if (jobId) {
    const r = await supa(`/transcript/${jobId}`, key);
    if (r.body?.status === "queued" || r.body?.status === "active") return { status: "pending", jobId };
    if (r.body?.status !== "completed") return { error: r.body?.error?.message || "The transcript could not be made", httpStatus: 502 };
    const c = r.body.result?.content ?? r.body.content;
    transcript = typeof c === "string" ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? "").join(" ") : "";
    lang = r.body.result?.lang ?? r.body.lang ?? "";
  } else {
    const r = await supa(`/transcript?url=${encodeURIComponent(url)}&text=true&mode=auto`, key);
    if (r.status === 202 || r.body?.jobId) return { status: "pending", jobId: r.body.jobId };
    if (r.status === 206) transcript = "";
    else if (r.status !== 200) {
      const msg = r.status === 429 || r.status === 402 ? "The transcript service's limit is used up" : r.body?.message || "The transcript could not be made";
      return { error: msg, code: r.body?.error, httpStatus: 502 };
    } else {
      transcript = typeof r.body.content === "string" ? r.body.content : "";
      lang = r.body.lang ?? "";
    }
  }

  const meta = (await supa(`/metadata?url=${encodeURIComponent(url)}`, key)).body ?? {};
  const caption = String(meta.description ?? meta.title ?? "").trim();
  const [summary, cover] = await Promise.all([summarize(transcript, caption), copyCover(meta.media?.thumbnailUrl, userId)]);

  return {
    status: "done",
    note: {
      url,
      platform: meta.platform ?? null,
      author: meta.author?.displayName ?? null,
      title: summary?.title || String(meta.title ?? "").slice(0, 100) || "Saved video",
      points: summary?.points ?? [],
      transcript: transcript.trim(),
      caption,
      cover,
      lang,
      duration: meta.media?.duration ?? null,
      via: "supadata",
    },
  };
}

/** 42 -> "0:42", 125 -> "2:05". */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** The note's text, as the web Inbox writes it (lib/social-video.ts socialNoteContent). */
// deno-lint-ignore no-explicit-any
function noteContent(n: any, comment: string): string {
  const parts: string[] = [];
  if (comment.trim()) parts.push(comment.trim());
  parts.push(n.url + (n.author ? ` (${n.author})` : "") + (n.duration ? ` · ${clock(n.duration)}` : ""));
  if (n.cover) parts.push(`[image] ${n.cover}`);
  if (n.points?.length) parts.push(`**Key points**\n${n.points.map((p: string) => `- ${p}`).join("\n")}`);
  if (n.transcript) parts.push(`**Transcript**\n${n.transcript}`);
  if (n.caption && n.caption !== n.title) parts.push(`**Caption**\n${n.caption}`);
  return parts.join("\n\n");
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// ---- Workshop: the reel watched as a video maker would (the same pass as ai-video-summary's workshop for YouTube) ----

const WORKSHOP_MODEL = Deno.env.get("VIDEO_MODEL") || "google/gemini-2.5-flash";
const WORKSHOP_PROMPT = `Watch this short vertical video (a reel or short) as a video maker studying the craft, not the topic. The reader records short videos and wants to learn from this one.
You see about one frame per second: describe rhythm and editing qualitatively, never exact cut counts.

Markdown, English, no em dashes, no preamble. Cite moments as [m:ss]. Leave out a section with nothing real in it. Use ### for section headings.

### Hook (first 3 seconds)
What happens, and why it stops the scroll or doesn't.
### Structure and retention
How it is built and what keeps people watching to the end (open loops, payoffs, pattern breaks, the loop back to the start).
### Visual language
Framing, camera, lighting, colour, setting.
### Text and captions
On-screen text, captions, their style, size, placement and timing.
### Cuts and B-roll
What is shown instead of the speaker, and why there.
### Pacing and sound
Tempo of speech and edits, music, trending audio, sound effects, silence.
### Three things to steal
Concrete, doable in a phone recording of under a minute.`;

const WORKSHOP_HEAD = "**Workshop**";
const WORKSHOP_PENDING = "_⏳ Gemini is watching the video…_";

/** The note with its Workshop section set to `body` (added at the end, or replacing the old one). */
function withWorkshop(content: string, body: string): string {
  const at = content.indexOf(`\n\n${WORKSHOP_HEAD}\n`);
  const base = at >= 0 ? content.slice(0, at) : content.trimEnd();
  return `${base}\n\n${WORKSHOP_HEAD}\n${body.trim()}`;
}

/** What Gemini can watch: a YouTube Short's link as is; an Instagram reel's file (via Apify) as a data URL. */
async function watchableVideo(url: string): Promise<string> {
  if (/youtube\.com\/shorts\/|youtu\.be\//i.test(url)) return url;
  if (!/instagram\.com\//i.test(url)) throw new Error("Workshop works for Instagram reels and YouTube Shorts.");
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("The video could not be fetched (Apify is not set up).");
  const res = await fetch(`${APIFY}?timeout=90`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false }),
    signal: AbortSignal.timeout(110_000),
  });
  const items = await res.json().catch(() => null);
  const videoUrl = Array.isArray(items) ? items[0]?.videoUrl : null;
  if (!videoUrl) throw new Error("This post has no video Gemini could watch.");
  const v = await fetch(videoUrl, { signal: AbortSignal.timeout(30_000) });
  const buf = new Uint8Array(await v.arrayBuffer());
  if (!v.ok || buf.length > MAX_VIDEO_BYTES) throw new Error("The video could not be downloaded (or is too large).");
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:video/mp4;base64,${btoa(bin)}`;
}

async function runWorkshop(url: string, title: string): Promise<string> {
  const video = await watchableVideo(url);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json", "X-Title": "MindsetForest" },
    body: JSON.stringify({
      model: WORKSHOP_MODEL,
      temperature: 0.2,
      max_tokens: 2500,
      messages: [{ role: "user", content: [{ type: "text", text: `${WORKSHOP_PROMPT}\n\nTitle: ${title || "(unknown)"}` }, { type: "video_url", video_url: { url: video } }] }],
    }),
  });
  const body = await res.json().catch(() => null);
  const text = body?.choices?.[0]?.message?.content;
  if (!res.ok || typeof text !== "string" || !text.trim()) throw new Error(`Gemini could not watch the video: ${String(body?.error?.message ?? res.status).slice(0, 200)}`);
  return text.replace(/\s*[—–]\s*/g, ", ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const caller = await getUserClient(req);
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const jobId = typeof body?.jobId === "string" && /^[\w-]{4,80}$/.test(body.jobId) ? body.jobId : null;
  const blockId = typeof body?.blockId === "string" && /^[0-9a-f-]{36}$/i.test(body.blockId) ? body.blockId : null;
  if (!SOCIAL.test(url)) return jsonResponse({ error: "Paste a link to an Instagram, TikTok, X, Facebook or YouTube video" }, 400);

  // { action: "workshop", url, blockId }: Gemini watches the reel; the note gets a Workshop section (a placeholder at once).
  if (body?.action === "workshop") {
    if (!blockId) return jsonResponse({ error: "blockId required" }, 400);
    const { data: row } = await caller.client.from("archive_blocks").select("id, title, content").eq("id", blockId).maybeSingle();
    if (!row) return jsonResponse({ error: "Note not found" }, 404);
    await caller.client.from("archive_blocks").update({ content: withWorkshop(String(row.content ?? ""), WORKSHOP_PENDING) }).eq("id", blockId);
    const work = (async () => {
      let section: string;
      try {
        section = await runWorkshop(url, String(row.title ?? ""));
      } catch (e) {
        section = `_Workshop failed: ${e instanceof Error ? e.message : "something went wrong"}_`;
      }
      // Read again: the note may have been edited while Gemini watched.
      const { data: now } = await caller.client.from("archive_blocks").select("content").eq("id", blockId).maybeSingle();
      if (now) await caller.client.from("archive_blocks").update({ content: withWorkshop(String(now.content ?? ""), section) }).eq("id", blockId);
    })();
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return jsonResponse({ status: "started" });
  }

  // { url, blockId }: a note already saved (the phone app's Share) gets its transcript in the background.
  if (blockId) {
    const { data: row } = await caller.client.from("archive_blocks").select("id, content").eq("id", blockId).maybeSingle();
    if (!row) return jsonResponse({ error: "Note not found" }, 404);
    const work = (async () => {
      let r = await readVideo(url, null, caller.userId);
      for (let i = 0; "status" in r && r.status === "pending" && i < 60; i++) {
        await new Promise((ok) => setTimeout(ok, 3000));
        r = await readVideo(url, r.jobId, caller.userId);
      }
      if (!("status" in r) || r.status !== "done") { console.error("background transcript", JSON.stringify(r).slice(0, 300)); return; }
      const comment = String(row.content ?? "").replace(url, "").replace(/\n*Source: .*$/s, "").trim();
      await caller.client.from("archive_blocks").update({ title: r.note.title, content: noteContent(r.note, comment), source_url: url }).eq("id", blockId);
    })();
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return jsonResponse({ status: "started" });
  }

  const r = await readVideo(url, jobId, caller.userId);
  if ("error" in r) return jsonResponse({ error: r.error, code: r.code }, r.httpStatus);
  return jsonResponse(r);
});
