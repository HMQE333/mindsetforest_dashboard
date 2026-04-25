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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { action, blockId, blockIds, query } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    // Generate embedding for text
    async function getEmbedding(text: string): Promise<number[]> {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text.slice(0, 8000),
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI embedding error: ${resp.status} ${err}`);
      }
      const data = await resp.json();
      return data.data[0].embedding;
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Action: embed a single block
    if (action === "embed" && blockId) {
      const { data: block, error } = await supabase
        .from("archive_blocks")
        .select("id, title, content")
        .eq("id", blockId)
        .eq("user_id", userId)
        .single();
      if (error || !block) {
        return new Response(JSON.stringify({ error: "Block not found" }), { status: 404, headers: corsHeaders });
      }
      const text = `${block.title}\n\n${block.content}`;
      const embedding = await getEmbedding(text);

      const { error: updateError } = await serviceClient
        .from("archive_blocks")
        .update({ embedding: JSON.stringify(embedding) } as any)
        .eq("id", blockId);
      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: embed multiple blocks
    if (action === "embed-all") {
      const { data: blocks, error } = await supabase
        .from("archive_blocks")
        .select("id, title, content")
        .eq("user_id", userId)
        .is("embedding" as any, null);
      if (error) throw error;

      let embedded = 0;
      for (const block of (blocks || [])) {
        try {
          const text = `${block.title}\n\n${block.content}`;
          const embedding = await getEmbedding(text);
          await serviceClient
            .from("archive_blocks")
            .update({ embedding: JSON.stringify(embedding) } as any)
            .eq("id", block.id);
          embedded++;
        } catch (e) {
          console.error(`Failed to embed block ${block.id}:`, e);
        }
      }

      return new Response(JSON.stringify({ success: true, embedded, total: (blocks || []).length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: semantic search
    if (action === "search" && query) {
      const queryEmbedding = await getEmbedding(query);
      const { data, error } = await serviceClient.rpc("search_archive_blocks", {
        query_embedding: JSON.stringify(queryEmbedding),
        match_user_id: userId,
        match_threshold: 0.3,
        match_count: 20,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ results: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: semantic search across the Forest (RLS-scoped to seeds the user can see)
    if (action === "search-forest" && query) {
      const queryEmbedding = await getEmbedding(query);
      // Use the user-scoped client so RLS filters down to visible seeds.
      // Fetch a wider candidate set, then sort by cosine similarity client-side
      // since we don't have a dedicated RPC. Good enough at low-thousands scale.
      const { data: candidates, error } = await supabase
        .from("forest_seeds")
        .select("id, author_id, title, content, pillars, directions, tags, source_url, visibility, water_count, save_count, view_count, published_at, updated_at, embedding")
        .eq("is_active", true)
        .not("embedding", "is", null)
        .limit(500);
      if (error) throw error;

      const parseVec = (v: any): number[] | null => {
        if (!v) return null;
        if (Array.isArray(v)) return v as number[];
        try {
          const s = String(v).trim();
          if (s.startsWith("[")) return JSON.parse(s);
          // pg vector text format: "(1,2,3)"
          return s.replace(/[()\s]/g, "").split(",").map(Number);
        } catch {
          return null;
        }
      };
      const cosine = (a: number[], b: number[]) => {
        let dot = 0, na = 0, nb = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
        return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      };

      const scored = (candidates || [])
        .map((row: any) => {
          const vec = parseVec(row.embedding);
          const sim = vec ? cosine(queryEmbedding, vec) : 0;
          const { embedding: _e, ...rest } = row;
          return { ...rest, similarity: sim };
        })
        .filter((r) => r.similarity > 0.25)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 30);

      return new Response(JSON.stringify({ results: scored }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-embed-block error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
