import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function stripHtml(s: string): string {
  return (s || "").replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
                   .replace(/<\/?[a-z][^>]*>/gi, "");
}

function sanitiseTags(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x): x is string => typeof x === "string")
    .map((t) => t.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);
}

async function getEmbedding(openaiKey: string, text: string): Promise<number[] | null> {
  try {
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.data?.[0]?.embedding || null;
  } catch (_) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const blockId: string | undefined = body.blockId;
    const visibility: "public" | "friends" | "custom" = body.visibility ?? "friends";
    const audienceUserIds: string[] = Array.isArray(body.audienceUserIds) ? body.audienceUserIds : [];
    const edits = body.edits || {};

    if (!["public", "friends", "custom"].includes(visibility)) {
      return new Response(JSON.stringify({ error: "Invalid visibility" }), { status: 400, headers: corsHeaders });
    }
    if (!blockId || typeof blockId !== "string") {
      return new Response(JSON.stringify({ error: "blockId required" }), { status: 400, headers: corsHeaders });
    }
    if (visibility === "custom" && audienceUserIds.length === 0) {
      return new Response(JSON.stringify({ error: "audience required for custom visibility" }), { status: 400, headers: corsHeaders });
    }

    // Read source block (RLS ensures user owns it)
    const { data: block, error: blockErr } = await userClient
      .from("archive_blocks")
      .select("id, title, content, pillars, directions, tags, source_url")
      .eq("id", blockId)
      .eq("user_id", userId)
      .single();
    if (blockErr || !block) {
      return new Response(JSON.stringify({ error: "Source block not found" }), { status: 404, headers: corsHeaders });
    }

    const title = stripHtml(typeof edits.title === "string" ? edits.title : block.title).slice(0, 200);
    const content = stripHtml(typeof edits.content === "string" ? edits.content : block.content).slice(0, 8000);
    const pillars = sanitiseTags(edits.pillars ?? block.pillars);
    const directions = sanitiseTags(edits.directions ?? block.directions);
    const tags = sanitiseTags(edits.tags ?? block.tags);
    const sourceUrl = typeof edits.source_url === "string" ? edits.source_url.slice(0, 500) : (block.source_url || null);

    if (!title && !content) {
      return new Response(JSON.stringify({ error: "Empty seed" }), { status: 400, headers: corsHeaders });
    }

    // Insert seed via user client so RLS + rate-limit triggers fire
    const { data: seed, error: insertErr } = await userClient
      .from("forest_seeds")
      .insert({
        author_id: userId,
        source_block_id: block.id,
        title,
        content,
        pillars,
        directions,
        tags,
        source_url: sourceUrl,
        visibility,
      } as any)
      .select()
      .single();

    if (insertErr || !seed) {
      const msg = insertErr?.message || "";
      if (msg.includes("forest_publish_rate_exceeded")) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "Daily publish limit reached (20/day)" }), { status: 429, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ error: msg || "Insert failed" }), { status: 400, headers: corsHeaders });
    }

    // Audience rows for custom visibility
    if (visibility === "custom" && audienceUserIds.length > 0) {
      const rows = Array.from(new Set(audienceUserIds))
        .filter((u) => typeof u === "string" && u !== userId)
        .slice(0, 200)
        .map((uid) => ({ seed_id: seed.id, user_id: uid }));
      if (rows.length > 0) {
        await userClient.from("forest_seed_audience").insert(rows as any);
      }
    }

    // Fire-and-forget embedding (uses service role to bypass counter-protection trigger)
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (OPENAI_API_KEY) {
      const text = `${title}\n\n${content}`;
      const emb = await getEmbedding(OPENAI_API_KEY, text);
      if (emb) {
        const serviceClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await serviceClient
          .from("forest_seeds")
          .update({ embedding: JSON.stringify(emb) } as any)
          .eq("id", seed.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, seed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("forest-publish-seed error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});