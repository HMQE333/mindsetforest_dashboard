import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const defaultSystemPrompt = `You clean and organize raw pasted notes, especially from Discord chat logs.

Rules:
1. Remove Discord message headers (patterns like "USERNAME — DD/MM/YYYY HH:MM" or "USERNAME -- DD/MM/YYYY HH:MM" or similar username + timestamp lines)
2. Remove link embed previews (auto-generated title + description that Discord shows below URLs) but KEEP the actual URLs
3. Remove empty messages that were just images (no text content)
4. Group related consecutive short messages into one note
5. Separate genuinely different topics with ---
6. For each separated item, add a content type tag at the start: [note], [link], [video], [code], [quote]
7. Clean up excessive whitespace and empty lines
8. Preserve the actual meaningful content — don't summarize or change wording
9. If a message is just a URL, keep it as a [link] item
10. YouTube/video URLs get tagged as [video]
11. If content looks like credentials or sensitive data (passwords, IPs, API keys), tag as [credentials]

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.

You MUST respond using the clean_text tool with the cleaned and separated text.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { rawText, customPrompt } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const systemPrompt = customPrompt
      ? `You process raw pasted text according to the user's instructions. Apply the instructions to the text and return the result using the clean_text tool.\n\nUser instructions: ${customPrompt}`
      : defaultSystemPrompt;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://mindsetforest.app", "X-Title": "MindsetForest",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: rawText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "clean_text",
            description: "Return the cleaned and organized text with --- separators between items",
            parameters: {
              type: "object",
              properties: {
                cleanedText: {
                  type: "string",
                  description: "The cleaned text with items separated by ---",
                },
              },
              required: ["cleanedText"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "clean_text" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let cleanedText = rawText;
    if (toolCall?.function?.arguments) {
      try {
        cleanedText = JSON.parse(toolCall.function.arguments).cleanedText || rawText;
      } catch { /* fallback to raw */ }
    }

    return new Response(JSON.stringify({ cleanedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-archive-clean error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
