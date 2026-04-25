import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { seedId } = await req.json().catch(() => ({}));
    if (!seedId || typeof seedId !== "string") {
      return new Response(JSON.stringify({ error: "seedId required" }), { status: 400, headers: corsHeaders });
    }

    // Visibility check via SECURITY DEFINER helper
    const { data: canView } = await userClient.rpc("can_view_seed", { _seed_id: seedId });
    if (!canView) {
      return new Response(JSON.stringify({ error: "Seed not visible" }), { status: 403, headers: corsHeaders });
    }

    // Already saved? Return existing.
    const { data: existing } = await userClient
      .from("forest_saves")
      .select("id, saved_block_id")
      .eq("seed_id", seedId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.saved_block_id) {
      return new Response(JSON.stringify({ ok: true, alreadySaved: true, savedBlockId: existing.saved_block_id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read seed via service role (bypasses RLS — we already verified can_view_seed)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: seed, error: seedErr } = await serviceClient
      .from("forest_seeds")
      .select("id, title, content, pillars, directions, tags, source_url, author_id")
      .eq("id", seedId)
      .single();
    if (seedErr || !seed) {
      return new Response(JSON.stringify({ error: "Seed not found" }), { status: 404, headers: corsHeaders });
    }

    // Create a private archive_blocks row in the saver's account, with back-reference
    const tags = Array.from(new Set([...(seed.tags || []), "from-forest"]));
    const { data: newBlock, error: blockErr } = await userClient
      .from("archive_blocks")
      .insert({
        user_id: userId,
        title: seed.title,
        content: seed.content,
        pillars: seed.pillars,
        directions: seed.directions,
        tags,
        source_url: seed.source_url,
      } as any)
      .select()
      .single();
    if (blockErr || !newBlock) {
      return new Response(JSON.stringify({ error: blockErr?.message || "Failed to save" }), { status: 500, headers: corsHeaders });
    }

    // Record save (counter trigger bumps seed.save_count)
    const { error: saveErr } = await userClient
      .from("forest_saves")
      .insert({ seed_id: seedId, user_id: userId, saved_block_id: newBlock.id } as any);
    if (saveErr) {
      // Best-effort: continue but log
      console.error("forest_saves insert failed:", saveErr);
    }

    return new Response(JSON.stringify({ ok: true, savedBlockId: newBlock.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("forest-save-seed error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});