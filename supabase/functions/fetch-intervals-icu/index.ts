// Intervals.icu integration — fetch wellness data from Garmin (via intervals.icu)
// and upsert into watch_entries.
//
// Actions:
//   save   (JWT)      — store API key + athlete id in user_onboarding.preferences
//   fetch  (JWT)      — one-off manual fetch for the current user
//   cron   (secret)   — scheduled auto-import for every configured user
//
// The cron action is protected by a shared secret (header X-Cron-Secret).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await createClient(URL, ANON).auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// Fetch wellness from intervals.icu and upsert rows for one user.
async function importForUser(userId: string, apiKey: string, athleteId: string): Promise<{ imported: number; skipped: number }> {
  const auth = btoa(`API_KEY:${apiKey}`);
  const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness`;

  const resp = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!resp.ok) {
    console.error(`intervals.icu ${resp.status} for ${athleteId}:`, await resp.text().catch(() => ""));
    throw new Error(`intervals.icu returned ${resp.status}`);
  }

  const wellness = await resp.json();
  const entries = Array.isArray(wellness) ? wellness : [wellness];
  const db = admin();
  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const entryDate = (entry.id || entry.date || "").toString().split("_")[0].slice(0, 10);
    if (!entryDate) continue;

    const row = {
      user_id: userId,
      entry_date: entryDate,
      source: "intervals.icu",
      resting_hr: entry.restingHR ?? null,
      hrv_ms: entry.hrv ?? null,
      sleep_score: entry.sleepScore ?? null,
      steps: entry.steps ?? null,
      body_battery: entry.bodyBattery ?? null,
      stress_level: entry.stress ?? null,
      vo2max: entry.vo2max ?? null,
      notes: [
        entry.sleepSecs ? `Sen: ${Math.round(entry.sleepSecs / 3600)}h` : "",
        entry.sleepQuality ? `Jakość snu: ${entry.sleepQuality}/5` : "",
        entry.weight ? `Waga: ${entry.weight}kg` : "",
        entry.readiness != null ? `Readiness: ${entry.readiness}` : "",
      ].filter(Boolean).join(" | ") || "",
    };

    const { error } = await db
      .from("watch_entries")
      .upsert(row, { onConflict: "user_id,entry_date" });
    if (error) { skipped++; console.error("upsert error:", error.message); }
    else imported++;
  }

  // Mark last sync
  const { data: existing } = await db
    .from("user_onboarding")
    .select("preferences")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = (existing?.preferences as Record<string, unknown>) || {};
  await db
    .from("user_onboarding")
    .upsert(
      { user_id: userId, preferences: { ...prefs, intervals_last_sync: new Date().toISOString() } },
      { onConflict: "user_id" },
    );

  return { imported, skipped };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // ── CRON: auto-import for every configured user ──
    if (action === "cron") {
      const secret = req.headers.get("X-Cron-Secret");
      if (!secret || secret !== Deno.env.get("CRON_SECRET")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
      }
      const db = admin();
      const { data: users } = await db
        .from("user_onboarding")
        .select("user_id, preferences")
        .not("preferences->intervals_api_key", "is", null);

      const results: Array<{ user: string; imported: number; skipped: number; error?: string }> = [];
      for (const u of users || []) {
        const prefs = (u.preferences || {}) as Record<string, unknown>;
        const apiKey = prefs.intervals_api_key as string;
        const athleteId = prefs.intervals_athlete_id as string;
        if (!apiKey || !athleteId) continue;
        try {
          const r = await importForUser(u.user_id, apiKey, athleteId);
          results.push({ user: u.user_id, ...r });
        } catch (e) {
          results.push({ user: u.user_id, imported: 0, skipped: 0, error: (e as Error).message });
        }
      }
      return new Response(JSON.stringify({ results, processed: results.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── JWT actions (save / fetch) ──
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { apiKey, athleteId } = body;

    if (action === "save") {
      if (!apiKey || !athleteId) {
        return new Response(JSON.stringify({ error: "API key i Athlete ID są wymagane" }), { status: 400, headers: corsHeaders });
      }
      const db = admin();
      const { data: existing } = await db
        .from("user_onboarding")
        .select("preferences")
        .eq("user_id", userId)
        .maybeSingle();
      const prefs = (existing?.preferences as Record<string, unknown>) || {};
      await db
        .from("user_onboarding")
        .upsert(
          { user_id: userId, preferences: { ...prefs, intervals_api_key: apiKey, intervals_athlete_id: athleteId } },
          { onConflict: "user_id" },
        );
      return new Response(JSON.stringify({ saved: true, message: "Intervals.icu skonfigurowany!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch") {
      if (!apiKey || !athleteId) {
        return new Response(JSON.stringify({ error: "API key i Athlete ID są wymagane" }), { status: 400, headers: corsHeaders });
      }
      const r = await importForUser(userId, apiKey, athleteId);
      return new Response(JSON.stringify({ ...r, message: `Zaimportowano ${r.imported} wpisów` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Nieznana akcja" }), { status: 400, headers: corsHeaders });
  } catch (e) {
    console.error("fetch-intervals-icu error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
