import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { categoryId, categoryName, categoryTagline, currentMissions, aiMode, ladderContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const modePrompts: Record<string, string> = {
      focused: "Generate concrete, execution-first tasks. Each should be actionable within a single session.",
      strategic: "Identify bottleneck areas and generate tasks that unlock the most growth. Think about what's missing.",
      recovery: "Generate low-energy, low-friction tasks. Easy wins that build momentum without overwhelm.",
    };

    let ladderPrompt = "";
    if (ladderContext) {
      ladderPrompt = `\n\nIMPORTANT LADDER CONTEXT: The user is working on their "${ladderContext.activeCategory}" mastery ladder. They are currently at the "${ladderContext.currentLevel}" level. They have completed ${ladderContext.totalCompleted}/${ladderContext.totalTasks} total tasks. Completed tasks include: ${ladderContext.completedTasks?.join(", ") || "none"}.\n\nGenerate today's missions that specifically push the user toward completing their current ladder level. Align tasks with their progression stage.`;
    }

    const systemPrompt = `You are a gamified productivity AI. Generate 3-5 mission/task suggestions for the "${categoryName}" category (${categoryTagline}).

${modePrompts[aiMode] || modePrompts.focused}

Current tasks the user already has: ${currentMissions?.join(", ") || "none"}
Avoid duplicating existing tasks.${ladderPrompt}

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.

You MUST respond using the suggest_missions tool.`;

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
          { role: "user", content: `Generate mission suggestions for: ${categoryName} - ${categoryTagline}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_missions",
              description: "Return 3-5 mission suggestions",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        duration: { type: "string" },
                        xp: { type: "number" },
                        reason: { type: "string" },
                      },
                      required: ["title", "description", "duration", "xp"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["suggestions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_missions" } },
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
    let suggestions = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        suggestions = parsed.suggestions || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-mission-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
