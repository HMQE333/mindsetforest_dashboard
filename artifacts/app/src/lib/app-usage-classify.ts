/**
 * Computer time: classification and aggregation (pure, no I/O).
 *
 * The desktop agent names things (`app`, `app_key`, `window_title`); the web
 * decides what they mean. `classifySession` is the whole decision procedure,
 * in a fixed order that never calls a model:
 *
 *   (a) enabled rules, priority first (a `suggested` rule never classifies)
 *   (b) class keywords and project names found as whole words
 *   (c) a per-app prior computed from what (a) and (b) already decided
 *   (d) unassigned
 *
 * Everything the UI shows (tiles, donut, folders, focus ratio) comes out of
 * `aggregateUsage`, so a session is counted in exactly one place.
 */

export type AppKind = "work" | "learning" | "communication" | "waste" | "neutral" | "watching";

export const APP_KINDS: AppKind[] = ["work", "learning", "communication", "watching", "waste", "neutral"];

/** Kinds whose time is "productive" for the focus ratio. */
export const PRODUCTIVE_KINDS: AppKind[] = ["work", "learning"];

export type RuleField = "app" | "app_key" | "title";
export type RuleMatchKind = "exact" | "substring" | "domain" | "regex";
export type RuleSource = "manual" | "label" | "learned" | "suggested";

export interface UsageSession {
  id: string;
  device_id: string;
  app: string;
  app_key: string;
  window_title: string;
  started_at: string;
  ended_at: string;
  seconds: number;
  idle: boolean;
  local_date: string;
}

export interface AppClass {
  id: string;
  name: string;
  kind: AppKind;
  pillar_id: string | null;
  project_id: string | null;
  keywords: string[];
  color: string | null;
  sort_order: number;
  count_idle: boolean;
  is_default: boolean;
}

export interface AppRule {
  id: string;
  field: RuleField;
  match_kind: RuleMatchKind;
  pattern: string;
  class_id: string;
  project_id: string | null;
  priority: number;
  source: RuleSource;
  confidence: number;
  enabled: boolean;
  hits: number;
  created_at: string;
}

export interface ProjectRef {
  id: string;
  name: string;
}

export interface AppPrior {
  classId: string;
  /** Share (0..1) of the app's already-classified time that went to classId. */
  share: number;
}

export interface ClassifyContext {
  classes: AppClass[];
  rules: AppRule[];
  projects?: ProjectRef[];
  /** Per-app prior, keyed by `app_key` or `app` (the key is tried first). */
  priors?: Record<string, AppPrior>;
}

export type ClassificationSource = "rule" | "keyword" | "prior" | "none";

export interface Classification {
  classId: string | null;
  projectId: string | null;
  confidence: number;
  source: ClassificationSource;
  /** Short human-readable reason shown in the "why" tooltip. */
  why: string;
  /** The rule that decided, when source is "rule". */
  ruleId?: string;
}

export const PRIOR_MIN_SHARE = 0.7;
export const KEYWORD_CONFIDENCE = 0.75;

// ---------------------------------------------------------------------------
// Rule preparation (sorted once, regexes compiled once)
// ---------------------------------------------------------------------------

const SOURCE_RANK: Record<string, number> = { manual: 0, label: 1, learned: 2 };
const MATCH_RANK: Record<string, number> = { exact: 0, domain: 1, substring: 2, regex: 3 };

interface PreparedRule {
  rule: AppRule;
  pattern: string; // lower-cased for exact/substring, normalised host for domain
  regex: RegExp | null;
  invalid: boolean;
}

const preparedCache = new WeakMap<AppRule[], PreparedRule[]>();

