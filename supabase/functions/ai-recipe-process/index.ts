import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { recipe, prompt } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const systemPrompt = `You are an expert chef and culinary assistant.
When given a recipe and a user request, transform the recipe accordingly and return a clean, well-structured result.

GENERAL RULES:
- Output plain text only. No markdown symbols like ###, **, \`, >, *.
- Structure with simple line breaks and dashes.
- Be precise with numbers and units.
- If asked to convert to grams, use standard conversions (e.g. 1 cup flour = 120g, 1 tbsp butter = 14g).
- If asked for temperatures, infer from cooking method and ingredients.
- If asked to scale portions, multiply all quantities proportionally.
- If the user prompt is vague or general, make the recipe clearer and more precise overall.

SIMPLIFY / CLEAN MODE — activate whenever the user asks to simplify, clean, restructure, or reduce cognitive load:
- STRIP completely: all tips ("Porada:", "Tip:", "Note:"), backstory, personal anecdotes, shopping advice, opinionated commentary, "you can also", "if you prefer", "alternatively", brand recommendations.
- ALTERNATIVES: when the recipe lists multiple options (e.g. "chicken or turkey", "mozzarella or cheddar"), pick the most common/best single option and use only that. Never present choices to the user.
- QUANTITIES: convert all measurements to grams using standard conversions. Do not use cups, tablespoons, handfuls, or vague terms.
- STEPS: each step is one action only. No explanations of why. No side notes. Maximum 15 words per step.
- OUTPUT FORMAT — use exactly this structure, nothing else:

RECIPE NAME (uppercase)

Ingredients

- Ingredient name: Xg
- Ingredient name: Xg

Instructions

1. Action.
2. Action.

- Single blank line between sections. No blank lines between ingredient list items. No blank lines between instruction steps.
- Do not add any text before the recipe name or after the last instruction.`;

    const userMessage = `Recipe:
${recipe}

User request: ${prompt}`;

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
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await response.text();
      throw new Error(`AI gateway error ${response.status}: ${txt}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-recipe-process error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
