import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";
import { CREDENTIAL_REFUSAL, EMPTY_ANSWER_MESSAGE, NO_KEY_MESSAGE, providerErrorMessage, providerErrorStatus } from "../_shared/ai-errors.ts";
import { looksLikeCredential } from "../_shared/archive-tags.ts";

/**
 * Several Archive notes at once: merge, summarize, the other presets, or his
 * own prompt. The app saves the answer as a new note through the preview
 * (Save as new); the notes it came from stay as they are.
 *
 * Borders (stated in the app, src/lib/archive-ai.ts): the notes' language,
 * Markdown kept, nothing invented; Merge keeps every unique point, link,
 * number and #tag. Notes are refused rather than cut when they are too long,
 * so a merge never silently drops the end of a note. A note that looks like it
 * holds a password or a key is refused (422), all of it read.
 *
 * Request { notes: { title, content }[], preset?, prompt? } -> { content } or { error }.
 */

const MAX_NOTES = 40;
const NOTE_LIMIT = 15_000;
const TOTAL_LIMIT = 60_000;

const SYSTEM = `You work on the user's own notes from his personal archive.
- Write in the notes' language (if they are mixed, the language most of them use). Polish keeps its diacritics.
- Markdown is fine: short headings, lists, bold, links.
- Do not invent facts, numbers, names, quotes or sources that are not in the notes.
- Links (URLs) you keep are copied exactly as written.`;

const PRESETS: Record<string, string> = {
  merge: "Merge these notes into one note. Keep every unique point, every link (URL) exactly as written, every number, name and date, and every #tag. Remove only what repeats. Add no new ideas or advice. Order the points so they read well; group related ones under short headings if that helps.",
  summarize: "Write a short summary of these notes: the key points as a few bullets, then the links that matter (exactly as written). Add nothing that is not in the notes.",
  themes: "Find the common themes in these notes: group the related ideas, name each group in a few words, and list under it which notes it comes from (by number).",
  action_plan: "List the things to do that these notes contain, as a checklist, most important first. Only actions that are in the notes; say which note each comes from (by number).",
  compare: "Compare these notes: where they agree, where they disagree, and what each adds that the others do not.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = await req.json();
    if (!Array.isArray(body.notes) || body.notes.length === 0) return jsonResponse({ error: "Select at least one note" }, 400);
    if (body.notes.length > MAX_NOTES) return jsonResponse({ error: `At most ${MAX_NOTES} notes at once (${body.notes.length} sent).` }, 413);
    const notes = body.notes.map((n: { title?: unknown; content?: unknown }) => ({
      title: String(n?.title ?? "").slice(0, 300),
      content: String(n?.content ?? ""),
    }));
    const long = notes.findIndex((n: { content: string }) => n.content.length > NOTE_LIMIT);
    if (long !== -1) {
      return jsonResponse({ error: `Note ${long + 1} ("${notes[long].title.slice(0, 40)}") is too long to combine (${notes[long].content.length} characters; the limit is ${NOTE_LIMIT}).` }, 413);
    }
    const total = notes.reduce((s: number, n: { content: string }) => s + n.content.length, 0);
    if (total > TOTAL_LIMIT) return jsonResponse({ error: `Together the notes are too long (${total} characters; the limit is ${TOTAL_LIMIT}).` }, 413);
    const secret = notes.findIndex((n: { title: string; content: string }) => looksLikeCredential(`${n.title}\n\n${n.content}`));
    if (secret !== -1) return jsonResponse({ error: `Note ${secret + 1} ("${notes[secret].title.slice(0, 40)}"): ${CREDENTIAL_REFUSAL}` }, 422);

    const prompt = String(body.prompt ?? "").trim().slice(0, 2_000);
    const preset = typeof body.preset === "string" && PRESETS[body.preset] ? body.preset : undefined;
    const instruction = preset ? PRESETS[preset] : prompt;
    if (!instruction) return jsonResponse({ error: "Write what the AI should do with the notes" }, 400);
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) return jsonResponse({ error: NO_KEY_MESSAGE }, 503);
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const notesText = notes.map((n: { title: string; content: string }, i: number) => `--- Note ${i + 1}: ${n.title} ---\n${n.content}`).join("\n\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://mindsetforest.app", "X-Title": "MindsetForest", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Here are ${notes.length} notes:\n\n${notesText}\n\nInstruction: ${instruction}` },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("ai-archive-multi model error:", response.status, t.slice(0, 500));
      return jsonResponse({ error: providerErrorMessage(response.status) }, providerErrorStatus(response.status));
    }

    const data = await response.json();
    const content = String(data.choices?.[0]?.message?.content ?? "");
    if (!content.trim()) return jsonResponse({ error: EMPTY_ANSWER_MESSAGE }, 502);

    return jsonResponse({ content });
  } catch (e) {
    console.error("ai-archive-multi error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
