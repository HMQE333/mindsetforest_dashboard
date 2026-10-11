import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { useAuth } from "./useAuth";
import { useUserProjects } from "./useUserProjects";
import {
  classifyAll,
  competingRule,
  describeRule,
  planLabelWrite,
  type AppClass,
  type AppKind,
  type AppRule,
  type Classification,
  type ClassifyContext,
  type RuleField,
  type RuleMatchKind,
  type RuleSource,
  type UsageSession,
} from "@/lib/app-usage-classify";
import { DAILY_COLUMNS, SESSION_COLUMNS, dailyRowToSession, rowToClass, rowToRule, rowToSession } from "@/lib/app-usage-rows";
import { planGroupClaims, planLabelBatch, type LabelEntry, type LabelUndo } from "@/lib/app-usage-triage";

/**
 * Fired by any out-of-band writer (the assistant, a future AI classifier) after
 * it touches app_classes / app_rules, so the mounted section refetches. Same
 * pattern as PLANNING_TASKS_CHANGED_EVENT (see .agents/memory/cross-hook-sync.md).
 */
export const APP_USAGE_CHANGED_EVENT = "app-usage-changed";

export function notifyAppUsageChanged() {
  window.dispatchEvent(new CustomEvent(APP_USAGE_CHANGED_EVENT));
}

export interface UsageRange {
  /** Inclusive day keys (YYYY-MM-DD, 04:00 boundary). */
  from: string;
  to: string;
}

export interface LastSync {
  at: string;
  device: string;
}

export interface UseAppUsageOptions {
  /** False keeps every load idle (the section is collapsed); flip it once to start loading. */
  enabled?: boolean;
}

type PgError = { code?: string; message?: string } | null;

/** PostgREST hides a missing table behind PGRST205 ("could not find the table"). */
function isMissingTable(error: PgError): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /find the table|schema cache/i.test(error.message || "");
}

const PAGE_SIZE = 1000;
const MAX_ROWS = 60_000;
const DAILY_MAX_ROWS = 5000;

type SessionFilter = { from: string; to: string } | { dates: string[] };

/**
 * All session rows matching the filter, one page of 1000 at a time, returned
 * in started_at order. Pages are read newest first, so when a very long range
 * hits MAX_ROWS it is its oldest days that are left out, never today.
 */
async function fetchSessionPages(userId: string, filter: SessionFilter): Promise<{ rows: UsageSession[]; error: PgError; truncated?: boolean }> {
  const all: UsageSession[] = [];
  let offset = 0;
  let truncated = false;
  for (;;) {
    const base = supabase.from("app_usage_sessions").select(SESSION_COLUMNS).eq("user_id", userId);
    const filtered = "dates" in filter ? base.in("local_date", filter.dates) : base.gte("local_date", filter.from).lte("local_date", filter.to);
    const { data, error } = await filtered
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows: all.reverse(), error };
    const rows = data || [];
    for (const r of rows) {
      const s = rowToSession(r);
      if (s) all.push(s);
    }
    if (rows.length < PAGE_SIZE) break;
    if (all.length >= MAX_ROWS) { truncated = true; break; }
    offset += PAGE_SIZE;
  }
  return { rows: all.reverse(), error: null, truncated };
}

export interface ClassInput {
  name: string;
  kind: AppKind;
  pillar_id?: string | null;
  project_id?: string | null;
  keywords?: string[];
  color?: string | null;
  sort_order?: number;
  count_idle?: boolean;
  is_default?: boolean;
}

export interface RuleInput {
  field: RuleField;
  match_kind: RuleMatchKind;
  pattern: string;
  class_id: string;
  project_id?: string | null;
  priority?: number;
  source?: RuleSource;
  confidence?: number;
  enabled?: boolean;
}

