// AI Lab Report Extractor — uses Lovable AI Gateway (Gemini vision).
// Input: { fileBase64, mimeType } (an uploaded image or PDF)
// Output: { extracted: { ...numeric fields }, raw_text: string }
import { getUserClient } from "../_shared/planner.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NUMERIC_FIELDS = [
  "weight_kg",
  "height_cm",
  "bp_systolic",
  "bp_diastolic",
  "resting_hr",
  "fasting_glucose_mgdl",
  "hba1c_pct",
  "ldl_mgdl",
  "hdl_mgdl",
  "total_chol_mgdl",
  "triglycerides_mgdl",
  "hemoglobin_gdl",
  "creatinine_mgdl",
  "egfr",
] as const;

const tool = {
  type: "function",
  function: {
    name: "extract_lab_values",
    description:
      "Extract numeric biomarker values from a lab report. Use US units: mg/dL for glucose/cholesterol/triglycerides/creatinine, % for HbA1c, g/dL for hemoglobin, mmHg for blood pressure, kg for weight, cm for height, bpm for heart rate, mL/min/1.73m^2 for eGFR. Convert from other units when needed (e.g. mmol/L glucose → mg/dL by ×18). Only include a field if you are confident it is present in the report. Omit fields you cannot find.",
    parameters: {
      type: "object",
      properties: Object.fromEntries(
        NUMERIC_FIELDS.map(f => [f, { type: "number", description: `${f} value in standard unit` }]),
      ),
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // A paid model sits behind this: signed-in users of the app only.
    if (!(await getUserClient(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    // Only an uploaded file (base64, up to ~10 MB); arbitrary URLs are not fetched.
    const { fileBase64, mimeType } = body || {};
    const typeOk = typeof mimeType !== "string" || /^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf)$/.test(mimeType);
    if (typeof fileBase64 !== "string" || !fileBase64 || fileBase64.length > 14_000_000 || !typeOk) {
      return new Response(JSON.stringify({ error: "Provide the report as an image or PDF under 10 MB" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");
    const AI_MODEL = Deno.env.get("OPENROUTER_MODEL") || "google/gemini-2.5-flash";

    const imageUrl = `data:${mimeType || "image/png"};base64,${fileBase64}`;

    const messages = [
      {
        role: "system",
        content:
          "You read medical lab reports (PDF page images, photos, or scans) and extract biomarker values. " +
          "Be conservative — only return a value if it is clearly visible. Always convert to the canonical unit. " +
          "Never invent or estimate values that are not on the report.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract every biomarker from this lab report and call extract_lab_values with the values you find.",
          },
          { type: "image_url", image_url: { url: imageUrl! } },
        ],
      },
    ];

    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`, "HTTP-Referer": "https://mindsetforest.app", "X-Title": "MindsetForest",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        tools: [tool],
        tool_choice: { type: "function", function: { name: "extract_lab_values" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits required. Please add credits in workspace settings." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const choice = aiData.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    let extracted: Record<string, number> = {};
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        // Whitelist + numeric coercion
        for (const k of NUMERIC_FIELDS) {
          if (parsed[k] !== undefined && parsed[k] !== null && Number.isFinite(Number(parsed[k]))) {
            extracted[k] = Number(parsed[k]);
          }
        }
      } catch (e) {
        console.error("Failed to parse tool args:", e);
      }
    }

    return new Response(
      JSON.stringify({
        extracted,
        found_count: Object.keys(extracted).length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ai-health-extract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});