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
 * Secrets:
 *   ELEVENLABS_API_KEY   required for this function to do anything
 *   ELEVENLABS_VOICE_ID  default EXAVITQu4vr4xnSDxMaL ("Sarah", multilingual)
 *   ELEVENLABS_MODEL     default eleven_flash_v2_5 (fast, 32 languages incl. Polish;
 *                        eleven_multilingual_v2 for higher quality at 2x credits)
 */

const MAX_CHARS = 1500;
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";
const DEFAULT_MODEL = "eleven_flash_v2_5";

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

    const body = (await req.json().catch(() => ({}))) as { text?: unknown; lang?: unknown };
    const text = String(body.text ?? "").trim().slice(0, MAX_CHARS);
    if (!text) return jsonResponse({ error: "text required" }, 400);

    const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE;
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
