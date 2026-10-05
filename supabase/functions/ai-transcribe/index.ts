// Transcribes recorded audio for the assistant: the microphone (dictation),
// voice mode (conversation) and voice notes in any text field.
//
// OpenRouter's /audio/transcriptions with TRANSCRIBE_MODEL, by default
// openai/gpt-4o-transcribe: compared on the same recordings it heard
// "Save in the archive" where Whisper turbo heard "Saving the archive", it
// detects the language by itself (Polish, English, both in one sentence), and
// it does not invent Whisper's "Thank you." on trailing silence. About
// $0.003 per minute of audio. Whisper turbo stays as the fallback when the
// main model fails.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserClient } from "../_shared/planner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = Deno.env.get("TRANSCRIBE_MODEL") || "openai/gpt-4o-transcribe";
const FALLBACK_MODEL = "openai/whisper-large-v3-turbo";
const FORMATS = ["webm", "wav", "mp3", "ogg", "m4a", "mp4", "mpeg", "flac", "aac"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function transcribe(key: string, model: string, audio: string, format: string, language?: string) {
  const resp = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // mp4 from Safari's recorder is an m4a container as far as the API is concerned.
      input_audio: { data: audio, format: format === "mp4" ? "m4a" : format },
      temperature: 0,
      ...(language ? { language } : {}),
    }),
  });
  if (!resp.ok) {
    console.error(`STT error (${model}):`, resp.status, (await resp.text()).slice(0, 500));
    return null;
  }
  const data = await resp.json();
  return typeof data?.text === "string" ? data.text.trim() : "";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) return json({ error: "Unauthorized" }, 401);
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) throw new Error("OPENROUTER_API_KEY not configured");

    const { audio, format, language } = await req.json();
    // About 15 MB of audio as base64: a long voice note, well under the API's limit.
    if (typeof audio !== "string" || !audio || audio.length > 20_000_000 || !FORMATS.includes(String(format))) {
      return json({ error: "Missing or unsupported audio (base64 webm/wav/mp3/ogg/m4a)" }, 400);
    }
    const lang = typeof language === "string" && /^[a-z]{2}$/.test(language) ? language : undefined;

    let model = MODEL;
    let text = await transcribe(key, MODEL, audio, String(format), lang);
    if (text === null && MODEL !== FALLBACK_MODEL) {
      model = FALLBACK_MODEL;
      text = await transcribe(key, FALLBACK_MODEL, audio, String(format), lang);
    }
    // The provider's reply stays in the logs; the client only needs to know it failed.
    if (text === null) throw new Error("Transcription failed");

    return json({ text, model });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
