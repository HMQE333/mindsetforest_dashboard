import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserClient } from "../_shared/planner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOOL = {
  type: "function",
  function: {
    name: "extract_transactions",
    description:
      "Extract every transaction from the bank statement text. Dates as YYYY-MM-DD. Amounts as positive numbers. Type is 'income' for money received and 'expense' for money spent. Category must be one of the provided category names - pick the closest match, or 'Other' if none fit.",
    parameters: {
      type: "object",
      properties: {
        transactions: {
          type: "array",
          description: "All transactions found, in chronological order.",
          items: {
            type: "object",
            properties: {
              date: { type: "string", description: "YYYY-MM-DD" },
              title: { type: "string", description: "Short merchant/description" },
              amount: { type: "number", description: "Positive number" },
              type: { type: "string", enum: ["income", "expense"] },
              category: { type: "string", description: "One of the provided category names" },
            },
            required: ["date", "title", "amount", "type", "category"],
          },
        },
      },
      required: ["transactions"],
    },
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const { text } = body || {};
    const cats = (v: unknown) => (Array.isArray(v) ? v.slice(0, 100).map((c) => String(c).slice(0, 60)) : []);
    const expenseCategories = cats(body?.expenseCategories);
    const incomeCategories = cats(body?.incomeCategories);
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "No statement text provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const exp = Array.isArray(expenseCategories) && expenseCategories.length > 0
      ? expenseCategories.join(", ")
      : "Food, Transport, Entertainment, Bills, Health, Shopping, Education, Other";
    const inc = Array.isArray(incomeCategories) && incomeCategories.length > 0
      ? incomeCategories.join(", ")
      : "Salary, Freelance, Investment, Gift, Refund, Other";

    const system =
      "You parse bank statements and extract transactions. " +
      "Rules: dates normalized to YYYY-MM-DD; amounts always positive (sign is captured by type); " +
      "skip balance lines, running totals, and anything that is not a real transaction; " +
      `expense categories: ${exp}; income categories: ${inc}. ` +
      "Map each item to the single best category. Do not invent transactions.";

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://www.hmqe.org",
        "X-Title": "MindsetForest",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: text.slice(0, 60000) },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_transactions" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again in a minute." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText.slice(0, 300));
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let transactions: unknown[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(parsed?.transactions)) transactions = parsed.transactions;
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    const cleaned = transactions
      .map((t: any) => {
        const amount = Number(t?.amount);
        const type = t?.type === "income" ? "income" : "expense";
        return {
          date: typeof t?.date === "string" ? t.date.slice(0, 10) : "",
          title: typeof t?.title === "string" ? t.title.trim().slice(0, 200) : "",
          amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
          type,
          category: typeof t?.category === "string" ? t.category.trim().slice(0, 50) : "Other",
        };
      })
      .filter((t: any) => t.date && t.title && t.amount > 0);

    return new Response(
      JSON.stringify({ transactions: cleaned, count: cleaned.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-finance-import error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});