import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { notes, prompt, preset } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const notesText = notes.map((n: any, i: number) => `--- Note ${i + 1}: ${n.title} ---\n${n.content}`).join("\n\n");

    // Preset action prompts for quick actions
    const presetPrompts: Record<string, string> = {
      merge: "Merge these notes into a single cohesive block. Combine overlapping ideas, remove redundancy, and create a unified narrative. Keep all unique insights and actionable items. Output a single merged note.",
      summarize: "Create a concise summary that captures the key takeaways from all these notes. Focus on actionable wisdom and core insights. Structure it clearly.",
      themes: "Analyze these notes and identify common themes, patterns, and connections. Group related ideas together and highlight how they connect to personal growth.",
      action_plan: "Create a clear action plan from these notes. Extract all actionable items, prioritize them, and organize into next steps.",
      compare: "Compare and contrast the ideas in these notes. Highlight agreements, contradictions, complementary perspectives, and synthesis opportunities.",
    };

    const finalPrompt = preset && presetPrompts[preset] ? presetPrompts[preset] : prompt;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a life-system knowledge synthesis AI. Process the provided notes with a focus on personal growth, actionable wisdom, and clear structure. Return well-organized output." },
          { role: "user", content: `Here are ${notes.length} notes:\n\n${notesText}\n\nInstruction: ${finalPrompt}` },
        ],
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
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-archive-multi error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
