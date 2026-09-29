import { supabase } from "@/integrations/supabase/client";
import { SCOPES, type ScopeId } from "@/lib/assistant-context";
import type { TtsVoice } from "@/lib/voice-mode";

/** Thin client for the ai-assistant-chat edge function's non-streaming modes. */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const ASSISTANT_FN_URL = `${SUPABASE_URL}/functions/v1/ai-assistant-chat`;

export async function assistantAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in to use the assistant.");
  return { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
}

const VALID_SCOPES = new Set<string>(SCOPES.map((s) => s.id));

export interface RouteInput {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  current: ScopeId | null;
  pinned: ScopeId[];
}

/** Ask the router model which sections this message needs. Throws on transport errors. */
export async function routeScopes(input: RouteInput, signal?: AbortSignal): Promise<{ scopes: ScopeId[]; reason: string }> {
  const res = await fetch(ASSISTANT_FN_URL, {
    method: "POST",
    headers: await assistantAuthHeaders(),
    body: JSON.stringify({
      mode: "route",
      message: input.message,
      history: input.history.slice(-6),
      current: input.current,
      pinned: input.pinned,
      scopes: SCOPES.map((s) => ({ id: s.id, label: s.label, description: s.description })),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`route ${res.status}`);
  const data = await res.json();
  const scopes = (Array.isArray(data?.scopes) ? data.scopes : []).filter(
    (s: unknown): s is ScopeId => typeof s === "string" && VALID_SCOPES.has(s),
  );
  return { scopes, reason: typeof data?.reason === "string" ? data.reason : "" };
}

export interface AssistantStatus {
  smartModel: string;
  cheapModel: string;
  routerModel: string;
  budgetUsd: number;
  monthCostUsd: number;
  monthRequests: number;
  overBudget: boolean;
  usageTableReady: boolean;
}

export async function fetchAssistantStatus(): Promise<AssistantStatus> {
  const res = await fetch(ASSISTANT_FN_URL, {
    method: "POST",
    headers: await assistantAuthHeaders(),
    body: JSON.stringify({ mode: "status" }),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const d = await res.json();
  return {
    smartModel: String(d.smartModel || ""),
    cheapModel: String(d.cheapModel || ""),
    routerModel: String(d.routerModel || ""),
    budgetUsd: Number(d.budgetUsd) || 0,
    monthCostUsd: Number(d.monthCostUsd) || 0,
    monthRequests: Number(d.monthRequests) || 0,
    overBudget: d.overBudget === true,
    usageTableReady: d.usageTableReady === true,
  };
}

export { prettyModelName } from "@/lib/model-names";

// ---------------------------------------------------------------------------
// Text-to-speech (ElevenLabs via the ai-tts function). null = use the browser voice.
// ---------------------------------------------------------------------------
const TTS_FN_URL = `${SUPABASE_URL}/functions/v1/ai-tts`;
const TTS_RETRY_MS = 10 * 60 * 1000;
let ttsUnavailableUntil = 0;

/** MP3 for a short reply, or null when the key is not configured / the call failed. */
export async function fetchSpeech(text: string, lang: string, voiceId?: string | null, signal?: AbortSignal): Promise<Blob | null> {
  if (!text.trim() || Date.now() < ttsUnavailableUntil) return null;
  try {
    const res = await fetch(TTS_FN_URL, {
      method: "POST",
      headers: await assistantAuthHeaders(),
      body: JSON.stringify({ text: text.slice(0, 1500), lang, ...(voiceId ? { voice: voiceId } : {}) }),
      signal,
    });
    if (res.status === 501 || res.status === 404) {
      // Not configured / not deployed: stop asking for a while.
      ttsUnavailableUntil = Date.now() + TTS_RETRY_MS;
      return null;
    }
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/**
 * ok: the list is usable. not_configured: no ELEVENLABS_API_KEY (browser voice
 * is used). failed: the key works for speech but cannot list voices (an
 * ElevenLabs key restricted to text-to-speech lacks the voices_read
 * permission) or the request failed; a voice can still be chosen by id.
 */
export type VoicesStatus = "ok" | "not_configured" | "failed";
export interface VoicesResult { status: VoicesStatus; voices: TtsVoice[]; defaultVoice: string | null }

let voicesCache: (VoicesResult & { at: number }) | null = null;

/** Voices on the ElevenLabs account. `force` ignores the cache and the backoff. */
export async function fetchVoices(force = false): Promise<VoicesResult> {
  if (force) {
    voicesCache = null;
    ttsUnavailableUntil = 0;
  }
  if (voicesCache && Date.now() - voicesCache.at < 5 * 60 * 1000) return voicesCache;
  const failed: VoicesResult = { status: "failed", voices: [], defaultVoice: null };
  if (Date.now() < ttsUnavailableUntil) return { status: "not_configured", voices: [], defaultVoice: null };
  try {
    const res = await fetch(TTS_FN_URL, {
      method: "POST",
      headers: await assistantAuthHeaders(),
      body: JSON.stringify({ mode: "voices" }),
    });
    if (res.status === 501 || res.status === 404) {
      ttsUnavailableUntil = Date.now() + TTS_RETRY_MS;
      return { status: "not_configured", voices: [], defaultVoice: null };
    }
    if (!res.ok) return failed;
    const d = await res.json();
    const voices: TtsVoice[] = (Array.isArray(d?.voices) ? d.voices : []).filter(
      (v: unknown): v is TtsVoice => !!v && typeof v === "object" && typeof (v as TtsVoice).id === "string" && typeof (v as TtsVoice).name === "string",
    );
    voicesCache = { at: Date.now(), status: "ok", voices, defaultVoice: typeof d?.defaultVoice === "string" ? d.defaultVoice : null };
    return voicesCache;
  } catch {
    return failed;
  }
}
