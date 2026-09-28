// Recovered from the deployed bundle on the production project (v3).
// Transcribes recorded audio for the assistant microphone via OpenRouter Whisper.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) {
      throw new Error("OPENROUTER_API_KEY not configured");
    }

    const { audio, format, language } = await req.json();
    if (!audio || !format) {
      throw new Error("Missing audio (base64) or format (webm/wav/mp3)");
    }

    const orResp = await fetch(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/whisper-large-v3-turbo",
          input_audio: { data: audio, format: format },
          ...(language ? { language } : {}),
        }),
      },
    );

    if (!orResp.ok) {
      const errText = await orResp.text();
      console.error("OpenRouter STT error:", orResp.status, errText);
      throw new Error(
        "Transcription failed (" + orResp.status + "). " + errText.slice(0, 200),
      );
    }

    const data = await orResp.json();
    const text = data && data.text ? String(data.text) : "";

    return new Response(
      JSON.stringify({ text: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