/** Seeded once for a user with no classes at all. */
export const DEFAULT_CLASSES: ClassInput[] = [
  { name: "Praca nad projektem", kind: "work", keywords: ["Code", "GitHub", "Supabase", "Figma", "Terminal"], sort_order: 0 },
  { name: "Nauka", kind: "learning", pillar_id: "mind", keywords: ["docs", "tutorial", "kurs", "Udemy", "Coursera"], sort_order: 1 },
  { name: "Komunikacja", kind: "communication", pillar_id: "people", keywords: ["Discord", "Slack", "Gmail", "Messenger", "WhatsApp", "Teams"], sort_order: 2 },
  { name: "Oglądanie", kind: "watching", keywords: ["YouTube", "Netflix", "Twitch", "HBO"], count_idle: true, sort_order: 3 },
  { name: "Marnowanie czasu", kind: "waste", keywords: ["TikTok", "Instagram", "Reddit", "Facebook"], sort_order: 4 },
  { name: "Neutralne", kind: "neutral", keywords: ["Explorer", "Locked"], is_default: true, sort_order: 5 },
];

// --- batch writes (the triage dialog), outside the hook so they can be tested --

/**
 * Many labels in as few requests as possible. Keys with a hand-written rule
 * keep it and only move its target (planLabelWrite "update"), each its own
 * update; everything else is ONE array upsert at the label priority. The
 * undo lists the rows the upsert created (deleted on undo) and the previous
 * state of every rule it changed or overwrote (restored on undo). On a
 * failure the undo still covers what did get written.
 */
export async function writeLabelBatch(
  userId: string,
  rules: AppRule[],
  entries: LabelEntry[],
): Promise<{ undo: LabelUndo; error: PgError }> {
  const plan = planLabelBatch(rules, entries);
  const undo: LabelUndo = { keys: [], created: [], restore: [], classGroups: [] };
  let error: PgError = null;

  const updates = await Promise.all(
    plan.updates.map((u) =>
      supabase.from("app_rules").update({ class_id: u.classId, project_id: u.projectId }).eq("id", u.previous.id).eq("user_id", userId),
    ),
  );
  updates.forEach((res, i) => {
    if (res.error) {
      error = error || res.error;
      return;
    }
    undo.keys.push(plan.updates[i].appKey);
    undo.restore.push(plan.updates[i].previous);
  });

  if (plan.upserts.length > 0) {
    const payload: TablesInsert<"app_rules">[] = plan.upserts.map((u) => ({
      user_id: userId,
      field: "app_key",
      match_kind: "exact",
      pattern: u.appKey,
      class_id: u.classId,
      project_id: u.projectId,
      priority: plan.priority,
      source: "label",
      confidence: 1,
      enabled: true,
    }));
    const res = await supabase.from("app_rules").upsert(payload, { onConflict: "user_id,field,match_kind,pattern" }).select("id,pattern");
    if (res.error) {
      error = error || res.error;
    } else {
      const idByPattern = new Map((res.data || []).map((r) => [r.pattern, r.id]));
      for (const u of plan.upserts) {
        undo.keys.push(u.appKey);
        const id = idByPattern.get(u.appKey);
        // The rule it overwrote comes back on undo; a row that did not exist goes.
        if (u.previous && (!id || id === u.previous.id)) undo.restore.push(u.previous);
        else if (id) undo.created.push(id);
      }
    }
  }
  return { undo, error };
}

/** Each answered catalog group in exactly one class's catalog_groups: one update per class that changes. */
export async function writeGroupClaims(userId: string, classes: AppClass[], answers: Record<string, string>): Promise<PgError> {
  const changes = planGroupClaims(classes, answers);
  const results = await Promise.all(
    changes.map((c) => supabase.from("app_classes").update({ catalog_groups: c.after }).eq("id", c.id).eq("user_id", userId)),
  );
  return results.find((r) => r.error)?.error ?? null;
}

