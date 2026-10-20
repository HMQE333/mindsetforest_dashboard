import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";
import { CREDENTIAL_REFUSAL, EMPTY_ANSWER_MESSAGE, NO_KEY_MESSAGE, providerErrorMessage, providerErrorStatus } from "../_shared/ai-errors.ts";
import { looksLikeCredential } from "../_shared/archive-tags.ts";

/**
 * Clean (the Inbox draft or a saved note), or the user's own prompt over a text.
 *
 * Clean has borders, stated in the app (src/lib/archive-ai.ts) and here: typos,
 * spacing and formatting only, the same words otherwise. It no longer splits
 * the text into "---" items or prefixes [note]/[link] labels: one paste is one
 * note now, and the type is a tag he accepts (ai-suggest-tags).
 *
 * With customPrompt the instructions are his (the Inbox's Prompt button, a
 * note's "Own prompt", the Obsidian import's classifier, which asks for JSON).
 *
 * Request { rawText, customPrompt? } -> { cleanedText } or { error }. A text
 * longer than the limit is refused rather than cut; one that looks like it
 * holds a password or a key is refused (422), all of it read.
 */

const LIMIT = 60_000;

const CLEAN_PROMPT = `You clean up the typing of the user's own note. Fix only:
- typos and obvious misspellings, in the note's own language (Polish stays Polish with its diacritics),
- spacing: double spaces, a space before a comma or full stop, a sentence broken across lines by a paste, more than one blank line in a row,
- formatting: list markers and indentation made consistent, Markdown that is clearly broken (an unclosed ** or \`).
Never: add, remove, reorder or replace words (beyond fixing their spelling), translate, summarise, shorten, rephrase, add headings, labels or comments, or split the text into several notes.
Keep every link (URL), number, name, date, #tag, emoji and meaningful line break exactly as written. Keep the Markdown.
If nothing needs fixing, return the text unchanged.
Return the result with the clean_text tool.`;

const customSystemPrompt = (instructions: string) =>
  `You process the user's own text according to his instructions. Apply the instructions to the text and return the whole result using the clean_text tool.
Unless the instructions say otherwise: write in the text's language, keep its links (URLs) exactly as written, keep Markdown, and do not invent facts.

User instructions: ${instructions}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = await req.json();
    const rawText = String(body.rawText ?? "");
    const customPrompt = typeof body.customPrompt === "string" ? body.customPrompt.trim().slice(0, 2_000) : "";
    if (!rawText.trim()) return jsonResponse({ error: "There is no text to work on" }, 400);
    if (rawText.length > LIMIT) {
      return jsonResponse({ error: `The text is too long (${rawText.length} characters; the limit is ${LIMIT}).` }, 413);
    }
    if (looksLikeCredential(rawText)) return jsonResponse({ error: CREDENTIAL_REFUSAL }, 422);
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) return jsonResponse({ error: NO_KEY_MESSAGE }, 503);
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://mindsetforest.app", "X-Title": "MindsetForest",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: customPrompt ? customSystemPrompt(customPrompt) : CLEAN_PROMPT },
          { role: "user", content: rawText },
        ],
        tools: [{
          type: "function",
          function: {
            name: "clean_text",
            description: "Return the whole resulting text",
            parameters: {
              type: "object",
              properties: { cleanedText: { type: "string", description: "The whole resulting text" } },
              required: ["cleanedText"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "clean_text" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("ai-archive-clean model error:", response.status, t.slice(0, 500));
      return jsonResponse({ error: providerErrorMessage(response.status) }, providerErrorStatus(response.status));
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let cleanedText = "";
    try { cleanedText = args ? String(JSON.parse(args).cleanedText ?? "") : ""; } catch { /* not JSON */ }
    // No silent fallback to the raw text: "cleaned" must never mean "the model failed".
    if (!cleanedText.trim()) return jsonResponse({ error: EMPTY_ANSWER_MESSAGE }, 502);

    return jsonResponse({ cleanedText });
  } catch (e) {
    console.error("ai-archive-clean error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
