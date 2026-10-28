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

interface Found { transcript: string; caption: string; author: string | null; title: string; coverUrl?: string; platform: string; via: string }

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
    return { transcript, caption, author: it.ownerUsername ?? it.ownerFullName ?? null, title: "", coverUrl: it.displayUrl, platform: "instagram", via: "apify" };
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const caller = await getUserClient(req);
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const jobId = typeof body?.jobId === "string" && /^[\w-]{4,80}$/.test(body.jobId) ? body.jobId : null;
  if (!SOCIAL.test(url)) return jsonResponse({ error: "Paste a link to an Instagram, TikTok, X, Facebook or YouTube video" }, 400);

  // 1. Instagram through Apify and our own speech model (cheapest); 2. Supadata for the rest, or when that fails.
  if (!jobId) {
    const found = await viaApify(url);
    if (found) {
      const [summary, cover] = await Promise.all([summarize(found.transcript, found.caption), copyCover(found.coverUrl, caller.userId)]);
      return jsonResponse({
        status: "done",
        note: { url, platform: found.platform, author: found.author, title: summary?.title || found.caption.split("\n")[0].slice(0, 100) || "Saved video", points: summary?.points ?? [], transcript: found.transcript, caption: found.caption, cover, lang: "", duration: null, via: found.via },
      });
    }
  }
  const key = Deno.env.get("SUPADATA_API_KEY");
  if (!key) return jsonResponse({ error: "The video could not be read (no fallback service set up)" }, 502);

  let transcript = "";
  let lang = "";
  if (jobId) {
    const r = await supa(`/transcript/${jobId}`, key);
    if (r.body?.status === "queued" || r.body?.status === "active") return jsonResponse({ status: "pending", jobId });
    if (r.body?.status !== "completed") return jsonResponse({ error: r.body?.error?.message || "The transcript could not be made" }, 502);
    const c = r.body.result?.content ?? r.body.content;
    transcript = typeof c === "string" ? c : Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? "").join(" ") : "";
    lang = r.body.result?.lang ?? r.body.lang ?? "";
  } else {
    const r = await supa(`/transcript?url=${encodeURIComponent(url)}&text=true&mode=auto`, key);
    if (r.status === 202 || r.body?.jobId) return jsonResponse({ status: "pending", jobId: r.body.jobId });
    if (r.status === 206) transcript = "";
    else if (r.status !== 200) {
      const msg = r.status === 429 || r.status === 402 ? "The transcript service's limit is used up" : r.body?.message || "The transcript could not be made";
      return jsonResponse({ error: msg, code: r.body?.error }, 502);
    } else {
      transcript = typeof r.body.content === "string" ? r.body.content : "";
      lang = r.body.lang ?? "";
    }
  }

  const meta = (await supa(`/metadata?url=${encodeURIComponent(url)}`, key)).body ?? {};
  const caption = String(meta.description ?? meta.title ?? "").trim();
  const [summary, cover] = await Promise.all([summarize(transcript, caption), copyCover(meta.media?.thumbnailUrl, caller.userId)]);

  return jsonResponse({
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
  });
});
