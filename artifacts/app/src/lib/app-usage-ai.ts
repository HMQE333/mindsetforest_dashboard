/**
 * The AI fallback of "Przypisz w 10 sekund": a class proposed for the app keys
 * that the catalog, rules and keywords left without one.
 *
 * The answers come from the ai-usage-classify edge function and live in
 * app_class_suggestions, which is the cache (a repeated run sends the model
 * only what it has not seen), the memory of skipped keys (never asked about
 * again) and the scorecard (offered -> accepted / corrected). A suggestion
 * never classifies anything: accepting one writes an ordinary label rule.
 *
 * The function redacts every key and title itself. `redactForPrompt` here is
 * the same code, for showing what would be sent; a test pins the two copies
 * together, so change both or neither.
 */
import { supabase } from "@/integrations/supabase/client";

export interface AiItem {
  app_key: string;
  app: string;
  device: "pc" | "phone";
  minutes: number;
  titles: string[];
}

export interface AiSuggestion {
  app_key: string;
  /** null: the model could not tell. */
  class_id: string | null;
  alt_class_id: string | null;
  confidence: number;
  /** The app serves many purposes (browser, AI chat, notes): one tap from the user, never a guess. */
  multi: boolean;
  /** At most a few Polish words. */
  why: string;
  cached: boolean;
  /** The user's own earlier choice for this key (its rule is gone): shown, never pre-selected. */
  decided?: boolean;
  /** Read from the local cache, not yet re-checked by the function against the current classes: never pre-selected. */
  stale?: boolean;
}

export type SuggestionStatus = "offered" | "accepted" | "corrected" | "dismissed";

export interface SuggestionRow {
  app_key: string;
  status: SuggestionStatus;
  class_id: string | null;
  alt_class_id: string | null;
  confidence: number;
  multi_purpose: boolean;
  reason: string;
  /** What the user picked (accepted / corrected). */
  final_class_id?: string | null;
}

export interface AiDecision {
  app_key: string;
  status: "accepted" | "corrected" | "dismissed";
  final_class_id: string | null;
  /** Whether the row was pre-selected when the user confirmed (the scorecard for the threshold). */
  preselected?: boolean;
}

/** The function's own limits; anything past them is dropped there anyway. */
export const AI_MAX_ITEMS = 60;
export const AI_MAX_TITLES = 3;
export const AI_MAX_VALUE = 200;
/** A decided row comes back below any pre-selection threshold. */
export const DECIDED_CONFIDENCE = 0.5;
export const DECIDED_WHY = "Twój wcześniejszy wybór";

const SUGGESTION_CONFLICT = "user_id,item_type,app_key,title_key";
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;

// ---------------------------------------------------------------------------
// Text. Keep normTitle and redactForPrompt identical to the copies in
// supabase/functions/ai-usage-classify/index.ts.

const BROWSER_SUFFIX = /\s+[-–—]\s+(?:Google Chrome|Brave|Microsoft\u200B?\s?Edge|Mozilla Firefox|Firefox|Opera(?: GX)?|Vivaldi|Arc|Zen)$/i;

/** A tab's identity: no "(3) " counter, no " - Brave" suffix, single spaces. Not redacted. */
export function normTitle(title: string): string {
  return String(title || "").replace(/^\(\d[\d\s,.]*\)\s*/, "").replace(/\s+/g, " ").trim().replace(BROWSER_SUFFIX, "").trim();
}

