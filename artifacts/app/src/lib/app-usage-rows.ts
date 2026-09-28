/**
 * Adapters from Supabase rows to the plain shapes the classifier works on.
 * Shared by the Stats hook and the assistant's context gatherer so both read
 * the same columns the same way.
 */
import type { Tables } from "@/integrations/supabase/types";
import {
  APP_KINDS,
  type AppClass,
  type AppKind,
  type AppRule,
  type RuleField,
  type RuleMatchKind,
  type RuleSource,
  type UsageSession,
} from "@/lib/app-usage-classify";

export function asKind(v: string): AppKind {
  return (APP_KINDS as string[]).includes(v) ? (v as AppKind) : "neutral";
}

export function rowToClass(r: Tables<"app_classes">): AppClass {
  return {
    id: r.id,
    name: r.name,
    kind: asKind(r.kind),
    pillar_id: r.pillar_id,
    project_id: r.project_id,
    keywords: r.keywords || [],
    color: r.color,
    sort_order: r.sort_order,
    count_idle: r.count_idle,
    is_default: r.is_default,
  };
}

const FIELDS: RuleField[] = ["app", "app_key", "title"];
const MATCH_KINDS: RuleMatchKind[] = ["exact", "substring", "domain", "regex"];
const SOURCES: RuleSource[] = ["manual", "label", "learned", "suggested"];

export function rowToRule(r: Tables<"app_rules">): AppRule {
  return {
    id: r.id,
    field: FIELDS.includes(r.field as RuleField) ? (r.field as RuleField) : "app_key",
    match_kind: MATCH_KINDS.includes(r.match_kind as RuleMatchKind) ? (r.match_kind as RuleMatchKind) : "exact",
    pattern: r.pattern,
    class_id: r.class_id,
    project_id: r.project_id,
    priority: r.priority,
    source: SOURCES.includes(r.source as RuleSource) ? (r.source as RuleSource) : "manual",
    confidence: Number(r.confidence),
    enabled: r.enabled,
    hits: r.hits,
    created_at: r.created_at,
  };
}

export const SESSION_COLUMNS = "id,device_id,app,app_key,window_title,started_at,ended_at,seconds,idle,local_date";

export type SessionRow = Pick<
  Tables<"app_usage_sessions">,
  "id" | "device_id" | "app" | "app_key" | "window_title" | "started_at" | "ended_at" | "seconds" | "idle" | "local_date"
>;

export function rowToSession(r: SessionRow): UsageSession {
  return {
    id: r.id,
    device_id: r.device_id,
    app: r.app,
    app_key: r.app_key,
    window_title: r.window_title || "",
    started_at: r.started_at,
    ended_at: r.ended_at,
    seconds: r.seconds,
    idle: r.idle,
    local_date: r.local_date,
  };
}

export const DAILY_COLUMNS = "local_date,device_id,app,app_key,idle,seconds,session_count,last_seen_at";

export type DailyRow = Pick<
  Tables<"app_usage_daily">,
  "local_date" | "device_id" | "app" | "app_key" | "idle" | "seconds" | "session_count" | "last_seen_at"
>;

/**
 * A daily rollup row as a pseudo-session (no title, so title rules cannot
 * apply). Good enough for baselines and summaries, not for the timeline.
 */
export function dailyRowToSession(r: DailyRow): UsageSession | null {
  if (!r.local_date || !r.app_key) return null;
  return {
    id: `${r.local_date}|${r.device_id || ""}|${r.app_key}|${r.idle ? 1 : 0}`,
    device_id: r.device_id || "",
    app: r.app || r.app_key,
    app_key: r.app_key,
    window_title: "",
    started_at: r.last_seen_at || "",
    ended_at: r.last_seen_at || "",
    seconds: r.seconds || 0,
    idle: !!r.idle,
    local_date: r.local_date,
  };
}