/** Undo of a batch: created rules deleted in one request, changed rules and class claims put back as they were. */
export async function revertLabels(userId: string, undo: LabelUndo): Promise<PgError> {
  const jobs: PromiseLike<{ error: PgError }>[] = [];
  if (undo.created.length > 0) jobs.push(supabase.from("app_rules").delete().in("id", undo.created).eq("user_id", userId));
  for (const r of undo.restore) {
    jobs.push(
      supabase
        .from("app_rules")
        .update({
          class_id: r.class_id,
          project_id: r.project_id,
          priority: r.priority,
          source: r.source,
          confidence: r.confidence,
          enabled: r.enabled,
        })
        .eq("id", r.id)
        .eq("user_id", userId),
    );
  }
  for (const c of undo.classGroups) {
    jobs.push(supabase.from("app_classes").update({ catalog_groups: c.catalog_groups }).eq("id", c.id).eq("user_id", userId));
  }
  const results = await Promise.all(jobs);
  return results.find((r) => r.error)?.error ?? null;
}

export function useAppUsage(range: UsageRange, options: UseAppUsageOptions = {}) {
  const enabled = options.enabled ?? true;
  const { user } = useAuth();
  const { projects } = useUserProjects();
  const [sessions, setSessions] = useState<UsageSession[]>([]);
  const [classes, setClasses] = useState<AppClass[]>([]);
  const [rules, setRules] = useState<AppRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(true);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const [vocabLoaded, setVocabLoaded] = useState(false);
  const seededRef = useRef(false);
  const userId = user?.id ?? null;

  // One counter per resource: only the latest request for that resource may
  // commit state, so a slow 30-day load cannot overwrite a later "today" load,
  // and two vocabulary refetches after quick edits cannot land out of order.
  const vocabReq = useRef(0);
  const sessionsReq = useRef(0);
  const syncReq = useRef(0);

  const guard = useCallback((error: PgError, what: string): boolean => {
    if (!error) return false;
    if (isMissingTable(error)) {
      setTableReady(false);
    } else {
      console.error(`${what} failed:`, error);
      toast.error(`Nie udało się: ${what}`);
    }
    return true;
  }, []);

  // --- reads -----------------------------------------------------------------

  /** Loads classes + rules. Commits only when still the latest request; always returns what it read. */
  const loadVocabulary = useCallback(async (): Promise<{ classes: AppClass[]; rules: AppRule[] } | null> => {
    if (!userId) return null;
    const id = ++vocabReq.current;
    const [classRes, ruleRes] = await Promise.all([
      supabase.from("app_classes").select("*").eq("user_id", userId).order("sort_order", { ascending: true }),
      supabase.from("app_rules").select("*").eq("user_id", userId).order("priority", { ascending: false }),
    ]);
    const latest = vocabReq.current === id;
    if (classRes.error || ruleRes.error) {
      if (latest) guard(classRes.error || ruleRes.error, classRes.error ? "wczytać klasy" : "wczytać reguły");
      return null;
    }
    const result = { classes: (classRes.data || []).map(rowToClass), rules: (ruleRes.data || []).map(rowToRule) };
    if (latest) {
      setTableReady(true);
      setClasses(result.classes);
      setRules(result.rules);
      setVocabLoaded(true);
    }
    return result;
  }, [userId, guard]);

  const loadSessions = useCallback(
    async (silent: boolean) => {
      if (!userId) return;
      const id = ++sessionsReq.current;
      if (!silent) setLoading(true);
      const { rows, error, truncated } = await fetchSessionPages(userId, { from: range.from, to: range.to });
      if (sessionsReq.current !== id) return; // a newer range or refetch owns the state now
      if (error) {
        guard(error, "wczytać sesje");
      } else {
        setTableReady(true);
        setSessions(rows);
        if (truncated && !silent) {
          toast.warning("This range is too long to load in full", {
            description: `Showing the newest ${rows.length.toLocaleString("en-US")} sessions, from ${rows[0]?.local_date ?? range.from}. Pick a shorter range to see earlier days.`,
          });
        }
      }
      setLoading(false);
    },
    [userId, range.from, range.to, guard],
  );

  const loadLastSync = useCallback(async () => {
    if (!userId) return;
    const id = ++syncReq.current;
    const { data, error } = await supabase
      .from("app_usage_sessions")
      .select("ended_at,device_id")
      .eq("user_id", userId)
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (syncReq.current !== id) return;
    if (error) {
      if (isMissingTable(error)) setTableReady(false);
      return;
    }
    setLastSync(data ? { at: data.ended_at, device: data.device_id } : null);
  }, [userId]);

  /** Silent full refresh (no loading flash): used by visibilitychange, the change event and the button. */
  const refetch = useCallback(async () => {
    if (!userId || !enabled) return;
    await Promise.all([loadVocabulary(), loadSessions(true), loadLastSync()]);
  }, [userId, enabled, loadVocabulary, loadSessions, loadLastSync]);

  useEffect(() => {
    if (!userId) {
      setSessions([]);
      setClasses([]);
      setRules([]);
      setLoading(false);
      return;
    }
    if (!enabled) return;
    loadVocabulary();
    loadLastSync();
  }, [userId, enabled, loadVocabulary, loadLastSync]);

  useEffect(() => {
    if (!userId || !enabled) return;
    loadSessions(false);
  }, [userId, enabled, loadSessions]);

  // The writer is another process: catch up whenever the tab comes back.
  useEffect(() => {
    if (!userId || !enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    const onChanged = () => refetch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(APP_USAGE_CHANGED_EVENT, onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(APP_USAGE_CHANGED_EVENT, onChanged);
    };
  }, [userId, enabled, refetch]);

  /** Full sessions (with titles) for a handful of dates: the weekday baseline. */
  const fetchSessionsForDates = useCallback(
    async (dates: string[]): Promise<UsageSession[]> => {
      if (!userId || dates.length === 0) return [];
      const { rows } = await fetchSessionPages(userId, { dates });
      return rows;
    },
    [userId],
  );

  /**
   * Daily rollup rows for a handful of dates as pseudo-sessions (no titles).
   * Capped at 5000 rows; the cap is logged rather than silently truncated.
   */
  const fetchDailyRows = useCallback(
    async (dates: string[]): Promise<UsageSession[]> => {
      if (!userId || dates.length === 0) return [];
      const { data, error } = await supabase
        .from("app_usage_daily")
        .select(DAILY_COLUMNS)
        .eq("user_id", userId)
        .in("local_date", dates)
        .order("local_date", { ascending: true })
        .order("app_key", { ascending: true })
        .range(0, DAILY_MAX_ROWS - 1);
      if (error || !data) return [];
      if (data.length >= DAILY_MAX_ROWS) console.warn(`app_usage_daily: ${DAILY_MAX_ROWS}-row cap hit for ${dates.join(",")}; totals are truncated`);
      const out: UsageSession[] = [];
      for (const r of data) {
        const s = dailyRowToSession(r);
        if (s) out.push(s);
      }
      return out;
    },
    [userId],
  );

  // --- seeding -----------------------------------------------------------------

  const seedDefaultClasses = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    const payload: TablesInsert<"app_classes">[] = DEFAULT_CLASSES.map((c) => ({
      user_id: userId,
      name: c.name,
      kind: c.kind,
      pillar_id: c.pillar_id ?? null,
      project_id: c.project_id ?? null,
      keywords: c.keywords ?? [],
      color: c.color ?? null,
      sort_order: c.sort_order ?? 0,
      count_idle: c.count_idle ?? false,
      is_default: c.is_default ?? false,
    }));
    const { error } = await supabase.from("app_classes").insert(payload);
    if (error) {
      // A concurrent seed (second tab) trips the unique name: not an error worth showing.
      if (error.code !== "23505") guard(error, "utworzyć domyślne klasy");
      await loadVocabulary();
      return false;
    }
    await loadVocabulary();
    return true;
  }, [userId, guard, loadVocabulary]);

  useEffect(() => {
    if (!userId || !enabled || loading || !tableReady || !vocabLoaded || seededRef.current) return;
    if (classes.length > 0) return;
    seededRef.current = true;
    seedDefaultClasses();
  }, [userId, enabled, loading, tableReady, vocabLoaded, classes.length, seedDefaultClasses]);

  // --- classes -----------------------------------------------------------------

  const createClass = useCallback(
    async (input: ClassInput): Promise<AppClass | null> => {
      if (!userId) return null;
      const payload: TablesInsert<"app_classes"> = {
        user_id: userId,
        name: input.name.trim(),
        kind: input.kind,
        pillar_id: input.pillar_id ?? null,
        project_id: input.project_id ?? null,
        keywords: input.keywords ?? [],
        color: input.color ?? null,
        sort_order: input.sort_order ?? classes.length,
        count_idle: input.count_idle ?? input.kind === "watching",
        is_default: input.is_default ?? false,
      };
      const { data, error } = await supabase.from("app_classes").insert(payload).select("*").single();
      if (error || !data) {
        guard(error, "utworzyć klasę");
        return null;
      }
      await loadVocabulary();
      return rowToClass(data);
    },
    [userId, classes.length, guard, loadVocabulary],
  );

  const updateClass = useCallback(
    async (id: string, patch: Partial<ClassInput>): Promise<boolean> => {
      if (!userId) return false;
      const update: TablesUpdate<"app_classes"> = {};
      if (patch.name !== undefined) update.name = patch.name.trim();
      if (patch.kind !== undefined) update.kind = patch.kind;
      if (patch.pillar_id !== undefined) update.pillar_id = patch.pillar_id;
      if (patch.project_id !== undefined) update.project_id = patch.project_id;
      if (patch.keywords !== undefined) update.keywords = patch.keywords;
      if (patch.color !== undefined) update.color = patch.color;
      if (patch.sort_order !== undefined) update.sort_order = patch.sort_order;
      if (patch.count_idle !== undefined) update.count_idle = patch.count_idle;
      if (patch.is_default !== undefined) update.is_default = patch.is_default;
      const { error } = await supabase.from("app_classes").update(update).eq("id", id).eq("user_id", userId);
      if (error) {
        guard(error, "zapisać klasę");
        return false;
      }
      await loadVocabulary();
      return true;
    },
    [userId, guard, loadVocabulary],
  );

  const deleteClass = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) return false;
      const { error } = await supabase.from("app_classes").delete().eq("id", id).eq("user_id", userId);
      if (error) {
        guard(error, "usunąć klasę");
        return false;
      }
      await loadVocabulary();
      return true;
    },
    [userId, guard, loadVocabulary],
  );

  // --- rules -------------------------------------------------------------------

  const createRule = useCallback(
    async (input: RuleInput): Promise<AppRule | null> => {
      if (!userId) return null;
      const payload: TablesInsert<"app_rules"> = {
        user_id: userId,
        field: input.field,
        match_kind: input.match_kind,
        pattern: input.pattern.trim(),
        class_id: input.class_id,
        project_id: input.project_id ?? null,
        priority: input.priority ?? 0,
        source: input.source ?? "manual",
        confidence: input.confidence ?? 1,
        enabled: input.enabled ?? true,
      };
      const { data, error } = await supabase.from("app_rules").insert(payload).select("*").single();
      if (error || !data) {
        if (error?.code === "23505") toast.error("Taka reguła już istnieje");
        else guard(error, "utworzyć regułę");
        return null;
      }
      await loadVocabulary();
      return rowToRule(data);
    },
    [userId, guard, loadVocabulary],
  );

  const updateRule = useCallback(
    async (id: string, patch: Partial<RuleInput>): Promise<boolean> => {
      if (!userId) return false;
      const update: TablesUpdate<"app_rules"> = {};
      if (patch.field !== undefined) update.field = patch.field;
      if (patch.match_kind !== undefined) update.match_kind = patch.match_kind;
      if (patch.pattern !== undefined) update.pattern = patch.pattern.trim();
      if (patch.class_id !== undefined) update.class_id = patch.class_id;
      if (patch.project_id !== undefined) update.project_id = patch.project_id;
      if (patch.priority !== undefined) update.priority = patch.priority;
      if (patch.source !== undefined) update.source = patch.source;
      if (patch.confidence !== undefined) update.confidence = patch.confidence;
      if (patch.enabled !== undefined) update.enabled = patch.enabled;
      const { error } = await supabase.from("app_rules").update(update).eq("id", id).eq("user_id", userId);
      if (error) {
        if (error.code === "23505") toast.error("Taka reguła już istnieje");
        else guard(error, "zapisać regułę");
        return false;
      }
      await loadVocabulary();
      return true;
    },
    [userId, guard, loadVocabulary],
  );

  const deleteRule = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) return false;
      const { error } = await supabase.from("app_rules").delete().eq("id", id).eq("user_id", userId);
      if (error) {
        guard(error, "usunąć regułę");
        return false;
      }
      await loadVocabulary();
      return true;
    },
    [userId, guard, loadVocabulary],
  );

  const projectRefs = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name })), [projects]);

  /**
   * One-click assignment of a key. A hand-written (manual) rule for the same
   * key keeps its source and priority and only changes target; otherwise an
   * exact app_key rule is upserted with source "label" at the label priority.
   * If a higher-priority rule still decides for this key afterwards, the toast
   * names it instead of letting the folder silently snap back.
   */
  const labelKey = useCallback(
    async (appKey: string, classId: string, projectId?: string | null): Promise<boolean> => {
      if (!userId) return false;
      const plan = planLabelWrite(rules, appKey);
      let error: PgError = null;
      if (plan.mode === "update") {
        const res = await supabase
          .from("app_rules")
          .update({ class_id: classId, project_id: projectId ?? null })
          .eq("id", plan.ruleId)
          .eq("user_id", userId);
        error = res.error;
      } else {
        const payload: TablesInsert<"app_rules"> = {
          user_id: userId,
          field: "app_key",
          match_kind: "exact",
          pattern: appKey,
          class_id: classId,
          project_id: projectId ?? null,
          priority: plan.priority,
          source: "label",
          confidence: 1,
          enabled: true,
        };
        const res = await supabase.from("app_rules").upsert(payload, { onConflict: "user_id,field,match_kind,pattern" });
        error = res.error;
      }
      if (error) {
        guard(error, "przypisać klasę");
        return false;
      }
      const fresh = await loadVocabulary();
      if (fresh) {
        const sample = sessions.find((s) => s.app_key === appKey && !s.idle) || sessions.find((s) => s.app_key === appKey);
        if (sample) {
          const winner = competingRule(sample, { classes: fresh.classes, rules: fresh.rules, projects: projectRefs }, classId);
          if (winner) {
            toast.warning(`Nadal wygrywa reguła o wyższym priorytecie (${winner.priority}): ${describeRule(winner)}. Zmień ją w zakładce Aplikacje.`);
          }
        }
      }
      return true;
    },
    [userId, rules, sessions, projectRefs, guard, loadVocabulary],
  );

  /**
   * Many labels at once (the triage dialog): writeLabelBatch, then ONE
   * vocabulary refetch, and one warning naming a higher-priority rule that
   * still wins for some key. Returns what "Cofnij" needs (null when nothing
   * was written).
   */
  const labelKeys = useCallback(
    async (entries: LabelEntry[]): Promise<LabelUndo | null> => {
      if (!userId || entries.length === 0) return null;
      const { undo, error } = await writeLabelBatch(userId, rules, entries);
      if (error) guard(error, "przypisać klasy");
      if (undo.keys.length === 0) return null;

      const fresh = await loadVocabulary();
      if (fresh) {
        const chosen = new Map(entries.map((e) => [e.appKey, e.classId]));
        const winners: AppRule[] = [];
        for (const key of undo.keys) {
          const sample = sessions.find((s) => s.app_key === key && !s.idle) || sessions.find((s) => s.app_key === key);
          if (!sample) continue;
          const winner = competingRule(sample, { classes: fresh.classes, rules: fresh.rules, projects: projectRefs }, chosen.get(key) || "");
          if (winner && !winners.some((w) => w.id === winner.id)) winners.push(winner);
        }
        if (winners.length > 0) {
          const w = winners[0];
          toast.warning(
            `Nadal wygrywa reguła o wyższym priorytecie (${w.priority}): ${describeRule(w)}` +
              (winners.length > 1 ? ` i ${winners.length - 1} inne` : "") +
              ". Zmień ją w zakładce Aplikacje.",
          );
        }
      }
      return undo;
    },
    [userId, rules, sessions, projectRefs, guard, loadVocabulary],
  );

  /**
   * The answers to the triage questions (writeGroupClaims), then one
   * vocabulary refetch.
   */
  const claimCatalogGroups = useCallback(
    async (answers: Record<string, string>): Promise<boolean> => {
      if (!userId) return false;
      if (planGroupClaims(classes, answers).length === 0) return true;
      const failed = await writeGroupClaims(userId, classes, answers);
      if (failed) {
        if (failed.code === "PGRST204" || failed.code === "42703") {
          toast.error("Brak kolumny catalog_groups: uruchom migrację 20261010120000_usage_categorize.sql");
        } else {
          guard(failed, "zapisać odpowiedzi");
        }
      }
      await loadVocabulary();
      return !failed;
    },
    [userId, classes, guard, loadVocabulary],
  );

  /** "Cofnij" after labelKeys / claimCatalogGroups (revertLabels), then one vocabulary refetch. */
  const undoLabels = useCallback(
    async (undo: LabelUndo): Promise<boolean> => {
      if (!userId) return false;
      const failed = await revertLabels(userId, undo);
      if (failed) guard(failed, "cofnąć przypisania");
      await loadVocabulary();
      return !failed;
    },
    [userId, guard, loadVocabulary],
  );

  const acceptSuggestion = useCallback(
    async (ruleId: string): Promise<boolean> => updateRule(ruleId, { source: "learned", enabled: true }),
    [updateRule],
  );

  const rejectSuggestion = useCallback(async (ruleId: string): Promise<boolean> => deleteRule(ruleId), [deleteRule]);

  // --- derived -----------------------------------------------------------------

  const ctx = useMemo<ClassifyContext>(() => ({ classes, rules, projects: projectRefs }), [classes, rules, projectRefs]);

  const classifications = useMemo<Classification[]>(() => classifyAll(sessions, ctx), [sessions, ctx]);

  const devices = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) set.add(s.device_id);
    if (lastSync) set.add(lastSync.device);
    return [...set].sort();
  }, [sessions, lastSync]);

  const suggestions = useMemo(() => rules.filter((r) => r.source === "suggested"), [rules]);

  return {
    userId,
    sessions,
    classes,
    rules,
    suggestions,
    classifications,
    ctx,
    projects: projectRefs,
    loading,
    tableReady,
    lastSync,
    lastSyncAt: lastSync?.at ?? null,
    devices,
    refetch,
    fetchDailyRows,
    fetchSessionsForDates,
    seedDefaultClasses,
    createClass,
    updateClass,
    deleteClass,
    createRule,
    updateRule,
    deleteRule,
    labelKey,
    labelKeys,
    claimCatalogGroups,
    undoLabels,
    acceptSuggestion,
    rejectSuggestion,
  };
}
