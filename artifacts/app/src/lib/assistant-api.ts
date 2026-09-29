import { supabase } from "@/integrations/supabase/client";
import { SCOPES, type ScopeId } from "@/lib/assistant-context";

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