function normaliseDomain(pattern: string): string {
  return pattern
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

export function prepareRules(rules: AppRule[]): PreparedRule[] {
  const cached = preparedCache.get(rules);
  if (cached) return cached;
  const usable = rules.filter((r) => r.enabled && r.source !== "suggested" && r.pattern.trim() !== "");
  usable.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    const sa = SOURCE_RANK[a.source] ?? 9;
    const sb = SOURCE_RANK[b.source] ?? 9;
    if (sa !== sb) return sa - sb;
    const ma = MATCH_RANK[a.match_kind] ?? 9;
    const mb = MATCH_RANK[b.match_kind] ?? 9;
    if (ma !== mb) return ma - mb;
    return a.created_at.localeCompare(b.created_at);
  });
  const prepared: PreparedRule[] = usable.map((rule) => {
    if (rule.match_kind === "regex") {
      try {
        return { rule, pattern: rule.pattern, regex: new RegExp(rule.pattern, "i"), invalid: false };
      } catch {
        return { rule, pattern: rule.pattern, regex: null, invalid: true };
      }
    }
    if (rule.match_kind === "domain") {
      return { rule, pattern: normaliseDomain(rule.pattern), regex: null, invalid: false };
    }
    return { rule, pattern: rule.pattern.trim().toLowerCase(), regex: null, invalid: false };
  });
  preparedCache.set(rules, prepared);
  return prepared;
}

/** True when the regex of this rule could not be compiled (shown in the rules list). */
export function isInvalidRegexRule(rule: AppRule): boolean {
  if (rule.match_kind !== "regex") return false;
  try {
    new RegExp(rule.pattern, "i");
    return false;
  } catch {
    return true;
  }
}

function fieldValue(session: UsageSession, field: RuleField): string {
  if (field === "app") return session.app;
  if (field === "title") return session.window_title;
  return session.app_key;
}

const HOST_RE = /([a-z0-9-]+\.)+[a-z]{2,}/g;
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/** Whole-word occurrence of `needle` (already lower-cased) inside `hay` (lower-cased). */
function hasWholeWord(hay: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx === 0 ? "" : hay[idx - 1];
    const after = idx + needle.length >= hay.length ? "" : hay[idx + needle.length];
    const leftOk = before === "" || !WORD_CHAR.test(before);
    const rightOk = after === "" || !WORD_CHAR.test(after);
    if (leftOk && rightOk) return true;
    from = idx + 1;
  }
}

/**
 * Domain match: the value contains a host that is the pattern or a subdomain
 * of it. A pattern without a dot ("youtube") matches any host label, and a
 * value with no host at all falls back to a whole-word match, so
 * "Browser | YouTube" still matches a "youtube" domain rule.
 */
function matchesDomain(value: string, pattern: string): boolean {
  if (!pattern) return false;
  const hay = value.toLowerCase();
  const hosts = hay.match(HOST_RE) || [];
  if (hosts.length > 0) {
    for (const h of hosts) {
      const host = h.replace(/^www\./, "");
      if (pattern.includes(".")) {
        if (host === pattern || host.endsWith("." + pattern)) return true;
      } else if (host.split(".").includes(pattern)) {
        return true;
      }
    }
  }
  return hasWholeWord(hay, pattern);
}

