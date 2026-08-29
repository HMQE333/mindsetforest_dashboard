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
 * Drafts the steps of a Path: an ordered route from where the user is now to
 * the aim they described. Replaces ai-ladder-suggest and ai-habit-loop-suggest,
 * which asked the model for six fixed levels or a chain of loops regardless of
 * whether the goal had that shape.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const pathName: string = body.pathName || "Untitled path";
    const categoryName: string | undefined = body.categoryName;
    const aim: string | undefined = body.aim;
    const existingSteps: string[] = Array.isArray(body.existingSteps) ? body.existingSteps : [];
    const moment: LocalMoment = body.moment || {};

    const { profile, situation } = await buildPlannerContext(auth.client, auth.userId, moment);

    const systemPrompt = `You design a path: an ordered route of concrete steps that takes someone from where they are now to a capability they want.

${profile}

RULES
${PLANNER_RULES}

PATH RULES
Order matters: each step should be doable given the ones before it, and the first step must be startable today.
A step is either done once, or repeated on separate days. Use "days" to say how many separate days a step needs - 1 means do it once. Use repetition only for things that genuinely need reps (drilling, practising, conditioning, writing daily); never to pad the path out.
Six to ten steps total. Fewer good steps beat a long ladder nobody climbs.
Use "stage" to group consecutive steps under a short label only when the path really has phases. Leave it out otherwise.
Do not restate the goal as a step, and do not add review or reflection steps unless the user asked for them.`;

    const userPrompt = [
      `Path: "${pathName}"${categoryName ? ` (life area: ${categoryName})` : ""}.`,
      aim ? `What good looks like, in the user's words: ${aim}` : "The user did not describe the target; infer a sensible one from the path name and their context.",
      existingSteps.length > 0
        ? `Steps already on this path (do not repeat these, continue from them): ${existingSteps.join("; ")}`
        : "The path is empty; design it from scratch.",
      "",
      "CURRENT SITUATION",
      situation,
    ].join("\n");

    const parsed = await callPlanner({
      systemPrompt,
      userPrompt,
      toolName: "draft_path",
      toolDescription: "Return the ordered steps of the path",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "The step, phrased as an action" },
                days: { type: "number", description: "Separate days this step needs. 1 = do it once" },
                xp: { type: "number" },
                stage: { type: "string", description: "Optional short phase label" },
                reason: { type: "string", description: "One line: why this step, here" },
              },
              required: ["title", "days", "xp"],
              additionalProperties: false,
            },
          },
        },
        required: ["steps"],
        additionalProperties: false,
      },
    });

    const steps = ((parsed.steps as Record<string, unknown>[]) || []).map((s) => ({
      title: String(s.title || "").slice(0, 200),
      days: Math.max(1, Math.min(365, Number(s.days) || 1)),
      xp: Math.max(5, Math.min(120, Number(s.xp) || 20)),
      stage: s.stage ? String(s.stage).slice(0, 60) : null,
      reason: s.reason ? String(s.reason).slice(0, 300) : undefined,
    })).filter((s) => s.title.length > 0);

    return jsonResponse({ steps });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("ai-path-suggest error:", message);
    const status = message.includes("Rate limit") ? 429 : message.includes("Payment") ? 402 : 500;
    return jsonResponse({ error: message }, status);
  }
});
