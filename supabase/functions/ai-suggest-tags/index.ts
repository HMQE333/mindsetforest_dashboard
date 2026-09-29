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
    const items: string[] | null = Array.isArray(body.items) ? body.items.slice(0, 100).map((t: unknown) => String(t ?? "").slice(0, 4_000)) : null;
    const existingTags: string[] = Array.isArray(body.existingTags) ? body.existingTags.map((t: unknown) => String(t).slice(0, 60)) : [];
    if (!Array.isArray(items) || items.length === 0) throw new Error("No items provided");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER" + "_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const vocab = Array.isArray(existingTags) && existingTags.length > 0
      ? `\n\nThe user's existing tag vocabulary (STRONGLY prefer reusing these when they fit, to keep the knowledge base consistent):\n${existingTags.slice(0, 200).join(", ")}`
      : "";

    const systemPrompt = `You suggest tags for notes in a personal knowledge base.

Rules:
1. For EACH numbered item, suggest 2-4 short tags capturing its topic, domain, and type
2. Tags are lowercase, single words or hyphenated (e.g. trading, self-improvement, threejs)
3. Prefer broad reusable ontological categories over one-off hyper-specific tags
4. Never invent near-duplicates of existing vocabulary (if "crypto" exists, don't add "cryptocurrency")
5. Skip tags already present as #hashtags inside the item
6. Return exactly one tag array per input item, in the same order${vocab}

You MUST respond using the suggest_tags tool.`;

    const numbered = items.map((it: string, i: number) => `[${i + 1}]\n${it}`).join("\n\n");

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
          { role: "user", content: numbered },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_tags",
            description: "Return suggested tags for each item, in input order",
            parameters: {
              type: "object",
              properties: {
                tags: {
                  type: "array",
                  description: "One array of tags per input item, same order as input",
                  items: { type: "array", items: { type: "string" } },
                },
              },
              required: ["tags"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_tags" } },
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
    let tags: string[][] = items.map(() => []);
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments).tags;
        if (Array.isArray(parsed)) {
          tags = items.map((_: string, i: number) => Array.isArray(parsed[i]) ? parsed[i].filter((t: unknown) => typeof t === "string") : []);
        }
      } catch { /* fall back to empty tags */ }
    }

    return new Response(JSON.stringify({ tags }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-suggest-tags error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});