import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  getUserClient,
  buildPlannerContext,
  callPlanner,
  LocalMoment,
} from "../_shared/planner.ts";

/**
 * Questions for the daily / monthly review.
 *
 * The client sends the numbers it already shows on the summary screen; this
 * adds the user's written context and their recent answers, and asks for a
 * handful of pointed questions, each with ready-made answers in the user's
 * voice. The point is that the user never faces a blank page: they tap the
 * answer that fits, edit it, or dictate their own.
 */

interface RecentQA { period: string; kind: string; qa: { question: string; answer: string }[] }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const kind: "daily" | "monthly" = body.kind === "monthly" ? "monthly" : "daily";
    const period = String(body.period || "").slice(0, 10);
    const snapshot = JSON.stringify(body.snapshot ?? {}).slice(0, 12000);
    const moment: LocalMoment = body.moment || {};
    // This month's goals ("monthly focus"), set by the user in the monthly review.
    const focus: string[] = Array.isArray(body.focus)
      ? body.focus.filter((f: unknown): f is string => typeof f === "string" && f.trim() !== "").slice(0, 3).map((f: string) => f.trim().slice(0, 200))
      : [];
    // The client asks for a question about them now and then, not every morning.
    const mentionFocus = kind === "daily" && body.mentionFocus === true && focus.length > 0;

    const [{ profile, situation }, recentRes] = await Promise.all([
      buildPlannerContext(auth.client, auth.userId, moment),
      auth.client
        .from("reviews")
        .select("period,kind,qa")
        .eq("user_id", auth.userId)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(kind === "monthly" ? 31 : 5),
    ]);

    // Earlier answers let the model follow up ("you said X on Monday") and
    // stop it asking the same thing every morning. Missing table = no history.
    const recent = ((recentRes.data as RecentQA[] | null) || [])
      .filter((r) => r.period !== period)
      .map((r) => `${r.kind} ${r.period}:\n` + (r.qa || []).map((x) => `  Q: ${x.question}\n  A: ${x.answer}`).join("\n"))
      .join("\n");

    const count = kind === "monthly" ? 5 : 3;
    const systemPrompt = `You run a short ${kind === "monthly" ? "monthly" : "morning"} review for one person inside their life tracker. Your job is to help them build the habit of always knowing where their time and effort went.

Write in English, casual and direct (second person). The user may have answered earlier reviews in Polish and may answer these in Polish too: read those answers as they are and follow up on them, but still write in English. Plain text, no markdown, no emoji in questions. Never use em dashes.

Produce:
- headline: one sentence (max 20 words) naming the single most telling fact in the numbers, concrete, no praise inflation, no moralising.
- questions: exactly ${count}. Each question is short (max 16 words), about something specific in the numbers or in what the user said recently, and answerable in one sentence.${kind === "daily"
      ? " Cover: one question about where the time actually went (use the computer/app data when present), one about a win or a miss, and one forward-looking question about today."
      : " Cover: what got done this month (name concrete things from the data), where the time went, what did not happen that was planned, one pattern worth keeping or dropping, and what to carry into the new month. Do not ask for next month's goals: the review asks for them on its own last screen."}${mentionFocus
      ? " Today, make the forward-looking question about progress on one of this month's focus goals (named in the context), the one the numbers say least about."
      : ""}
- For every question 2-4 suggestions: plausible answers IN THE USER'S VOICE (first person), max 10 words each, grounded in the data, different from each other; at least one may be the honest uncomfortable answer. The user taps one instead of writing from scratch, so make them specific, not generic ("Rest" is too vague; "YouTube in the evening instead of training" is right).

If the numbers are thin (little data), ask about what the data cannot show instead of inventing numbers. Never invent facts that are not in the numbers or the context.`;

    const userPrompt = `Period under review: ${kind} ${period}

${profile}

${situation}
${focus.length ? `\nTHIS MONTH'S FOCUS (the user's own goals, most important first):\n${focus.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n` : ""}
NUMBERS SHOWN ON THE SUMMARY SCREEN (JSON):
${snapshot}

${recent ? `RECENT REVIEW ANSWERS (do not repeat these questions; follow up where it helps):\n${recent}` : "No earlier reviews yet."}`;

    const parsed = await callPlanner({
      systemPrompt,
      userPrompt,
      toolName: "review_questions",
      toolDescription: "Return the headline and the review questions with suggested answers",
      parameters: {
        type: "object",
        properties: {
          headline: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                suggestions: { type: "array", items: { type: "string" } },
              },
              required: ["question", "suggestions"],
              additionalProperties: false,
            },
          },
        },
        required: ["headline", "questions"],
        additionalProperties: false,
      },
    });

    const questions = ((parsed.questions as Record<string, unknown>[]) || [])
      .map((q, i) => ({
        id: `q${i + 1}`,
        question: String(q.question || "").trim().slice(0, 200),
        suggestions: (Array.isArray(q.suggestions) ? q.suggestions : [])
          .map((s) => String(s || "").trim().slice(0, 120))
          .filter(Boolean)
          .slice(0, 4),
      }))
      .filter((q) => q.question)
      .slice(0, count);

    return jsonResponse({ headline: String(parsed.headline || "").trim().slice(0, 240), questions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("ai-review error:", message);
    const status = message.includes("Rate limit") ? 429 : message.includes("Payment") ? 402 : 500;
    return jsonResponse({ error: message }, status);
  }
});
