import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Resolves the OpenRouter model from the user's settings switch.
 * "sonnet" and "gpt" are the two choices the app exposes; each has an env
 * override so the exact model can be changed without a redeploy.
 */
function resolveModel(choice: unknown): string {
  if (choice === "gpt") return Deno.env.get("OPENROUTER_MODEL_GPT") || "openai/gpt-5";
  if (choice === "sonnet") return Deno.env.get("OPENROUTER_MODEL_SONNET") || "anthropic/claude-sonnet-5";
  return Deno.env.get("OPENROUTER_MODEL_PLANNING") || Deno.env.get("OPENROUTER_MODEL_SONNET") || "anthropic/claude-sonnet-5";
}

/** Pulls the first JSON object out of a model reply, tolerating code fences. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(body.slice(start, end + 1));
}

const PLAN_SHAPE = `{
  "title": string,
  "goal": string,
  "horizon": string,
  "assumptions": string[],
  "decisions": [{ "question": string, "choice": string, "why": string }],
  "risks": string[],
  "phases": [{
    "title": string,
    "summary": string,
    "blocks": [
      { "kind": "step", "title": string, "detail": string, "output": string, "estimateMinutes": number, "energy": "low"|"medium"|"high" },
      { "kind": "loop", "title": string, "repeat": string, "exit": string, "steps": [ { "kind": "step", ... } ] }
    ]
  }]
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brief, title, context, boardName, modelChoice, targetSteps, regenerate, previousTitles } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const model = resolveModel(modelChoice);

    const stepTarget = typeof targetSteps === "number" && targetSteps >= 20 && targetSteps <= 200
      ? Math.round(targetSteps)
      : 80;

    const systemPrompt = `You are the simulation engine of MindsetForest, a life & productivity app.

The user hands you a project. You do NOT return advice, options, or a discussion. You return a SIMULATION: the whole project as if it had already been planned and every decision along the way had already been made — a walk through possibility-space the user can read top to bottom and simply execute.

Hard rules:
- Make every decision yourself. Never write "decide whether", "consider", "research options", "figure out" as a step. Pick, then state the pick in "decisions" with a one-line reason.
- Aim for about ${stepTarget} concrete steps in total. Big projects must be split this finely; a step is one sitting of work with a visible result.
- Anything that repeats becomes a LOOP block instead of ${stepTarget} copies: give it a "repeat" (e.g. "12 times, one per week") and an "exit" condition. Use loops for practice cycles, weekly reviews, per-item passes, iteration until a bar is met.
- Every step needs a concrete "output": what exists in the world once it is done.
- Order phases so each one unblocks the next. 4-8 phases.
- Estimates in minutes, realistic for one person. Energy tags reflect cognitive load.
- Ground the plan in the user's real context when it is provided (their categories, projects, tools, constraints). Never invent facts about the user.

Return ONLY JSON, no prose, no markdown fences, matching exactly:
${PLAN_SHAPE}`;

    const parts: string[] = [];
    parts.push(`PROJECT BRIEF:\n${String(brief || title || "Untitled project")}`);
    if (title) parts.push(`WORKING TITLE: ${title}`);
    if (boardName) parts.push(`PLANNING BOARD: ${boardName}`);
    if (context) parts.push(`=== USER CONTEXT (real data from their dashboard; may be partial) ===\n${context}\n=== END USER CONTEXT ===`);
    if (regenerate) {
      parts.push(
        "This is a REGENERATION: the user wants a different walk through the same possibility space. Keep the goal identical, but make materially different decisions about sequencing, tooling and scope — not a reworded copy." +
          (Array.isArray(previousTitles) && previousTitles.length > 0
            ? `\nPhases used last time (do not simply repeat them): ${previousTitles.slice(0, 20).join("; ")}`
            : ""),
      );
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://mindsetforest.app",
        "X-Title": "MindsetForest",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: parts.join("\n\n") },
        ],
        temperature: regenerate ? 0.9 : 0.6,
        max_tokens: 16000,
        response_format: { type: "json_object" },
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
      console.error("AI gateway error:", status, await response.text());
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const plan = extractJson(String(text));

    return new Response(JSON.stringify({ plan, model }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-plan-simulate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
