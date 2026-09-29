import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, getUserClient, callPlanner, replaceDashes } from "../_shared/planner.ts";

/**
 * Library AI.
 *
 * mode "suggest": five books for this reader. Reads the shelf itself (what is
 * finished and how it was rated says more about taste than a bare title list)
 * plus the user's written context, and never returns a book already on the
 * shelf or one suggested earlier in the same sitting (`exclude`).
 *
 * mode "qa": a short plain-text answer about one book.
 */

interface ShelfBook {
  title: string;
  author: string;
  status: string;
  rating: number | null;
  tags: string[] | null;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** "Deep Work: Rules for..." and "Deep Work" are the same book. */
const mainTitle = (s: string) => norm(s.split(/[:(]/)[0]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await getUserClient(req);
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));

    if (body.mode === "qa") {
      const title = String(body.bookTitle || "").slice(0, 300);
      const author = String(body.bookAuthor || "").slice(0, 200);
      const question = String(body.question || "").slice(0, 1000);
      if (!title || !question) return jsonResponse({ error: "Missing book or question" }, 400);
      const out = await callPlanner({
        systemPrompt: "You are a knowledgeable literary assistant. Answer questions about books concisely in plain text, in the language of the question. No markdown. Under 200 words. Never use em dashes.",
        userPrompt: `About the book "${title}"${author ? ` by ${author}` : ""}: ${question}`,
        toolName: "answer",
        toolDescription: "The answer to the reader's question.",
        parameters: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
      });
      return jsonResponse({ answer: replaceDashes(String(out.answer || "")) });
    }

    const [{ data: books }, { data: ctx }] = await Promise.all([
      auth.client.from("user_books").select("title,author,status,rating,tags").eq("user_id", auth.userId),
      auth.client.from("user_context").select("notes,lenses,season").eq("user_id", auth.userId).maybeSingle(),
    ]);
    const shelf = (books as ShelfBook[] | null) || [];
    const exclude: string[] = Array.isArray(body.exclude) ? body.exclude.map(String).slice(0, 60) : [];

    const line = (b: ShelfBook) =>
      `- ${b.title}${b.author ? ` (${b.author})` : ""}${b.rating ? `, rated ${b.rating}/5` : ""}${b.tags?.length ? ` [${b.tags.slice(0, 3).join(", ")}]` : ""}`;
    const group = (status: string) => shelf.filter((b) => b.status === status).map(line).join("\n") || "(none)";
    const about = [ctx?.notes, ctx?.lenses, ctx?.season].filter((x) => typeof x === "string" && x.trim()).join("\n\n");

    const systemPrompt = `You recommend books to one reader, from what is on their shelf.

Rules:
- Exactly 5 real, existing books with their actual authors. Never invent a title.
- Never suggest a book already on the shelf (any status) or one in the "already suggested" list, including other editions or translations of it.
- Finished books, and how they were rated, show taste best; the to-read shelf shows where the reader is heading. Do not simply pick more books by authors already on the shelf.
- Mix: at least one book that goes deeper on something they clearly care about, and at least one that widens the view from a direction they have not read.
- Each reason: one sentence in Polish (informal "ty"), naming one or two books from their shelf it connects to and what it adds. Plain text, no markdown, never an em dash.`;

    const userPrompt = [
      about ? `About the reader, in their own words:\n${about.slice(0, 3000)}` : "",
      `Finished:\n${group("finished")}`,
      `Reading now:\n${group("reading")}`,
      `To read:\n${group("to-read")}`,
      exclude.length ? `Already suggested (do not repeat):\n${exclude.map((t) => `- ${t}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n");

    const out = await callPlanner({
      systemPrompt,
      userPrompt,
      toolName: "suggest_books",
      toolDescription: "Five book suggestions for this reader.",
      parameters: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                author: { type: "string" },
                reason: { type: "string" },
              },
              required: ["title", "author", "reason"],
            },
          },
        },
        required: ["suggestions"],
      },
    });

    // The model is told not to repeat the shelf; this makes sure of it.
    const taken = new Set([...shelf.map((b) => mainTitle(b.title)), ...exclude.map(mainTitle)]);
    const raw = Array.isArray(out.suggestions) ? out.suggestions as { title?: string; author?: string; reason?: string }[] : [];
    const suggestions = raw
      .filter((s) => s.title && !taken.has(mainTitle(s.title)))
      .map((s) => ({ title: String(s.title).trim(), author: String(s.author || "").trim(), reason: String(s.reason || "").trim() }))
      .slice(0, 5);

    return jsonResponse({ suggestions });
  } catch (e) {
    console.error("ai-book-suggest error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
