import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { categoryId, categoryName, categoryTagline, currentTasks, aiMode } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const levelNames = ["Foundation", "System", "Output", "Feedback", "Optimization", "Mastery"];

    const modePrompts: Record<string, string> = {
      focused: "Generate concrete, immediately actionable tasks that build skills progressively.",
      strategic: "Identify key growth areas and generate tasks that unlock the most mastery.",
      recovery: "Generate low-energy, approachable tasks. Easy wins that build momentum.",
    };

    const existingStr = Object.entries(currentTasks || {})
      .map(([lvl, tasks]) => `Level ${lvl} (${levelNames[Number(lvl)]}): ${(tasks as string[]).join(", ") || "empty"}`)
      .join("\n");

    const systemPrompt = `You are a mastery progression AI. Generate task suggestions for the "${categoryName}" category (${categoryTagline}) across a 6-level ladder system.

The levels are:
0: Foundation - Core basics and fundamentals
1: System - Building consistent processes
2: Output - Creating tangible results
3: Feedback - Getting and integrating feedback
4: Optimization - Refining and improving
5: Mastery - Teaching, leading, innovating

${modePrompts[aiMode] || modePrompts.focused}

Current tasks the user already has:
${existingStr}

Avoid duplicating existing tasks. Generate 2-4 NEW tasks per level that make sense for each progression stage.

You MUST respond using the suggest_ladder tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate mastery ladder tasks for: ${categoryName}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_ladder",
            description: "Return task suggestions for each ladder level",
            parameters: {
              type: "object",
              properties: {
                levels: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      level: { type: "number", description: "Level 0-5" },
                      tasks: { type: "array", items: { type: "string" }, description: "2-4 task descriptions" },
                    },
                    required: ["level", "tasks"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["levels"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_ladder" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add AI credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let levels: Array<{ level: number; tasks: string[] }> = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        levels = parsed.levels || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ levels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-ladder-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