/** What may leave for the model: addresses, DM handles, URL queries, ids, tokens and long numbers masked. */
export function redactForPrompt(text: string, max = 80): string {
  let t = normTitle(text);
  // Folders before the file name (they carry the user's name): "C:\Users\Jan\a.pdf" -> "a.pdf".
  t = t.replace(/(?:\b[A-Za-z]:|\\\\[^\\\s|]+)\\(?:[^\\|]*\\)*/g, "");
  t = t.replace(/(?:\/(?:home|Users)\/|~\/)(?:[^/|]*\/)*/g, "");
  t = t.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>");
  t = t.replace(/(^|[\s|(])@[^|]*/g, "$1@<osoba> ");
  t = t.replace(/((?:https?:\/\/|blob:)?[\w-]+(?:\.[\w-]+)+(?:\/[^\s?#]*)?)[?#]\S+/gi, "$1");
  t = t.replace(/(?<![0-9a-f])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  t = t.replace(/\b[0-9a-f]{20,}\b/gi, "<id>");
  t = t.replace(/\beyJ[\w-]{8,}(?:\.[\w-]+){0,2}/g, "<id>");
  t = t.replace(/(?<![\w-])(?=[\w-]*\d)(?=[\w-]*[a-z])(?=[\w-]*[A-Z])[\w-]{24,}(?![\w-])/g, "<id>");
  t = t.replace(/(?<![\w.,/])\+?\d(?:[ -]?\d){6,}(?![\w.,/])/g, "#");
  return t.replace(/\s+/g, " ").trim().slice(0, max);
}

// ---------------------------------------------------------------------------
// Pure shaping (tested)

const clip = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * What goes in the request: one item per key (the one with more minutes
 * wins), the most-used first, at most AI_MAX_ITEMS; per key up to three
 * distinct titles that say more than the app's name.
 */
export function prepareAiItems(items: AiItem[]): AiItem[] {
  const byKey = new Map<string, AiItem>();
  for (const it of items) {
    // The key is an identity (the answer is matched back by it): never trimmed or cut.
    const app_key = typeof it?.app_key === "string" ? it.app_key : "";
    if (!app_key.trim() || app_key.length > AI_MAX_VALUE) continue;
    const app = clip(it.app, AI_MAX_VALUE);
    const minutes = Math.max(0, Math.round(Number(it.minutes) || 0));
    const seen = new Set([app.toLowerCase(), ""]);
    const titles: string[] = [];
    for (const raw of Array.isArray(it.titles) ? it.titles : []) {
      const t = clip(normTitle(String(raw ?? "")), AI_MAX_VALUE);
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      titles.push(t);
      if (titles.length >= AI_MAX_TITLES) break;
    }
    const prev = byKey.get(app_key);
    if (prev && prev.minutes >= minutes) continue;
    byKey.set(app_key, { app_key, app, device: it.device === "phone" ? "phone" : "pc", minutes, titles });
  }
  return [...byKey.values()].sort((a, b) => b.minutes - a.minutes).slice(0, AI_MAX_ITEMS);
}

const unit = (v: unknown) => Math.max(0, Math.min(1, Number(v) || 0));
const idOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);

/** The function's answer, checked: anything without a key is dropped. */
export function parseSuggestions(raw: unknown): AiSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const out: AiSuggestion[] = [];
  for (const s of raw) {
    const app_key = typeof s?.app_key === "string" ? s.app_key : "";
    if (!app_key) continue;
    out.push({
      app_key,
      class_id: idOrNull(s.class_id),
      alt_class_id: idOrNull(s.alt_class_id),
      confidence: unit(s.confidence),
      multi: s.multi === true,
      why: typeof s.why === "string" ? s.why : "",
      cached: s.cached === true,
      ...(s.decided === true ? { decided: true } : {}),
    });
  }
  return out;
}

const STATUSES: SuggestionStatus[] = ["offered", "accepted", "corrected", "dismissed"];

export function rowToSuggestionRow(r: Record<string, unknown>): SuggestionRow | null {
  const app_key = typeof r?.app_key === "string" ? r.app_key : "";
  const status = STATUSES.includes(r?.status as SuggestionStatus) ? (r.status as SuggestionStatus) : null;
  if (!app_key || !status) return null;
  return {
    app_key,
    status,
    class_id: idOrNull(r.class_id),
    alt_class_id: idOrNull(r.alt_class_id),
    confidence: unit(r.confidence),
    multi_purpose: r.multi_purpose === true,
    reason: typeof r.reason === "string" ? r.reason : "",
    final_class_id: idOrNull(r.final_class_id),
  };
}

/** Keys the user skipped: never shown in triage, never sent. */
export function dismissedKeys(rows: SuggestionRow[]): Set<string> {
  return new Set(rows.filter((r) => r.status === "dismissed").map((r) => r.app_key));
}

/**
 * What the cache already knows, by key, before the function is called: the
 * model's answers as offered, and for a decided key the user's own pick
 * (shown again, never pre-selected). Same rules as the function.
 */
export function cachedSuggestions(rows: SuggestionRow[]): Map<string, AiSuggestion> {
  const out = new Map<string, AiSuggestion>();
  for (const r of rows) {
    if (r.status === "dismissed") continue;
    if (r.status === "offered") {
      out.set(r.app_key, {
        app_key: r.app_key, class_id: r.class_id, alt_class_id: r.alt_class_id, confidence: r.confidence,
        multi: r.multi_purpose, why: r.reason, cached: true, stale: true,
      });
    } else if (r.final_class_id) {
      out.set(r.app_key, {
        app_key: r.app_key, class_id: r.final_class_id, alt_class_id: null,
        confidence: Math.min(r.confidence, DECIDED_CONFIDENCE), multi: r.multi_purpose, why: DECIDED_WHY,
        cached: true, decided: true,
      });
    }
  }
  return out;
}

/** One upsert row per key (the last decision wins: one statement cannot touch a row twice). */
export function decisionRows(userId: string, decisions: AiDecision[], at: string) {
  const byKey = new Map<string, AiDecision>();
  for (const d of decisions) {
    const key = typeof d?.app_key === "string" ? d.app_key : "";
    if (key.trim() && STATUSES.includes(d.status)) byKey.set(key, d);
  }
  return [...byKey].map(([app_key, d]) => ({
    user_id: userId,
    item_type: "key",
    app_key,
    title_key: "",
    status: d.status,
    final_class_id: d.status === "dismissed" ? null : idOrNull(d.final_class_id),
    preselected: d.preselected === true,
    decided_at: at,
  }));
}

/** A short Polish line for a failed call. */
export function aiErrorMessage(status: number | null, message: string | null): string {
  if (status === 401) return "Zaloguj się ponownie, żeby zapytać AI.";
  if (status === 402) return "Brak środków na AI (OpenRouter).";
  if (status === 429) return "Za dużo zapytań do AI. Spróbuj za chwilę.";
  return message?.trim() || "AI niedostępne.";
}

// ---------------------------------------------------------------------------
// Supabase

type PgError = { code?: string; message?: string } | null;

/** PostgREST hides a missing table behind PGRST205 ("could not find the table"). */
function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /find the table|schema cache/i.test(error.message || "");
}

async function invokeError(error: unknown): Promise<string> {
  const context = (error as { context?: { status?: number; json?: () => Promise<{ error?: string }> } })?.context;
  const status = typeof context?.status === "number" ? context.status : null;
  let message = error instanceof Error ? error.message : null;
  try {
    const json = await context?.json?.();
    if (json?.error) message = json.error;
  } catch { /* not JSON */ }
  return aiErrorMessage(status, message);
}

/**
 * Asks the function about these keys. Never throws: a failure is the
 * `error` line, and whatever came back (cached answers) is still returned.
 */
export async function requestAiSuggestions(items: AiItem[]): Promise<{ suggestions: AiSuggestion[]; error: string | null }> {
  const body = prepareAiItems(items);
  if (body.length === 0) return { suggestions: [], error: null };
  try {
    const { data, error } = await supabase.functions.invoke("ai-usage-classify", { body: { items: body } });
    if (error) return { suggestions: [], error: await invokeError(error) };
    if (data?.error) return { suggestions: [], error: aiErrorMessage(null, String(data.error)) };
    const suggestions = parseSuggestions(data?.suggestions);
    const failed = Number(data?.failed) || 0;
    return { suggestions, error: failed > 0 && suggestions.length === 0 ? aiErrorMessage(null, null) : null };
  } catch (e) {
    return { suggestions: [], error: aiErrorMessage(null, e instanceof Error ? e.message : null) };
  }
}

/** Every key row of the user. `ready` is false while the table does not exist (migration not applied). */
export async function loadSuggestionRows(userId: string): Promise<{ rows: SuggestionRow[]; ready: boolean }> {
  const rows: SuggestionRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("app_class_suggestions")
      .select("app_key,status,class_id,alt_class_id,confidence,multi_purpose,reason,final_class_id")
      .eq("user_id", userId)
      .eq("item_type", "key")
      .order("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      if (isMissingTable(error)) return { rows: [], ready: false };
      console.warn("app_class_suggestions read failed:", error.message);
      return { rows, ready: true };
    }
    for (const r of data || []) {
      const row = rowToSuggestionRow(r as Record<string, unknown>);
      if (row) rows.push(row);
    }
    if ((data || []).length < PAGE_SIZE) break;
  }
  return { rows, ready: true };
}

/** The decision columns of the given keys before a confirm, so "Cofnij" can put them back. */
export interface DecisionSnapshot {
  keys: string[];
  rows: { app_key: string; status: SuggestionStatus; final_class_id: string | null; preselected: boolean; decided_at: string | null }[];
}

const KEY_CHUNK = 100;

export async function snapshotDecisions(userId: string, keys: string[]): Promise<DecisionSnapshot | null> {
  const unique = [...new Set(keys.filter((k) => k.trim()))];
  const rows: DecisionSnapshot["rows"] = [];
  for (let i = 0; i < unique.length; i += KEY_CHUNK) {
    const { data, error } = await supabase
      .from("app_class_suggestions")
      .select("app_key,status,final_class_id,preselected,decided_at")
      .eq("user_id", userId)
      .eq("item_type", "key")
      .eq("title_key", "")
      .in("app_key", unique.slice(i, i + KEY_CHUNK));
    if (error) return null;
    for (const r of data || []) {
      const status = STATUSES.includes(r.status as SuggestionStatus) ? (r.status as SuggestionStatus) : null;
      if (!status) continue;
      rows.push({ app_key: r.app_key, status, final_class_id: idOrNull(r.final_class_id), preselected: r.preselected === true, decided_at: r.decided_at ?? null });
    }
  }
  return { keys: unique, rows };
}

/** Puts the snapshot back: earlier rows get their old decision, rows the confirm created are deleted. */
export async function restoreDecisions(userId: string, snap: DecisionSnapshot): Promise<boolean> {
  let ok = true;
  if (snap.rows.length > 0) {
    const rows = snap.rows.map((r) => ({ user_id: userId, item_type: "key", title_key: "", ...r }));
    const { error } = await supabase.from("app_class_suggestions").upsert(rows, { onConflict: SUGGESTION_CONFLICT });
    if (error) ok = false;
  }
  const had = new Set(snap.rows.map((r) => r.app_key));
  const created = snap.keys.filter((k) => !had.has(k));
  for (let i = 0; i < created.length; i += KEY_CHUNK) {
    const { error } = await supabase
      .from("app_class_suggestions")
      .delete()
      .eq("user_id", userId)
      .eq("item_type", "key")
      .eq("title_key", "")
      .in("app_key", created.slice(i, i + KEY_CHUNK));
    if (error) ok = false;
  }
  return ok;
}

/** Stores what the user did with each key: accepted / corrected (with the class picked) or dismissed. */
export async function recordDecisions(userId: string, decisions: AiDecision[]): Promise<boolean> {
  const rows = decisionRows(userId, decisions, new Date().toISOString());
  if (rows.length === 0) return true;
  const { error } = await supabase.from("app_class_suggestions").upsert(rows, { onConflict: SUGGESTION_CONFLICT });
  if (error) {
    console.warn("app_class_suggestions upsert failed:", error.message);
    return false;
  }
  return true;
}
