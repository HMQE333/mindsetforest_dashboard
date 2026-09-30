import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserClient } from "../_shared/planner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    // Bounded: all of this goes to a paid model.
    const items: string[] = Array.isArray(body.items) ? body.items.slice(0, 50).map((t: unknown) => String(t ?? "").slice(0, 10_000)) : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ error: "No notes to organise" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const systemPrompt = `You are a knowledge organization AI. For each note provided:
1. Generate a concise, descriptive title
2. Suggest relevant pillar categories (only these ids: mind, body, expression, exploration, people, money, spirit, order)
3. Detect content type: note, link, video, code, quote, credentials
4. Detect any URLs in the content
5. Notes may have content type prefixes like [note], [link], [video] etc. — use these as hints but verify
6. Preserve the actual content without modification

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.

You MUST respond using the organize_notes tool.`;

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
          { role: "user", content: `Organize these ${items.length} notes:\n\n${items.map((t: string, i: number) => `--- Note ${i + 1} ---\n${t}`).join("\n\n")}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "organize_notes",
            description: "Return organized notes with titles and tags",
            parameters: {
              type: "object",
              properties: {
                blocks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      content: { type: "string" },
                      pillars: { type: "array", items: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } },
                      source_url: { type: "string" },
                      content_type: { type: "string", enum: ["note", "link", "video", "code", "quote", "credentials"] },
                    },
                    required: ["title", "content", "pillars"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["blocks"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "organize_notes" } },
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
    let blocks: any[] = [];
    if (toolCall?.function?.arguments) {
      try { blocks = JSON.parse(toolCall.function.arguments).blocks || []; } catch { /* */ }
    }

    return new Response(JSON.stringify({ blocks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-archive-process error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
