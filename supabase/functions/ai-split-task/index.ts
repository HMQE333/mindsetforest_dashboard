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
    const title = String(body.title ?? "").slice(0, 300);
    const description = String(body.description ?? "").slice(0, 3_000);
    const duration = String(body.duration ?? "").slice(0, 60);
    // A task without XP still splits (NaN used to reach the prompt).
    const xp = Math.min(500, Math.max(3, Math.round(Number(body.xp) || 20)));
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const perTaskXP = Math.max(1, Math.round(xp / 3));

    const systemPrompt = `You are a productivity AI that breaks overwhelming tasks into 3 smaller, immediately actionable micro-tasks. Each micro-task should:
- Take less time than the original
- Feel easy to start (low activation energy)
- Be concrete and specific

Example: "Train for 1h" (40 XP) becomes:
1. "Get training clothes ready" (13 XP, 5 min)
2. "Play your workout playlist" (13 XP, 2 min)  
3. "Start first 20 min of training" (14 XP, 20 min)

Distribute ~${perTaskXP} XP per sub-task (total should equal ${xp}).

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text.

You MUST respond using the split_task tool.`;

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
          { role: "user", content: `Split this task into 3 micro-tasks:\nTitle: ${title}\nDescription: ${description}\nDuration: ${duration}\nXP: ${xp}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "split_task",
              description: "Return exactly 3 micro-tasks that replace the original task",
              parameters: {
                type: "object",
                properties: {
                  subtasks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        duration: { type: "string" },
                        xp: { type: "number" },
                      },
                      required: ["title", "description", "duration", "xp"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["subtasks"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "split_task" } },
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
    let subtasks = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        // Three micro-tasks with sane XP, whatever the model returned.
        subtasks = (Array.isArray(parsed.subtasks) ? parsed.subtasks : []).slice(0, 3).map((t: Record<string, unknown>) => ({
          ...t,
          xp: Math.min(120, Math.max(5, Math.round(Number(t.xp) || perTaskXP))),
        }));
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ subtasks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-split-task error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
