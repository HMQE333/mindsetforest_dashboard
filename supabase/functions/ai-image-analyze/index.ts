import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getUserClient, jsonResponse } from "../_shared/planner.ts";

/**
 * Looks at one picture in an Archive note and remembers what is in it:
 * { blockId, url, colors, hues } -> archive_image_meta row.
 * A cheap vision model writes the kind of picture, a description, the text in
 * it, the objects and a few tags; the palette comes from the browser (it is
 * exact and free there). Then each picture of the note gets its own embedding,
 * so meaning search finds the picture, not the whole note. Signed-in owners of the note only.
 */
const MODEL = Deno.env.get("IMAGE_ANALYZE_MODEL") || "google/gemini-2.5-flash-lite";
const HUES = new Set(["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "black", "white", "gray"]);

const PROMPT = `Analyse this image for a personal search index. Answer with JSON only, no prose:
{"kind": one of "photo","screenshot","document","diagram","chart","meme","illustration","handwriting","other",
 "description": 1-3 sentences in English saying what the picture shows, specific (who/what/where, brand names, app names),
 "text": all readable text exactly as written in its original language ("" if none, keep line breaks),
 "objects": up to 12 short English nouns for the visible things,
 "tags": up to 8 short English search words (topic, mood, setting, style)}`;

const strList = (v: unknown, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string").map((s) => s.trim().toLowerCase()).filter((s) => s && s.length <= 40))].slice(0, max) : [];

function parseJson(raw: string): Record<string, unknown> | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const caller = await getUserClient(req);
  if (!caller) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const blockId = typeof body?.blockId === "string" ? body.blockId : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!blockId || !/^https:\/\/\S+$/.test(url) || url.length > 2000) return jsonResponse({ error: "blockId and an https image url are required" }, 400);

  // The note must be the caller's and must hold this picture.
  const { data: block } = await caller.client.from("archive_blocks").select("id, content").eq("id", blockId).eq("user_id", caller.userId).maybeSingle();
  if (!block || !String(block.content ?? "").includes(url)) return jsonResponse({ error: "Note not found" }, 404);

  const colors = Array.isArray(body?.colors)
    ? body.colors.filter((c: any) => c && /^#[0-9a-f]{6}$/i.test(String(c.hex)) && typeof c.share === "number").slice(0, 6)
        .map((c: any) => ({ hex: String(c.hex).toLowerCase(), share: Math.max(0, Math.min(1, Number(c.share))), hue: HUES.has(c.hue) ? c.hue : null }))
    : [];
  const hues = strList(body?.hues, 6).filter((h) => HUES.has(h));

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`, "Content-Type": "application/json", "X-Title": "MindsetForest" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url } }] }],
    }),
  });
  const data = await res.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content;
  const parsed = typeof raw === "string" ? parseJson(raw) : null;
  if (!res.ok || !parsed) {
    return jsonResponse({ error: `The picture could not be analysed: ${String(data?.error?.message ?? res.status).slice(0, 200)}` }, 502);
  }

  const row = {
    user_id: caller.userId,
    block_id: blockId,
    url,
    kind: typeof parsed.kind === "string" ? parsed.kind.slice(0, 20) : null,
    description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 1000) : null,
    text_in_image: typeof parsed.text === "string" ? parsed.text.trim().slice(0, 6000) : null,
    objects: strList(parsed.objects, 12),
    tags: strList(parsed.tags, 8),
    colors,
    hues,
    model: MODEL,
    analyzed_at: new Date().toISOString(),
  };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: saved, error } = await admin.from("archive_image_meta").upsert(row, { onConflict: "user_id,url" }).select().single();
  if (error) return jsonResponse({ error: error.message }, 500);

  // The picture's own embedding, for meaning search over pictures (ai-embed-block writes it).
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-embed-block`, {
    method: "POST",
    headers: { Authorization: req.headers.get("Authorization")!, apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "embed-images", url }),
  }).catch(() => null);

  return jsonResponse({ meta: saved });
});
