import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { categoryName, categoryTagline, aiMode, goal, constraints, timeHorizon, projectName } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const modePrompts: Record<string, string> = {
      focused: "Generate concrete, immediately actionable habits that build progressively across loops.",
      strategic: "Identify key growth areas and generate habits that compound over time.",
      recovery: "Generate low-energy, approachable habits. Easy wins that build momentum gently.",
    };

    let extraContext = "";
    if (goal) extraContext += `\nUSER GOAL: "${goal}". Align all habits toward achieving this goal.\n`;
    if (constraints) extraContext += `\nUSER CONSTRAINTS: "${constraints}". Respect these constraints strictly.\n`;
    if (timeHorizon === "week") extraContext += "\nTIME HORIZON: Habits should be completable within minutes each day, suitable for a weekly cycle.\n";
    else if (timeHorizon === "month") extraContext += "\nTIME HORIZON: Habits can be moderate effort, suitable for a monthly progression.\n";
    else if (timeHorizon === "longterm") extraContext += "\nTIME HORIZON: Habits can be deeper commitments for long-term mastery.\n";

    const scopeDescription = projectName
      ? `the project "${projectName}". Generate habits specifically relevant to this project, not a broad life category.`
      : `the "${categoryName}" category (${categoryTagline}).`;

    const systemPrompt = `You are a habit-building AI. Generate 3 progressive habit loops for ${scopeDescription}

Each loop should have:
- A name (e.g. "Foundation", "Building", "Mastery")
- A repsRequired number (how many times each task must be completed before advancing)
- 3-5 habit tasks

Loop progression rules:
- Loop 1: Easy foundation habits, repsRequired = 7
- Loop 2: Slightly harder evolved habits, repsRequired = 14
- Loop 3: Advanced mastery habits, repsRequired = 21

Each subsequent loop should evolve the habits (longer duration, harder variation, deeper practice).

${modePrompts[aiMode] || modePrompts.focused}
${extraContext}

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.

You MUST respond using the suggest_loops tool.`;

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
          { role: "user", content: `Generate progressive habit loops for: ${projectName || categoryName}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_loops",
            description: "Return 3 progressive habit loop definitions",
            parameters: {
              type: "object",
              properties: {
                loops: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Loop name like Foundation, Building, Mastery" },
                      repsRequired: { type: "number", description: "Number of reps required per task (7, 14, or 21)" },
                      tasks: { type: "array", items: { type: "string" }, description: "3-5 habit descriptions" },
                    },
                    required: ["name", "repsRequired", "tasks"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["loops"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_loops" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Payment required" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let loops: Array<{ name: string; repsRequired: number; tasks: string[] }> = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        loops = parsed.loops || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ loops }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-habit-loop-suggest error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
