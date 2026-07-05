import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { message, history, context, scopes } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const scopeList = Array.isArray(scopes) && scopes.length > 0 ? scopes.join(", ") : "none";

    // The client injects the action-protocol instructions into `context` (so the
    // feature works against the already-deployed function without a redeploy).
    // If a future caller doesn't inject them, add a generic block here based on
    // the granted scopes. The sentinel prevents duplicating the instructions.
    const ctx = String(context || "");
    const hasActions = ctx.includes("[[ACTIONS_ENABLED]]");
    let actionBlock = "";
    if (!hasActions && Array.isArray(scopes)) {
      const canPlan = scopes.includes("planning");
      const canDash = scopes.includes("dashboard");
      if (canPlan || canDash) {
        const lines: string[] = [];
        if (canPlan) lines.push('- add_task: {"type":"add_task","title":string,"level"?:"goal"|"phase"|"task"|"action","deadline"?:"YYYY-MM-DD"}');
        if (canDash) lines.push('- add_mission: {"type":"add_mission","categoryId":string,"title":string,"description"?:string,"duration"?:string,"xp"?:number}');
        actionBlock = `\n\nYou can propose write actions ONLY when the user explicitly asks to create/add something. Nothing is saved until the user confirms. After a short normal reply, append one fenced block: \`\`\`action\n[ ...json array of actions... ]\n\`\`\`\nAvailable actions:\n${lines.join("\n")}`;
      }
    }

    const systemPrompt = `You are the in-app AI assistant for MindsetForest, a gamified life & productivity tracker ("Your Life. Your Quest."). You help the user reflect on and understand their own data.

Answer the user's question using ONLY the user data provided below. If the data does not contain the answer, say so plainly and suggest which section the user could enable in the context menu. Never invent numbers or facts that are not in the data. Be concise, warm, and specific — quote concrete numbers from the data when relevant.

The user has granted you access to these sections for this question: ${scopeList}.

=== USER DATA (only the sections the user allowed) ===
${context || "No data was shared for this question."}
=== END USER DATA ===
${actionBlock}

FORMATTING: Write in plain text only. Do not use markdown symbols like ###, **, \`, >, or *. Use simple line breaks and dashes (-) for structure. Keep it clean and readable as raw text. (The one exception is the \`\`\`action block described above, when applicable.)`;

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        if (h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string" && h.content.trim()) {
          messages.push({ role: h.role, content: h.content });
        }
      }
    }

    messages.push({ role: "user", content: String(message ?? "") });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        stream: true,
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

    // Stream the SSE body straight back to the client.
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("ai-assistant-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
