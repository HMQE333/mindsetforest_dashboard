import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";

/**
 * Text from a picture in the Archive (a screenshot, a photo of a page or a
 * slide): { imageUrl } -> { text }. A cheap vision model writes out every
 * readable word, then one line describing the picture, so the note becomes
 * searchable (the client saves the text into the note, which re-embeds it).
 * Signed-in users only; the model is paid.
 */
const MODEL = Deno.env.get("IMAGE_TEXT_MODEL") || "google/gemini-2.5-flash-lite";

const PROMPT = `Write out all readable text in this image, exactly as written, in its original language.
Keep line breaks, lists and the reading order. Do not translate, summarise or add anything.
Then, on its own last line, write "Image: " and one short sentence saying what the picture shows (in English).
If the image has no readable text, write only the "Image: " line.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const caller = await getUserClient(req);
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!/^https:\/\/\S+$/.test(imageUrl) || imageUrl.length > 2000) return jsonResponse({ error: "An https image link is required" }, 400);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json", "X-Title": "MindsetForest" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 3000,
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: imageUrl } }] }],
    }),
  });
  const data = await res.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content;
  if (!res.ok || typeof text !== "string" || !text.trim()) {
    return jsonResponse({ error: `The picture could not be read: ${String(data?.error?.message ?? res.status).slice(0, 200)}` }, 502);
  }
  return jsonResponse({ text: text.trim(), model: MODEL });
});
