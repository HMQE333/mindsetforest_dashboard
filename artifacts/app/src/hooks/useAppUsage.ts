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

/** All session rows matching the filter, one page of 1000 at a time, in started_at order. */
async function fetchSessionPages(userId: string, filter: SessionFilter): Promise<{ rows: UsageSession[]; error: PgError }> {
  const all: UsageSession[] = [];
  let offset = 0;
  for (;;) {
    const base = supabase.from("app_usage_sessions").select(SESSION_COLUMNS).eq("user_id", userId);
    const filtered = "dates" in filter ? base.in("local_date", filter.dates) : base.gte("local_date", filter.from).lte("local_date", filter.to);
    const { data, error } = await filtered
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) return { rows: all, error };
    const rows = data || [];
    for (const r of rows) {
      const s = rowToSession(r);
      if (s) all.push(s);
    }
    if (rows.length < PAGE_SIZE || all.length >= MAX_ROWS) break;
    offset += PAGE_SIZE;
  }
  return { rows: all, error: null };
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
      const { rows, error } = await fetchSessionPages(userId, { from: range.from, to: range.to });
      if (sessionsReq.current !== id) return; // a newer range or refetch owns the state now
      if (error) {
        guard(error, "wczytać sesje");
      } else {
        setTableReady(true);
        setSessions(rows);
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
    acceptSuggestion,
    rejectSuggestion,
  };
}
