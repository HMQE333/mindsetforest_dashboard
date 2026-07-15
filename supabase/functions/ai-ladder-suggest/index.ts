import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { categoryId, categoryName, categoryTagline, currentTasks, aiMode, goal, constraints, focusLevels, tasksPerLevel, timeHorizon, projectName } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const levelNames = ["Foundation", "System", "Output", "Feedback", "Optimization", "Mastery"];

    const modePrompts: Record<string, string> = {
      focused: "Generate concrete, immediately actionable tasks that build skills progressively.",
      strategic: "Identify key growth areas and generate tasks that unlock the most mastery.",
      recovery: "Generate low-energy, approachable tasks. Easy wins that build momentum.",
    };

    const activeLevels: number[] = Array.isArray(focusLevels) && focusLevels.length > 0
      ? focusLevels.filter((l: number) => l >= 0 && l <= 5)
      : [0, 1, 2, 3, 4, 5];

    const taskCount = typeof tasksPerLevel === "number" && tasksPerLevel >= 1 && tasksPerLevel <= 4
      ? tasksPerLevel
      : 3;

    const existingStr = Object.entries(currentTasks || {})
      .map(([lvl, tasks]) => `Level ${lvl} (${levelNames[Number(lvl)]}): ${(tasks as string[]).join(", ") || "empty"}`)
      .join("\n");

    const levelsDescription = activeLevels
      .map(l => `${l}: ${levelNames[l]}`)
      .join("\n");

    // Build conditional prompt sections
    let extraContext = "";
    if (goal) {
      extraContext += `\nUSER GOAL: "${goal}". Align all generated tasks toward achieving this goal.\n`;
    }
    if (constraints) {
      extraContext += `\nUSER CONSTRAINTS: "${constraints}". Respect these constraints strictly when generating tasks.\n`;
    }
    if (timeHorizon === "week") {
      extraContext += "\nTIME HORIZON: Generate tasks suitable for completion within one week. Focus on quick, actionable items.\n";
    } else if (timeHorizon === "month") {
      extraContext += "\nTIME HORIZON: Generate tasks suitable for completion within one month. Balance quick wins with deeper skill-building.\n";
    } else if (timeHorizon === "longterm") {
      extraContext += "\nTIME HORIZON: Generate long-term tasks. Focus on deep investments, projects, and mastery-level commitments.\n";
    }

    const scopeDescription = projectName
      ? `the project "${projectName}". Generate tasks specifically relevant to this project, not a broad life category.`
      : `the "${categoryName}" category (${categoryTagline}).`;

    const systemPrompt = `You are a mastery progression AI. Generate task suggestions for ${scopeDescription}

Generate tasks ONLY for these levels:
${levelsDescription}

Level descriptions:
0: Foundation - Core basics and fundamentals
1: System - Building consistent processes
2: Output - Creating tangible results
3: Feedback - Getting and integrating feedback
4: Optimization - Refining and improving
5: Mastery - Teaching, leading, innovating

${modePrompts[aiMode] || modePrompts.focused}
${extraContext}
Current tasks the user already has:
${existingStr}

Avoid duplicating existing tasks. Generate exactly ${taskCount} NEW tasks per level.

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.

You MUST respond using the suggest_ladder tool.`;

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
          { role: "user", content: `Generate mastery ladder tasks for: ${projectName || categoryName}` },
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
                      tasks: { type: "array", items: { type: "string" }, description: `Exactly ${taskCount} task descriptions` },
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
        levels = (parsed.levels || []).filter((l: { level: number }) => activeLevels.includes(l.level));
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
