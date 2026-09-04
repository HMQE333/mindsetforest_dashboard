import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function resolveModel(choice: unknown): string {
  if (choice === "gpt") return Deno.env.get("OPENROUTER_MODEL_GPT") || "openai/gpt-5";
  if (choice === "sonnet") return Deno.env.get("OPENROUTER_MODEL_SONNET") || "anthropic/claude-sonnet-5";
  return Deno.env.get("OPENROUTER_MODEL_PLANNING") || Deno.env.get("OPENROUTER_MODEL_SONNET") || "anthropic/claude-sonnet-5";
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(body.slice(start, end + 1));
}

interface ChatMessage { role: string; content: string }

async function callModel(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://mindsetforest.app",
      "X-Title": "MindsetForest",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 4000,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!response.ok) {
    const status = response.status;
    const body = await response.text();
    console.error("AI gateway error:", status, body);
    const err = new Error(status === 429
      ? "Rate limit exceeded, please try again later."
      : status === 402
        ? "Payment required. Please add AI credits."
        : "AI gateway error") as Error & { status?: number };
    err.status = status === 429 || status === 402 ? status : 500;
    throw err;
  }
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content ?? "");
}

const OPS_SPEC = `Available operations (ids come from the plan outline; every op must name ids that exist):
- {"type":"update_meta","title"?:string,"goal"?:string,"horizon"?:string,"assumptions"?:string[],"risks"?:string[]}
- {"type":"set_decision","id"?:string,"question":string,"choice":string,"why"?:string}
- {"type":"delete_decision","id":string}
- {"type":"insert_phase","index"?:number,"phase":{"title":string,"summary"?:string,"blocks"?:[...]}}
- {"type":"update_phase","id":string,"title"?:string,"summary"?:string}
- {"type":"move_phase","id":string,"toIndex":number}
- {"type":"delete_phase","id":string}
- {"type":"insert_block","phaseId"?:string,"loopId"?:string,"index"?:number,"block":{"kind":"step"|"loop","title":string,"detail"?:string,"output"?:string,"estimateMinutes"?:number,"energy"?:"low"|"medium"|"high","repeat"?:string,"exit"?:string,"steps"?:[...]}}
- {"type":"update_block","id":string,"title"?:string,"detail"?:string,"output"?:string,"estimateMinutes"?:number,"energy"?:string,"repeat"?:string,"exit"?:string}
- {"type":"move_block","id":string,"toPhaseId"?:string,"toLoopId"?:string,"toIndex":number}
- {"type":"delete_block","id":string}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, history, planOutline, context, modelChoice, allowEdits } = await req.json();
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const model = resolveModel(modelChoice);

    const userMessage = String(message ?? "").slice(0, 8000);
    const outline = String(planOutline ?? "(no plan yet)");
    const ctx = String(context ?? "");

    const priorTurns: ChatMessage[] = Array.isArray(history)
      ? history
          .slice(-8)
          .filter((h: ChatMessage) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string" && h.content.trim())
          .map((h: ChatMessage) => ({ role: h.role, content: h.content.slice(0, 4000) }))
      : [];

    /* ---- Pass 1: research ------------------------------------------------ */
    // The assistant reads the plan and the user's own data before it touches
    // anything. These notes are shown in the UI and fed into pass 2.
    const researchSystem = `You are the research pass of the MindsetForest plan assistant.

Do NOT answer the user yet and do NOT propose changes. Investigate first, using ONLY the plan and the user context below, and write short research notes (max 12 short lines, plain text, dashes for bullets) covering:
- which specific steps, loops or phases the request touches (quote their ids)
- what the current plan already says about it
- what in the user's real data is relevant (only if the data supports it)
- constraints, ordering dependencies or risks the change would hit
- anything the plan is missing that the request implies

Never invent facts about the user. If the context is thin, say what you do not know.

=== PLAN OUTLINE ===
${outline}
=== END PLAN ===

=== USER CONTEXT ===
${ctx || "(the user shared no dashboard data for this question)"}
=== END USER CONTEXT ===`;

    const research = await callModel(
      OPENROUTER_API_KEY,
      model,
      [
        { role: "system", content: researchSystem },
        ...priorTurns,
        { role: "user", content: `The user just asked:\n"${userMessage}"\n\nWrite the research notes.` },
      ],
      { maxTokens: 1200, temperature: 0.3 },
    );

    /* ---- Pass 2: answer + surgical edit operations ------------------------ */
    const editingRules = allowEdits === false
      ? `Editing is turned off for this message: return an empty "ops" array and answer in prose.`
      : `If (and only if) the user asked for a change, return the smallest set of operations that makes it. Move and edit individual steps — never rebuild the plan. Do not delete a phase to re-add it. Do not touch anything the user did not ask about. If the request is a question, return an empty "ops" array.

${OPS_SPEC}`;

    const answerSystem = `You are the MindsetForest plan assistant. You edit ONE simulation: a whole project laid out as concrete steps and repeated loops with every decision already made.

${editingRules}

Style: plain text, no markdown symbols, short. Say what you changed and why in one or two sentences; the user sees the exact diff separately, so do not list every op.

Never invent facts about the user's habits or history. Nothing you propose is saved until the user approves it.

=== PLAN OUTLINE ===
${outline}
=== END PLAN ===

=== USER CONTEXT ===
${ctx || "(the user shared no dashboard data for this question)"}
=== END USER CONTEXT ===

=== YOUR RESEARCH NOTES ===
${research}
=== END NOTES ===

Return ONLY JSON: {"reply": string, "ops": [ ...operations... ]}`;

    const raw = await callModel(
      OPENROUTER_API_KEY,
      model,
      [
        { role: "system", content: answerSystem },
        ...priorTurns,
        { role: "user", content: userMessage },
      ],
      { json: true, maxTokens: 8000, temperature: 0.3 },
    );

    const parsed = extractJson(raw) as { reply?: unknown; ops?: unknown };
    const ops = Array.isArray(parsed.ops) ? parsed.ops : [];

    return new Response(
      JSON.stringify({
        research: research.trim(),
        reply: typeof parsed.reply === "string" ? parsed.reply : "",
        ops,
        model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    console.error("ai-plan-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
