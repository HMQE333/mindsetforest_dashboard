import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, title, action } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const plainTextRule = "\n\nFORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, `, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.";

    const actionPrompts: Record<string, string> = {
      expand: "Deepen this insight — add actionable steps, connections to life pillars (mind, body, creation, exploration, networking, trading, spirit, order), and growth angles. Make it richer with practical wisdom the user can act on." + plainTextRule,
      shorten: "Distill to core actionable wisdom. Remove fluff, keep what moves the user forward. Every sentence should earn its place." + plainTextRule,
      summarize: "Extract the key takeaway and one clear next action. Be direct — what matters here and what should the user do about it?" + plainTextRule,
      organize: "Suggest the best pillar categories (from: mind, body, creation, exploration, networking, trading, spirit, order) and direction tags (from: direction, goals, wisdom, freedom, protection, creation, expression, community) for this note.",
    };

    const isOrganize = action === "organize";
    const tools = isOrganize
      ? [{
          type: "function" as const,
          function: {
            name: "suggest_tags",
            description: "Suggest tags for the note",
            parameters: {
              type: "object",
              properties: {
                pillars: { type: "array", items: { type: "string" } },
                directions: { type: "array", items: { type: "string" } },
                tags: { type: "array", items: { type: "string" } },
              },
              required: ["pillars", "directions"],
              additionalProperties: false,
            },
          },
        }]
      : [{
          type: "function" as const,
          function: {
            name: "transform_note",
            description: "Return the transformed note",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
              },
              required: ["title", "content"],
              additionalProperties: false,
            },
          },
        }];

    const toolChoice = isOrganize
      ? { type: "function" as const, function: { name: "suggest_tags" } }
      : { type: "function" as const, function: { name: "transform_note" } };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://mindsetforest.app", "X-Title": "MindsetForest", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: actionPrompts[action] || actionPrompts.expand },
          { role: "user", content: `Title: ${title}\n\nContent:\n${content}` },
        ],
        tools,
        tool_choice: toolChoice,
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
    let result = {};
    if (toolCall?.function?.arguments) {
      try { result = JSON.parse(toolCall.function.arguments); } catch { /* */ }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-archive-expand error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
