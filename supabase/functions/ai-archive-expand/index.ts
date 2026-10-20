import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";
import { CREDENTIAL_REFUSAL, EMPTY_ANSWER_MESSAGE, NO_KEY_MESSAGE, providerErrorMessage, providerErrorStatus } from "../_shared/ai-errors.ts";
import { looksLikeCredential } from "../_shared/archive-tags.ts";
import { MAX_ADDITIONS, insertAdditions, numberedParagraphs, paragraphRanges, validAdditions } from "../_shared/archive-expand.ts";

/**
 * AI actions on one Archive note. Each has borders, stated in the app
 * (src/lib/archive-ai.ts, AI_ACTIONS) and enforced here:
 *
 * - shorten: same meaning and language; every link, number, name, date and
 *   #tag kept; repetition and filler removed; nothing added.
 * - expand: his text is never sent back by the model at all. The model names
 *   where an explanation goes and what it says; the note is put together here
 *   (../_shared/archive-expand.ts), every addition a marked block "> 💡 AI: …".
 * - summarize, organize: kept for older clients (the app no longer offers them
 *   on a single note; Organize became "Suggest tags", ai-suggest-tags).
 *
 * Markdown is kept. A note longer than the limit is refused, not cut: a cut
 * note coming back as a "shortened" one would lose the rest. A note that looks
 * like it holds a password or a key is refused (422), all of it read.
 * Request { content, title?, action }; answer { title, content, additions? } or { error }.
 */

const LIMIT = 30_000;

const SHARED_RULES = `
- Write in the note's own language. A Polish note stays Polish (with its diacritics), an English one English, a mix stays a mix.
- Keep the note's Markdown (lists, links, bold, code). Do not add headings that were not there.
- Do not invent facts, numbers, names, quotes or sources.`;

const PROMPTS: Record<string, string> = {
  shorten: `You shorten the user's own note. Borders, all of them, always:
- Same meaning. Remove only repetition, filler and padding.
- Keep EVERY link (URL) exactly as written, every number, name and date, and every #tag.
- Never add anything: no new facts, advice, examples, opinions or conclusions.
- If the note is already short, return it almost unchanged.${SHARED_RULES}
Return the result with the transform_note tool: content is the shortened note; title only if the note has a title line of its own, else the title you were given.`,
  expand: `You add short explanations to the user's own note. You never rewrite it: the app inserts what you return as separate, clearly marked blocks after the paragraph you name, and his text stays exactly as it is.
The note comes as numbered paragraphs [1], [2], ...
Borders:
- Return at most ${MAX_ADDITIONS} additions with the add_explanations tool, usually 1-3. Each one has "after" (the paragraph number it follows) and "text".
- An addition explains a term, gives context or a concrete example, names a next step, or links two ideas of the note. It never repeats, rephrases, corrects or contradicts the paragraph.
- Each addition is short: at most about 80 words, plain sentences or a short list.
- If you are not sure of a fact, leave it out. If the note is only links or there is nothing useful to add, return an empty list.${SHARED_RULES}`,
  summarize: `Extract the key takeaway of the user's note and, if there is one, the next action it implies. Keep the links that matter exactly as written.${SHARED_RULES}
Return it with the transform_note tool.`,
  organize: "Suggest the best pillar categories (only these ids: mind, body, expression, exploration, people, money, spirit, order) and a few short lowercase topic tags for this note.",
};

const TRANSFORM_TOOL = {
  type: "function" as const,
  function: {
    name: "transform_note",
    description: "Return the transformed note",
    parameters: {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" } },
      required: ["content"],
      additionalProperties: false,
    },
  },
};

const EXPAND_TOOL = {
  type: "function" as const,
  function: {
    name: "add_explanations",
    description: "The explanations to insert after the note's paragraphs",
    parameters: {
      type: "object",
      properties: {
        additions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              after: { type: "integer", description: "The paragraph number the explanation follows" },
              text: { type: "string", description: "The explanation, in the note's language" },
            },
            required: ["after", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["additions"],
      additionalProperties: false,
    },
  },
};

const ORGANIZE_TOOL = {
  type: "function" as const,
  function: {
    name: "suggest_tags",
    description: "Suggest tags for the note",
    parameters: {
      type: "object",
      properties: {
        pillars: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["pillars"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const content = String(body.content ?? "");
    const title = String(body.title ?? "").slice(0, 300);
    const action = String(body.action ?? "");
    if (!PROMPTS[action]) return jsonResponse({ error: `Unknown action "${action}"` }, 400);
    if (!content.trim()) return jsonResponse({ error: "The note is empty" }, 400);
    if (content.length > LIMIT) {
      return jsonResponse({ error: `The note is too long for this action (${content.length} characters; the limit is ${LIMIT}).` }, 413);
    }
    if (looksLikeCredential(`${title}\n\n${content}`)) return jsonResponse({ error: CREDENTIAL_REFUSAL }, 422);
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) return jsonResponse({ error: NO_KEY_MESSAGE }, 503);
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const isExpand = action === "expand";
    const tool = isExpand ? EXPAND_TOOL : action === "organize" ? ORGANIZE_TOOL : TRANSFORM_TOOL;
    const userContent = isExpand
      ? `Title: ${title}\n\nThe note, by paragraph:\n\n${numberedParagraphs(content)}`
      : `Title: ${title}\n\nContent:\n${content}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://mindsetforest.app", "X-Title": "MindsetForest", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: PROMPTS[action] },
          { role: "user", content: userContent },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("ai-archive-expand model error:", response.status, t.slice(0, 500));
      return jsonResponse({ error: providerErrorMessage(response.status) }, providerErrorStatus(response.status));
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let result: Record<string, unknown> | null = null;
    try { result = args ? JSON.parse(args) : null; } catch { /* not JSON */ }
    if (!result) return jsonResponse({ error: EMPTY_ANSWER_MESSAGE }, 502);

    if (action === "organize") return jsonResponse(result);
    if (isExpand) {
      const additions = validAdditions(result.additions, paragraphRanges(content).length);
      return jsonResponse({ title, content: insertAdditions(content, additions), additions: additions.length });
    }
    const out = typeof result.content === "string" ? result.content : "";
    if (!out.trim()) return jsonResponse({ error: EMPTY_ANSWER_MESSAGE }, 502);
    return jsonResponse({ title: typeof result.title === "string" && result.title.trim() ? result.title : title, content: out });
  } catch (e) {
    console.error("ai-archive-expand error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
