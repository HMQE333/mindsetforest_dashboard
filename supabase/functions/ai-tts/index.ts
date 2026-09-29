import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, getUserClient } from "../_shared/planner.ts";

/**
 * Text-to-speech for the assistant's voice mode via ElevenLabs.
 *
 * Returns MP3 audio for a short reply. When ELEVENLABS_API_KEY is not set the
 * function answers 501 and the client falls back to the browser's own voice,
 * so the app never depends on the key being present.
 *
 * `mode: "voices"` lists the voices on the account (premade + cloned) so the
 * user can pick one; the choice travels with each request as `voice`.
 *
 * Secrets:
 *   ELEVENLABS_API_KEY   required for this function to do anything
 *   ELEVENLABS_VOICE_ID  default voice when the user picked none; otherwise the
 *                        first male voice on the account, else "George"
 *   ELEVENLABS_MODEL     default eleven_flash_v2_5 (fast, 32 languages incl. Polish;
 *                        eleven_multilingual_v2 for higher quality at 2x credits)
 */

const MAX_CHARS = 1500;
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George (male, multilingual premade)
const DEFAULT_MODEL = "eleven_flash_v2_5";
const VOICE_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

interface Voice {
  id: string;
  name: string;
  gender: string | null;
  accent: string | null;
  description: string | null;
  category: string | null;
  preview: string | null;
}

let voiceCache: { at: number; voices: Voice[] } | null = null;

/** Voices on the account, cached per isolate for ten minutes. */
async function listVoices(apiKey: string): Promise<Voice[]> {
  if (voiceCache && Date.now() - voiceCache.at < 10 * 60 * 1000) return voiceCache.voices;
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey } });
  if (!res.ok) throw new Error(`voices ${res.status}`);
  const data = await res.json();
  const voices: Voice[] = (Array.isArray(data?.voices) ? data.voices : [])
    .filter((v: Record<string, unknown>) => typeof v.voice_id === "string" && typeof v.name === "string")
    .map((v: Record<string, unknown>) => {
      const labels = (v.labels && typeof v.labels === "object" ? v.labels : {}) as Record<string, unknown>;
      return {
        id: v.voice_id as string,
        name: v.name as string,
        gender: typeof labels.gender === "string" ? labels.gender : null,
        accent: typeof labels.accent === "string" ? labels.accent : null,
        description: typeof labels.description === "string" ? labels.description : null,
        category: typeof v.category === "string" ? v.category : null,
        preview: typeof v.preview_url === "string" ? v.preview_url : null,
      };
    })
    .sort((a: Voice, b: Voice) => a.name.localeCompare(b.name));
  voiceCache = { at: Date.now(), voices };
  return voices;
}

async function defaultVoice(apiKey: string): Promise<string> {
  const fromEnv = Deno.env.get("ELEVENLABS_VOICE_ID");
  if (fromEnv) return fromEnv;
  try {
    const voices = await listVoices(apiKey);
    const male = voices.find((v) => v.gender === "male");
    if (male) return male.id;
  } catch { /* fall through */ }
  return DEFAULT_VOICE;
}

async function logUsage(userId: string, model: string, chars: number) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    // ElevenLabs bills characters on its own plan; cost stays 0 here and the
    // character count is kept so Settings can show how much voice is used.
    await admin.from("ai_usage_log").insert({
      user_id: userId,
      feature: "assistant-tts",
      model: `elevenlabs/${model}`,
      prompt_tokens: chars,
      completion_tokens: 0,
      cost_usd: 0,
    });
  } catch (e) {
    console.error("ai_usage_log insert failed:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) return jsonResponse({ error: "tts_not_configured" }, 501);

    const body = (await req.json().catch(() => ({}))) as { mode?: unknown; text?: unknown; lang?: unknown; voice?: unknown };

    if (body.mode === "voices") {
      try {
        return jsonResponse({ voices: await listVoices(apiKey), defaultVoice: await defaultVoice(apiKey) });
      } catch (e) {
        console.error("ElevenLabs voices error:", e);
        return jsonResponse({ error: "voices_failed" }, 502);
      }
    }

    const text = String(body.text ?? "").trim().slice(0, MAX_CHARS);
    if (!text) return jsonResponse({ error: "text required" }, 400);

    const requested = typeof body.voice === "string" && VOICE_ID_RE.test(body.voice) ? body.voice : null;
    const voiceId = requested || (await defaultVoice(apiKey));
    const modelId = Deno.env.get("ELEVENLABS_MODEL") || DEFAULT_MODEL;
    const lang = String(body.lang ?? "").toLowerCase();
    // language_code is accepted by the flash / turbo v2.5 models only.
    const languageCode = /flash|turbo/.test(modelId) ? (lang.startsWith("pl") ? "pl" : lang.startsWith("en") ? "en" : undefined) : undefined;

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        ...(languageCode ? { language_code: languageCode } : {}),
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      console.error("ElevenLabs error:", res.status, detail.slice(0, 300));
      return jsonResponse({ error: "tts_failed", status: res.status }, 502);
    }

    // Await the log so the isolate is not torn down before the row lands.
    await logUsage(auth.userId, modelId, text.length);

    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("ai-tts error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
