// Knowledge OS: transcribes one chunk of a recording (the PC tracker cuts
// MP3s into chunks of a few minutes at frame boundaries) with Whisper
// large-v3-turbo through OpenRouter, asking for segment timestamps
// (verbose_json). Returns the segments exactly as the model gave them;
// offsets are added on the PC when the chunks are joined.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserClient } from "../_shared/planner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODEL = Deno.env.get("KOS_TRANSCRIBE_MODEL") || "openai/whisper-large-v3-turbo";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!(await getUserClient(req))) return json({ error: "Unauthorized" }, 401);
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) throw new Error("OPENROUTER_API_KEY not configured");
    const { audio, format } = await req.json();
    // A chunk is a few minutes of MP3: well under 15 MB of base64.
    if (typeof audio !== "string" || !audio || audio.length > 20_000_000 || !["mp3", "wav", "m4a"].includes(String(format))) {
      return json({ error: "Missing or unsupported audio" }, 400);
    }
    const resp = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input_audio: { data: audio, format },
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
        temperature: 0,
      }),
    });
    const body = await resp.text();
    if (!resp.ok) {
      console.error("kos-transcribe:", resp.status, body.slice(0, 500));
      return json({ error: `Transcription failed (${resp.status})` }, 502);
    }
    const data = JSON.parse(body);
    const segments = Array.isArray(data.segments)
      ? data.segments.map((s: { start: number; end: number; text: string }) => ({ start: s.start, end: s.end, text: s.text }))
      : [];
    return json({ model: MODEL, text: String(data.text || ""), language: data.language ?? null, duration: data.duration ?? null, segments });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