export function ruleMatches(prepared: PreparedRule, session: UsageSession): boolean {
  if (prepared.invalid) return false;
  const value = fieldValue(session, prepared.rule.field);
  switch (prepared.rule.match_kind) {
    case "exact":
      return value.trim().toLowerCase() === prepared.pattern;
    case "substring":
      return prepared.pattern !== "" && value.toLowerCase().includes(prepared.pattern);
    case "domain":
      return matchesDomain(value, prepared.pattern);
    case "regex": {
      if (!prepared.regex) return false;
      try {
        prepared.regex.lastIndex = 0;
        return prepared.regex.test(value);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/** Which of the given sessions a rule would match. Used by the "Testuj wzorzec" box. */
export function testRule(
  rule: Pick<AppRule, "field" | "match_kind" | "pattern">,
  sessions: UsageSession[],
): UsageSession[] {
  const full: AppRule = {
    id: "test",
    class_id: "",
    project_id: null,
    priority: 0,
    source: "manual",
    confidence: 1,
    enabled: true,
    hits: 0,
    created_at: "",
    ...rule,
  };
  const prepared = prepareRules([full])[0];
  if (!prepared) return [];
  return sessions.filter((s) => ruleMatches(prepared, s));
}

// ---------------------------------------------------------------------------
// Keyword index
// ---------------------------------------------------------------------------

interface KeywordEntry {
  needle: string;
  classId: string | null;
  projectId: string | null;
  label: string;
}

interface KeywordIndex {
  classKeywords: KeywordEntry[];
  projectNames: KeywordEntry[];
  defaultWorkClassId: string | null;
  classByProject: Map<string, string>;
}

const keywordCache = new WeakMap<AppClass[], WeakMap<ProjectRef[], KeywordIndex>>();
const NO_PROJECTS: ProjectRef[] = [];

function buildKeywordIndex(classes: AppClass[], projects: ProjectRef[]): KeywordIndex {
  let byProjects = keywordCache.get(classes);
  if (!byProjects) {
    byProjects = new WeakMap();
    keywordCache.set(classes, byProjects);
  }
  const cached = byProjects.get(projects);
  if (cached) return cached;

  const sorted = [...classes].sort((a, b) => a.sort_order - b.sort_order);
  const classKeywords: KeywordEntry[] = [];
  const classByProject = new Map<string, string>();
  for (const c of sorted) {
    if (c.project_id && !classByProject.has(c.project_id)) classByProject.set(c.project_id, c.id);
    for (const kw of c.keywords || []) {
      const needle = kw.trim().toLowerCase();
      if (needle) classKeywords.push({ needle, classId: c.id, projectId: c.project_id, label: kw.trim() });
    }
  }
  const projectNames: KeywordEntry[] = projects
    .map((p) => ({ needle: p.name.trim().toLowerCase(), classId: null, projectId: p.id, label: p.name.trim() }))
    .filter((e) => e.needle.length >= 2);
  const defaultWork = sorted.find((c) => c.kind === "work");
  const index: KeywordIndex = {
    classKeywords,
    projectNames,
    defaultWorkClassId: defaultWork ? defaultWork.id : null,
    classByProject,
  };
  byProjects.set(projects, index);
  return index;
}

// ---------------------------------------------------------------------------
// classifySession
// ---------------------------------------------------------------------------

const MATCH_LABEL: Record<RuleMatchKind, string> = {
  exact: "dokładnie",
  substring: "zawiera",
  domain: "domena",
  regex: "regex",
};

const FIELD_LABEL: Record<RuleField, string> = {
  app: "aplikacja",
  app_key: "klucz",
  title: "tytuł",
};

const SOURCE_LABEL: Record<RuleSource, string> = {
  manual: "ręczna",
  label: "z etykiety",
  learned: "wyuczona",
  suggested: "propozycja",
};

export function describeRule(rule: Pick<AppRule, "field" | "match_kind" | "pattern" | "source">): string {
  return `${FIELD_LABEL[rule.field] || rule.field} ${MATCH_LABEL[rule.match_kind] || rule.match_kind} "${rule.pattern}" (reguła ${SOURCE_LABEL[rule.source] || rule.source})`;
}

const NONE: Classification = { classId: null, projectId: null, confidence: 0, source: "none", why: "Brak reguły i słowa kluczowego" };

export function classifySession(session: UsageSession, ctx: ClassifyContext): Classification {
  // (a) rules
  for (const p of prepareRules(ctx.rules)) {
    if (!ruleMatches(p, session)) continue;
    const r = p.rule;
    const confidence = r.source === "learned" ? Math.max(0, Math.min(1, r.confidence)) : 1;
    return {
      classId: r.class_id,
      projectId: r.project_id,
      confidence,
      source: "rule",
      why: describeRule(r),
      ruleId: r.id,
    };
  }

  // (b) keywords: class keywords first, then project names
  const index = buildKeywordIndex(ctx.classes, ctx.projects || NO_PROJECTS);
  const text = `${session.app_key} ${session.window_title}`.toLowerCase();
  for (const kw of index.classKeywords) {
    if (!hasWholeWord(text, kw.needle)) continue;
    let projectId = kw.projectId;
    if (!projectId) {
      const proj = index.projectNames.find((p) => hasWholeWord(text, p.needle));
      if (proj) projectId = proj.projectId;
    }
    return {
      classId: kw.classId,
      projectId,
      confidence: KEYWORD_CONFIDENCE,
      source: "keyword",
      why: `Słowo kluczowe "${kw.label}"`,
    };
  }
  for (const proj of index.projectNames) {
    if (!hasWholeWord(text, proj.needle)) continue;
    const classId = (proj.projectId && index.classByProject.get(proj.projectId)) || index.defaultWorkClassId;
    if (!classId) continue;
    return {
      classId,
      projectId: proj.projectId,
      confidence: KEYWORD_CONFIDENCE,
      source: "keyword",
      why: `Nazwa projektu "${proj.label}" w tytule`,
    };
  }

  // (c) per-app prior
  if (ctx.priors) {
    const prior = ctx.priors[session.app_key] || ctx.priors[session.app];
    if (prior && prior.share >= PRIOR_MIN_SHARE) {
      return {
        classId: prior.classId,
        projectId: null,
        confidence: Math.round((0.55 + 0.15 * prior.share) * 1000) / 1000,
        source: "prior",
        why: `Historia: ${Math.round(prior.share * 100)}% czasu tej aplikacji w tej klasie`,
      };
    }
  }

  // (d)
  return NONE;
}

/**
 * Priors from what rules and keywords already decided: for each app (and
 * app_key) the class that took the largest share of its classified time.
 * Feed the result back through `ctx.priors` for a second pass over the
 * sessions that stayed unassigned.
 */
export function computeAppPriors(sessions: UsageSession[], classifications: Classification[]): Record<string, AppPrior> {
  const perKey = new Map<string, Map<string, number>>();
  const add = (key: string, classId: string, seconds: number) => {
    let m = perKey.get(key);
    if (!m) {
      m = new Map();
      perKey.set(key, m);
    }
    m.set(classId, (m.get(classId) || 0) + seconds);
  };
  sessions.forEach((s, i) => {
    const c = classifications[i];
    if (!c || !c.classId || (c.source !== "rule" && c.source !== "keyword")) return;
    add(s.app, c.classId, s.seconds);
    if (s.app_key !== s.app) add(s.app_key, c.classId, s.seconds);
  });
  const out: Record<string, AppPrior> = {};
  for (const [key, m] of perKey) {
    let total = 0;
    let best: [string, number] | null = null;
    for (const [classId, secs] of m) {
      total += secs;
      if (!best || secs > best[1]) best = [classId, secs];
    }
    if (best && total > 0) out[key] = { classId: best[0], share: best[1] / total };
  }
  return out;
}

/** Two-pass classification: rules + keywords, then priors for what is left. */
export function classifyAll(sessions: UsageSession[], ctx: ClassifyContext): Classification[] {
  const base: ClassifyContext = { classes: ctx.classes, rules: ctx.rules, projects: ctx.projects };
  const first = sessions.map((s) => classifySession(s, base));
  const priors = { ...computeAppPriors(sessions, first), ...(ctx.priors || {}) };
  const withPriors: ClassifyContext = { ...base, priors };
  return first.map((c, i) => (c.source === "none" ? classifySession(sessions[i], withPriors) : c));
}

// ---------------------------------------------------------------------------
// aggregateUsage
// ---------------------------------------------------------------------------

export type KindSeconds = Record<AppKind, number>;

export function emptyKinds(): KindSeconds {
  return { work: 0, learning: 0, communication: 0, waste: 0, neutral: 0, watching: 0 };
}

export interface AppKeyTotal {
  appKey: string;
  app: string;
  seconds: number;
  sessions: number;
  /** Up to three distinct titles, most time first. */
  titles: string[];
  /** Dominant class (by seconds) or null when mostly unassigned. */
  classId: string | null;
  kind: AppKind | null;
  /** Seconds per class id ("" for unassigned). */
  classSeconds: Record<string, number>;
  /** How the dominant classification was reached. */
  source: ClassificationSource;
  why: string;
  confidence: number;
}

export interface DaySeries {
  date: string;
  byKind: KindSeconds;
  unclassified: number;
  total: number;
  focusRatio: number | null;
}

export interface UsageAggregate {
  /** Counted seconds (non-idle, plus idle in count_idle classes). */
  totalSeconds: number;
  byKind: KindSeconds;
  byClass: Record<string, number>;
  byProject: Record<string, number>;
  byPillar: Record<string, number>;
  byAppKey: Record<string, AppKeyTotal>;
  byDay: DaySeries[];
  unclassifiedSeconds: number;
  /** Idle time that was not counted anywhere (away from the keyboard). */
  idleSeconds: number;
  topAppKeys: AppKeyTotal[];
  /** (work + learning) / (all non-idle, non-neutral time), null when nothing to divide. */
  focusRatio: number | null;
  sessionCount: number;
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

export function aggregateUsage(
  sessions: UsageSession[],
  classes: AppClass[],
  classifications: Classification[],
): UsageAggregate {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const byKind = emptyKinds();
  const byClass: Record<string, number> = {};
  const byProject: Record<string, number> = {};
  const byPillar: Record<string, number> = {};
  const keyAcc = new Map<
    string,
    { total: AppKeyTotal; titles: Map<string, number>; best: { seconds: number; c: Classification } | null; classSec: Map<string, { s: number; c: Classification }> }
  >();
  const dayAcc = new Map<string, { byKind: KindSeconds; unclassified: number; total: number; focusNum: number; focusDen: number }>();
  let totalSeconds = 0;
  let unclassifiedSeconds = 0;
  let idleSeconds = 0;
  let focusNum = 0;
  let focusDen = 0;

  sessions.forEach((s, i) => {
    const c = classifications[i] || NONE;
    const cls = c.classId ? classById.get(c.classId) : undefined;
    const counted = !s.idle || (cls ? cls.count_idle : false);
    if (!counted) {
      idleSeconds += s.seconds;
      return;
    }
    const secs = s.seconds;
    totalSeconds += secs;
    const kind: AppKind | null = cls ? cls.kind : null;

    if (cls) {
      byKind[cls.kind] = (byKind[cls.kind] || 0) + secs;
      byClass[cls.id] = (byClass[cls.id] || 0) + secs;
      if (cls.pillar_id) byPillar[cls.pillar_id] = (byPillar[cls.pillar_id] || 0) + secs;
    } else {
      unclassifiedSeconds += secs;
    }
    const projectId = c.projectId || (cls ? cls.project_id : null);
    if (projectId) byProject[projectId] = (byProject[projectId] || 0) + secs;

    // focus ratio: non-idle, non-neutral
    let fn = 0;
    let fd = 0;
    if (!s.idle && kind !== "neutral") {
      fd = secs;
      if (kind && PRODUCTIVE_KINDS.includes(kind)) fn = secs;
    }
    focusNum += fn;
    focusDen += fd;

    // per day
    let day = dayAcc.get(s.local_date);
    if (!day) {
      day = { byKind: emptyKinds(), unclassified: 0, total: 0, focusNum: 0, focusDen: 0 };
      dayAcc.set(s.local_date, day);
    }
    day.total += secs;
    if (kind) day.byKind[kind] += secs;
    else day.unclassified += secs;
    day.focusNum += fn;
    day.focusDen += fd;

    // per app_key
    let acc = keyAcc.get(s.app_key);
    if (!acc) {
      acc = {
        total: {
          appKey: s.app_key,
          app: s.app,
          seconds: 0,
          sessions: 0,
          titles: [],
          classId: null,
          kind: null,
          classSeconds: {},
          source: "none",
          why: NONE.why,
          confidence: 0,
        },
        titles: new Map(),
        best: null,
        classSec: new Map(),
      };
      keyAcc.set(s.app_key, acc);
    }
    acc.total.seconds += secs;
    acc.total.sessions += 1;
    if (s.window_title) acc.titles.set(s.window_title, (acc.titles.get(s.window_title) || 0) + secs);
    const ck = c.classId || "";
    const cur = acc.classSec.get(ck);
    if (cur) cur.s += secs;
    else acc.classSec.set(ck, { s: secs, c });
  });

  const byAppKey: Record<string, AppKeyTotal> = {};
  for (const [key, acc] of keyAcc) {
    const t = acc.total;
    t.titles = [...acc.titles.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([title]) => title);
    let best: { k: string; s: number; c: Classification } | null = null;
    for (const [k, v] of acc.classSec) {
      t.classSeconds[k] = v.s;
      if (!best || v.s > best.s) best = { k, s: v.s, c: v.c };
    }
    if (best) {
      t.classId = best.k || null;
      const cls = t.classId ? classById.get(t.classId) : undefined;
      t.kind = cls ? cls.kind : null;
      t.source = best.c.source;
      t.why = best.c.why;
      t.confidence = best.c.confidence;
    }
    byAppKey[key] = t;
  }
  const topAppKeys = Object.values(byAppKey).sort((a, b) => b.seconds - a.seconds);

  const byDay: DaySeries[] = [...dayAcc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      byKind: d.byKind,
      unclassified: d.unclassified,
      total: d.total,
      focusRatio: ratio(d.focusNum, d.focusDen),
    }));

  return {
    totalSeconds,
    byKind,
    byClass,
    byProject,
    byPillar,
    byAppKey,
    byDay,
    unclassifiedSeconds,
    idleSeconds,
    topAppKeys,
    focusRatio: ratio(focusNum, focusDen),
    sessionCount: sessions.length,
  };
}

// ---------------------------------------------------------------------------
// proposeRule: after a manual label, suggest something broader
// ---------------------------------------------------------------------------

export interface RuleProposal {
  field: RuleField;
  match_kind: RuleMatchKind;
  pattern: string;
  class_id: string;
  project_id: string | null;
  /** Polish, shown in the "Zawsze traktuj X jako Y?" banner. */
  reason: string;
}

export interface LabelRecord {
  appKey: string;
  app: string;
  classId: string;
}

export interface ProposeHistory {
  /** Display name (`app`) of the key that was just labelled. */
  app: string;
  /** Existing label rules (may include the one just written). */
  labels: LabelRecord[];
  projects?: ProjectRef[];
  /** Recent titles seen for the labelled key. */
  titles?: string[];
  /** Rules that already exist, so the proposal is never a duplicate. */
  existingRules?: Pick<AppRule, "field" | "match_kind" | "pattern">[];
}

/** "Browser | YouTube" -> "YouTube"; "Code | mindsetforest" -> null (only browser keys carry a site). */
export function siteToken(appKey: string): string | null {
  const m = /^browser\s*\|\s*(.+)$/i.exec(appKey.trim());
  return m ? m[1].trim() : null;
}

export function proposeRule(
  appKey: string,
  title: string,
  classId: string,
  history: ProposeHistory,
): RuleProposal | null {
  const exists = (field: RuleField, match_kind: RuleMatchKind, pattern: string) =>
    (history.existingRules || []).some(
      (r) => r.field === field && r.match_kind === match_kind && r.pattern.trim().toLowerCase() === pattern.trim().toLowerCase(),
    );

  // 1. A browser key names a site: the whole site, not this one title.
  const site = siteToken(appKey);
  if (site && !exists("app_key", "exact", appKey)) {
    return {
      field: "app_key",
      match_kind: "exact",
      pattern: appKey,
      class_id: classId,
      project_id: null,
      reason: `Każde okno serwisu ${site}`,
    };
  }

  // 2. Three keys of the same app already point at this class: the app itself.
  const app = history.app || appKey.split("|")[0].trim();
  const sameApp = new Set(
    history.labels.filter((l) => l.app === app && l.classId === classId).map((l) => l.appKey),
  );
  sameApp.add(appKey);
  if (app && sameApp.size >= 3 && !exists("app", "exact", app)) {
    return {
      field: "app",
      match_kind: "exact",
      pattern: app,
      class_id: classId,
      project_id: null,
      reason: `${sameApp.size} klucze aplikacji ${app} mają już tę klasę`,
    };
  }

  // 3. A project name keeps showing up in the titles: bind the class to it.
  const titles = [title, ...(history.titles || [])].filter(Boolean).map((t) => t.toLowerCase());
  for (const p of history.projects || []) {
    const needle = p.name.trim().toLowerCase();
    if (needle.length < 2) continue;
    const hits = titles.filter((t) => hasWholeWord(t, needle)).length;
    if (hits >= 2 && !exists("title", "substring", p.name)) {
      return {
        field: "title",
        match_kind: "substring",
        pattern: p.name.trim(),
        class_id: classId,
        project_id: p.id,
        reason: `Projekt ${p.name} pojawia się w ${hits} tytułach`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Small formatting helpers shared by the UI and the assistant gatherer
// ---------------------------------------------------------------------------

/** 5400 -> "1:30", 0 -> "0:00". */
export function formatHm(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Median of a list of numbers (null when empty). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
