import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  jsonResponse,
  getUserClient,
  buildPlannerContext,
  callPlanner,
  PLANNER_RULES,
  LocalMoment,
} from "../_shared/planner.ts";

/**
 * Suggests today's missions for one category (or project).
 *
 * The old version was told a category name, a tagline, the titles of current
 * missions and a mode the user had to pick by hand. It now reads the user's
 * written context and their actual recent behaviour from the database, so
 * "focused / strategic / recovery" is something it infers rather than asks.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const categoryName: string = body.categoryName || "this area";
    const categoryTagline: string = body.categoryTagline || "";
    const projectName: string | undefined = body.projectName;
    const currentMissions: string[] = Array.isArray(body.currentMissions) ? body.currentMissions : [];
    const moment: LocalMoment = body.moment || {};
    // Kept as an override only: the client no longer asks for it up front.
    const aiMode: string | undefined = body.aiMode;

    const { profile, situation } = await buildPlannerContext(auth.client, auth.userId, moment);

    const scope = projectName
      ? `the user's own project "${projectName}"`
      : `the "${categoryName}" area of their life${categoryTagline ? ` (${categoryTagline})` : ""}`;

    const modeOverride: Record<string, string> = {
      focused: "The user explicitly asked for concrete execution work, whatever the situation suggests.",
      strategic: "The user explicitly asked for bottleneck-clearing work that unlocks progress, whatever the situation suggests.",
      recovery: "The user explicitly asked for low-energy, low-friction wins, whatever the situation suggests.",
    };

    const systemPrompt = `You plan a person's next few tasks in a gamified life dashboard. You are given their own description of themselves and a factual snapshot of their recent behaviour. Use both. Generic advice is a failure.

${profile}

RULES
${PLANNER_RULES}

CALIBRATION
Read the situation and pick the register yourself: if they are mid-streak with energy, push; if the day is late, they are behind, or their recovery numbers are poor, keep it small and winnable. Do not announce which register you picked.
${aiMode && modeOverride[aiMode] ? modeOverride[aiMode] : ""}

Return three to five suggestions.`;

    const userPrompt = [
      `Plan tasks for ${scope}.`,
      currentMissions.length > 0
        ? `Tasks already on this board (do not duplicate or reword): ${currentMissions.join("; ")}`
        : "This board is empty.",
      "",
      "CURRENT SITUATION",
      situation,
    ].join("\n");

    const parsed = await callPlanner({
      systemPrompt,
      userPrompt,
      toolName: "suggest_missions",
      toolDescription: "Return 3-5 mission suggestions",
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
                duration: { type: "string", description: "e.g. '20 min'" },
                xp: { type: "number" },
                reason: { type: "string", description: "One line tied to something concrete in the situation" },
              },
              required: ["title", "description", "duration", "xp"],
              additionalProperties: false,
            },
          },
        },
        required: ["suggestions"],
        additionalProperties: false,
      },
    });

    const suggestions = ((parsed.suggestions as Record<string, unknown>[]) || []).map((s) => ({
      title: String(s.title || "").slice(0, 200),
      description: String(s.description || "").slice(0, 500),
      duration: String(s.duration || "15 min").slice(0, 40),
      xp: Math.max(5, Math.min(120, Number(s.xp) || 20)),
      reason: s.reason ? String(s.reason).slice(0, 300) : undefined,
    })).filter((s) => s.title.length > 0);

    return jsonResponse({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("ai-mission-suggest error:", message);
    const status = message.includes("Rate limit") ? 429 : message.includes("Payment") ? 402 : 500;
    return jsonResponse({ error: message }, status);
  }
});
