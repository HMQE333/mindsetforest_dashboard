/**
 * "Przypisz w 10 sekund": what the triage dialog asks about (pure, no I/O).
 *
 * The classifier already decides most time (rules, the built-in catalog,
 * keywords, priors). Triage is the short list of what is still the system's
 * guess or nobody's decision, biggest first, each row pre-filled where the
 * guess is good enough to accept with one Enter:
 *
 *   - considered time: counted sessions (the aggregateUsage rule) whose
 *     classification came from the catalog, a prior or nothing. Rules and
 *     keywords are the user's own words and never come back here.
 *   - one row per catalog entry (ChatGPT on the phone, the PC app and the
 *     browser is one row), else one row per app key. Accepting a row writes
 *     an exact app_key label rule for every key in it, so the assistant and
 *     the reviews (which read the title-less daily rollup) agree.
 *   - "Browser | other" is never a row: labelling the tracker's bucket would
 *     label every unnamed tab. Its time is reported apart.
 *   - the catalog's ambiguous groups (AI chats: work or learning?) are asked
 *     once; the answer is stored as the class's `catalog_groups` claim.
 *
 * Suggestion order per row: the catalog (a pending or stored group answer
 * first, then a key of the same entry the user already labelled, then the
 * entry's default kind), a labelled key with the same name, the AI, a prior.
 */
import { catalogClassFor, catalogConfidence, catalogEntry, matchCatalog, type CatalogEntry } from "@/lib/app-catalog";
import { CATALOG_GROUPS } from "@/lib/app-catalog-data";
import {
  MAX_COUNTED_IDLE_SECONDS,
  PRIORITY_LABEL,
  siteToken,
  type AppClass,
  type AppKind,
  type AppRule,
  type Classification,
  type RuleSource,
  type UsageSession,
} from "@/lib/app-usage-classify";
import type { AiDecision, AiItem, AiSuggestion, DecisionSnapshot } from "@/lib/app-usage-ai";
import { isPhone } from "@/lib/tracker-devices";

export type Device = "pc" | "phone";

export interface TriageSuggestion {
  classId: string;
  source: "catalog" | "sibling" | "ai" | "prior";
  confidence: number;
  /** Short Polish reason, shown on hover. */
  why: string;
  /** Selected when the dialog opens: Enter accepts it. */
  preselect: boolean;
  /** Other plausible classes (the entry's alternative kinds, the AI's second pick). */
  altClassIds: string[];
}

export interface TriageItem {
  /** "cat:<entryId>" | "key:<appKey>" */
  id: string;
  name: string;
  /** Most time first. */
  appKeys: string[];
  devices: Device[];
  /** Considered (guessed or unassigned) counted seconds. */
  seconds: number;
  /** The unassigned part of `seconds`. */
  unassignedSeconds: number;
  /** Up to three titles, most time first, without the browser suffix. */
  titles: string[];
  catalogId: string | null;
  group: string | null;
  suggestion: TriageSuggestion | null;
  /**
   * Time of these keys that a label would change although it is already
   * decided: by a rule or keyword of the user (seconds per class id), or
   * filed under a project (seconds per project id). Not part of `seconds`.
   */
  keptSeconds: Record<string, number>;
  projectSeconds: Record<string, number>;
}

export interface GroupQuestion {
  group: string;
  ask: string;
  seconds: number;
  defaultClassId: string | null;
  optionClassIds: string[];
  /** Entry names behind the time, most first. */
  examples: string[];
}

export interface TriageInput {
  sessions: UsageSession[];
  classifications: Classification[];
  classes: AppClass[];
  rules: AppRule[];
  /** App keys the user skipped ("Pomiń"): never a row again. */
  dismissed: Set<string>;
  /** The AI's answers by app_key. */
  ai: Map<string, AiSuggestion>;
  /** Answers given in the dialog but not saved yet: group -> classId. */
  groupAnswers?: Record<string, string>;
  minSeconds?: number;
  max?: number;
}

export interface TriageResult {
  items: TriageItem[];
  questions: GroupQuestion[];
  /** Rows past `max` (each at least `minSeconds`). */
  rest: { count: number; seconds: number };
  /** All counted seconds in the window, any source. */
  totalSeconds: number;
  /** Counted seconds with no class. */
  unassignedSeconds: number;
  /** Counted seconds the catalog or a prior decided (not yet the user's word). */
  guessedSeconds: number;
  /** Considered seconds of "Browser | other" (tabs the tracker could not name). */
  otherBucketSeconds: number;
}

export const TRIAGE_MIN_SECONDS = 120;
export const TRIAGE_MAX = 20;
/** A group question needs this much matched time. */
export const QUESTION_MIN_SECONDS = 120;
/** AI answers at or above this (and not multi-purpose) are pre-selected. */
export const AI_PRESELECT_CONFIDENCE = 0.85;
export const SIBLING_CONFIDENCE = 0.85;
/** A pending or stored group answer is the user's own word about the entry's kind. */
export const ANSWERED_CONFIDENCE = 0.9;

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const PACKAGE_RE = /^[a-z]\w*(\.\w+)+$/i;
const HOST_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

/** "android:Pixel 8:abc" is a phone, a tracker's UUID a computer. */
export function deviceOf(deviceId: string): Device {
  return isPhone(deviceId) ? "phone" : "pc";
}

/**
 * What a person calls the key: the site of a browser key ("YouTube"), the
 * phone's label for an Android package ("Messenger", or the catalog's name
 * when the label is just the package again), the key itself otherwise.
 */
export function friendlyName(appKey: string, app: string): string {
  const site = siteToken(appKey);
  if (site) return site;
  if (PACKAGE_RE.test(appKey)) {
    const label = (app || "").trim();
    if (label && label !== appKey) return label;
    const m = matchCatalog({ app: label, app_key: appKey, window_title: "" }, "exact");
    if (m) return m.entry.name;
  }
  return appKey;
}

/** Package and host parts that name nothing ("com", "android", "app"). */
const NAME_STOP = new Set([
  "com", "org", "net", "pl", "io", "co", "www", "app", "apps", "android", "mobile", "client", "lite", "pro", "free",
  "main", "phone", "beta", "release", "debug", "prod", "root", "web", "webapk",
]);

/**
 * Normalised names a key goes by, for matching it to a labelled sibling:
 * the friendly name, the main label of a host token ("rybiapaka.pl" ->
 * "rybiapaka") and the last meaningful package segment ("com.openai.chatgpt"
 * -> "chatgpt"). Names under three characters match too much to be used.
 */
export function siblingNames(appKey: string, app: string): string[] {
  const out = new Set<string>();
  const friendly = friendlyName(appKey, app).trim().toLowerCase();
  out.add(friendly);
  if (HOST_RE.test(friendly)) {
    // The leftmost label only: "rybiapaka.pl" -> "rybiapaka", but "a.vercel.app"
    // and "b.vercel.app" are different sites on one host, not siblings.
    const first = friendly.replace(/^www\./, "").split(".")[0];
    if (!NAME_STOP.has(first)) out.add(first);
  }
  if (PACKAGE_RE.test(appKey)) {
    const segments = appKey.toLowerCase().split(".");
    for (let i = segments.length - 1; i >= 0; i--) {
      if (!NAME_STOP.has(segments[i]) && !/^\d+$/.test(segments[i])) {
        out.add(segments[i]);
        break;
      }
    }
  }
  return [...out].filter((n) => n.length >= 3);
}

const COUNT_PREFIX_RE = /^\(\d[\d\s,.+]*\)\s*/;
const BROWSER_SUFFIX_RE = /\s+[-–—]\s+(?:Google Chrome|Chromium|Brave|Microsoft​?\s?Edge|Mozilla Firefox|Firefox|Opera(?: GX)?|Vivaldi|Arc|Zen)$/i;
const INVISIBLE_RE = /[​-‍⁠﻿]/g;

/** "(3) Inbox - Gmail - Brave" -> "Inbox - Gmail". */
export function displayTitle(title: string): string {
  return title.replace(INVISIBLE_RE, "").replace(COUNT_PREFIX_RE, "").replace(/\s+/g, " ").trim().replace(BROWSER_SUFFIX_RE, "").trim();
}

function isBucketKey(appKey: string): boolean {
  return siteToken(appKey)?.toLowerCase() === "other";
}

// ---------------------------------------------------------------------------
// Per-key pass over the sessions (cached per classifications array)
// ---------------------------------------------------------------------------

interface KeyStat {
  appKey: string;
  app: string;
  devices: Set<Device>;
  seconds: number;
  unassigned: number;
  titles: Map<string, number>;
  /** Catalog entry id -> considered seconds that matched it by an exact name (row grouping). */
  entries: Map<string, number>;
  /** Same, any phase: a title mention also moves with a group answer (question time). */
  mentions: Map<string, number>;
  /** Class id -> considered seconds a prior put there. */
  priors: Map<string, number>;
  priorWhy: string;
  priorConfidence: number;
  bucket: boolean;
  /** Considered seconds the classifier filed under a project, per project id. */
  projects: Map<string, number>;
}

interface Base {
  keys: Map<string, KeyStat>;
  /** Per key, counted seconds a user rule or keyword decided, per class id: a key-wide label would override them. */
  kept: Map<string, Map<string, number>>;
  /** First `app` seen per key, for naming labelled keys. */
  appByKey: Map<string, string>;
  totalSeconds: number;
  unassignedSeconds: number;
  guessedSeconds: number;
}

const baseCache = new WeakMap<Classification[], { sessions: UsageSession[]; classes: AppClass[]; base: Base }>();

function considered(c: Classification | undefined): boolean {
  return !c || c.source === "none" || c.source === "catalog" || c.source === "prior";
}

/**
 * One walk over the sessions: totals plus per-key considered time, titles,
 * catalog entries and prior classes. Group answers, AI answers, rules and
 * dismissals are applied on top, so changing an answer in the dialog never
 * walks the sessions again.
 */
function computeBase(sessions: UsageSession[], classifications: Classification[], classes: AppClass[]): Base {
  const cached = baseCache.get(classifications);
  if (cached && cached.sessions === sessions && cached.classes === classes) return cached.base;
  const classById = new Map(classes.map((c) => [c.id, c]));
  const keys = new Map<string, KeyStat>();
  const kept = new Map<string, Map<string, number>>();
  const appByKey = new Map<string, string>();
  let totalSeconds = 0;
  let unassignedSeconds = 0;
  let guessedSeconds = 0;
  sessions.forEach((s, i) => {
    if (!appByKey.has(s.app_key)) appByKey.set(s.app_key, s.app);
    const c = classifications[i];
    const cls = c?.classId ? classById.get(c.classId) : undefined;
    // Same counting as aggregateUsage: idle only in a count_idle class, capped.
    if (s.idle && !(cls && cls.count_idle)) return;
    const secs = s.idle ? Math.min(s.seconds, MAX_COUNTED_IDLE_SECONDS) : s.seconds;
    totalSeconds += secs;
    if (!cls) unassignedSeconds += secs;
    else if (c && (c.source === "catalog" || c.source === "prior")) guessedSeconds += secs;
    if (!considered(c)) {
      if (cls) {
        let m = kept.get(s.app_key);
        if (!m) kept.set(s.app_key, (m = new Map()));
        m.set(cls.id, (m.get(cls.id) || 0) + secs);
      }
      return;
    }

    let k = keys.get(s.app_key);
    if (!k) {
      k = {
        appKey: s.app_key,
        app: s.app,
        devices: new Set(),
        seconds: 0,
        unassigned: 0,
        titles: new Map(),
        entries: new Map(),
        mentions: new Map(),
        priors: new Map(),
        priorWhy: "",
        priorConfidence: 0,
        bucket: isBucketKey(s.app_key),
        projects: new Map(),
      };
      keys.set(s.app_key, k);
    }
    k.devices.add(deviceOf(s.device_id));
    k.seconds += secs;
    if (!cls) k.unassigned += secs;
    if (s.window_title) k.titles.set(s.window_title, (k.titles.get(s.window_title) || 0) + secs);
    if (c?.projectId) k.projects.set(c.projectId, (k.projects.get(c.projectId) || 0) + secs);
    // Exact names only: a key that merely mentions a site in some titles
    // ("Oglądaj Anime - Wyszukiwanie") must not get that site's key-wide rule.
    const m = matchCatalog(s);
    if (m) {
      k.mentions.set(m.entry.id, (k.mentions.get(m.entry.id) || 0) + secs);
      if (m.phase === "exact") k.entries.set(m.entry.id, (k.entries.get(m.entry.id) || 0) + secs);
    }
    if (c?.source === "prior" && cls) {
      k.priors.set(cls.id, (k.priors.get(cls.id) || 0) + secs);
      if (!k.priorWhy) {
        k.priorWhy = c.why;
        k.priorConfidence = c.confidence;
      }
    }
  });
  const base: Base = { keys, kept, appByKey, totalSeconds, unassignedSeconds, guessedSeconds };
  baseCache.set(classifications, { sessions, classes, base });
  return base;
}

/** The entry most of a key's considered time matched, or null when no entry covers more than half. */
function dominantEntry(k: KeyStat): CatalogEntry | null {
  let best: [string, number] | null = null;
  for (const e of k.entries) if (!best || e[1] > best[1]) best = e;
  if (!best || best[1] * 2 <= k.seconds) return null;
  return catalogEntry(best[0]) ?? null;
}

// ---------------------------------------------------------------------------
// buildTriage
// ---------------------------------------------------------------------------

interface Draft {
  id: string;
  name: string;
  entry: CatalogEntry | null;
  stats: KeyStat[];
}

/** User decisions that can name a sibling: enabled exact app_key rules the user wrote or accepted. */
const DECIDING_SOURCES: RuleSource[] = ["manual", "label", "learned"];

interface Labelled {
  appKey: string;
  classId: string;
  names: string[];
  entryId: string | null;
}

/** Lowest sort_order class per kind. */
function firstByKind(classes: AppClass[]): Map<AppKind, AppClass> {
  const out = new Map<AppKind, AppClass>();
  for (const c of [...classes].sort((a, b) => a.sort_order - b.sort_order)) if (!out.has(c.kind)) out.set(c.kind, c);
  return out;
}

const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/**
 * Row order: most time first, unassigned time counted twice. Confirming a
 * guess changes no number, assigning unassigned time is what the header's
 * percentage measures, so a 20-minute unknown site outranks a 25-minute
 * catalog guess but not a 5-hour one.
 */
export function triageWeight(item: Pick<TriageItem, "seconds" | "unassignedSeconds">): number {
  return item.seconds + item.unassignedSeconds;
}

export function buildTriage(input: TriageInput): TriageResult {
  const { classes, rules, dismissed, ai } = input;
  const minSeconds = input.minSeconds ?? TRIAGE_MIN_SECONDS;
  const max = input.max ?? TRIAGE_MAX;
  const base = computeBase(input.sessions, input.classifications, classes);
  const classById = new Map(classes.map((c) => [c.id, c]));
  const byKind = firstByKind(classes);
  const claimed = new Set(classes.flatMap((c) => c.catalog_groups || []));
  const answers: Record<string, string> = {};
  for (const [g, id] of Object.entries(input.groupAnswers || {})) if (classById.has(id)) answers[g] = id;

  const labelled: Labelled[] = [];
  for (const r of rules) {
    if (!r.enabled || r.field !== "app_key" || r.match_kind !== "exact" || !DECIDING_SOURCES.includes(r.source)) continue;
    if (!classById.has(r.class_id)) continue;
    const app = base.appByKey.get(r.pattern) ?? r.pattern;
    const m = matchCatalog({ app, app_key: r.pattern, window_title: "" });
    labelled.push({ appKey: r.pattern, classId: r.class_id, names: siblingNames(r.pattern, app), entryId: m ? m.entry.id : null });
  }

  // Rows, plus the time behind each askable group.
  const drafts = new Map<string, Draft>();
  const groupTime = new Map<string, { seconds: number; entries: Map<string, number> }>();
  let otherBucketSeconds = 0;
  for (const k of base.keys.values()) {
    if (dismissed.has(k.appKey)) continue;
    for (const [entryId, secs] of k.mentions) {
      const group = catalogEntry(entryId)?.group;
      if (!group || !CATALOG_GROUPS[group]?.ask_pl || claimed.has(group)) continue;
      let g = groupTime.get(group);
      if (!g) groupTime.set(group, (g = { seconds: 0, entries: new Map() }));
      g.seconds += secs;
      g.entries.set(entryId, (g.entries.get(entryId) || 0) + secs);
    }
    if (k.bucket) {
      otherBucketSeconds += k.seconds;
      continue;
    }
    const entry = dominantEntry(k);
    const id = entry ? `cat:${entry.id}` : `key:${k.appKey}`;
    const d = drafts.get(id);
    if (d) d.stats.push(k);
    else drafts.set(id, { id, name: entry ? entry.name : friendlyName(k.appKey, k.app), entry, stats: [k] });
  }

  const kindClassIds = (kinds: AppKind[], except: string | null) =>
    uniq(kinds.map((kind) => byKind.get(kind)?.id).filter((id): id is string => !!id && id !== except));

  const suggest = (d: Draft): TriageSuggestion | null => {
    const entry = d.entry;
    if (entry) {
      const opaque = !!entry.opaque;
      const group = entry.group ? CATALOG_GROUPS[entry.group] : undefined;
      const altKinds = uniq([...(entry.alt || []), ...(group?.alt || [])]);
      const defaultCls = catalogClassFor(entry, classes);
      const answered = entry.group ? answers[entry.group] : undefined;
      if (answered) {
        return {
          classId: answered,
          source: "catalog",
          confidence: ANSWERED_CONFIDENCE,
          why: `Katalog: ${entry.name} · Twoja odpowiedź`,
          preselect: !opaque,
          altClassIds: uniq([...(defaultCls ? [defaultCls.id] : []), ...kindClassIds([entry.kind, ...altKinds], null)]).filter((id) => id !== answered),
        };
      }
      // A stored group claim is already inside catalogClassFor; without one,
      // a key of this entry the user labelled says more than the default kind.
      if (!(entry.group && claimed.has(entry.group))) {
        const sib = labelled.find((l) => l.entryId === entry.id);
        if (sib) {
          return {
            classId: sib.classId,
            source: "sibling",
            confidence: SIBLING_CONFIDENCE,
            why: `Tak jak „${friendlyName(sib.appKey, base.appByKey.get(sib.appKey) ?? sib.appKey)}”`,
            preselect: !opaque,
            altClassIds: defaultCls && defaultCls.id !== sib.classId ? [defaultCls.id] : [],
          };
        }
      }
      if (defaultCls) {
        return {
          classId: defaultCls.id,
          source: "catalog",
          confidence: catalogConfidence(entry),
          why: opaque ? `Katalog: ${entry.name} · nie wiadomo, co było otwarte` : `Katalog: ${entry.name}`,
          preselect: !opaque && !entry.heuristic,
          altClassIds: kindClassIds(altKinds, defaultCls.id),
        };
      }
    }

    const names = new Set(d.stats.flatMap((k) => siblingNames(k.appKey, k.app)));
    const sib = labelled.find((l) => l.names.some((n) => names.has(n)));
    if (sib) {
      return {
        classId: sib.classId,
        source: "sibling",
        confidence: SIBLING_CONFIDENCE,
        why: `Tak jak „${friendlyName(sib.appKey, base.appByKey.get(sib.appKey) ?? sib.appKey)}”`,
        preselect: true,
        altClassIds: [],
      };
    }

    for (const k of d.stats) {
      const a = ai.get(k.appKey);
      if (!a || !a.class_id || !classById.has(a.class_id)) continue;
      return {
        classId: a.class_id,
        source: "ai",
        confidence: a.confidence,
        why: a.decided ? a.why || "Twój wcześniejszy wybór" : `AI: ${a.why || "propozycja"}`,
        // A locally cached answer may predate a change of classes: the function re-checks it (free) first.
        preselect: a.confidence >= AI_PRESELECT_CONFIDENCE && !a.multi && !a.decided && !a.stale,
        altClassIds: a.alt_class_id && a.alt_class_id !== a.class_id && classById.has(a.alt_class_id) ? [a.alt_class_id] : [],
      };
    }

    const priors = new Map<string, number>();
    let why = "";
    let confidence = 0;
    for (const k of d.stats) {
      for (const [id, s] of k.priors) priors.set(id, (priors.get(id) || 0) + s);
      if (!why && k.priorWhy) {
        why = k.priorWhy;
        confidence = k.priorConfidence;
      }
    }
    let best: [string, number] | null = null;
    for (const p of priors) if (!best || p[1] > best[1]) best = p;
    if (best && classById.has(best[0])) {
      // A prior already counts in every chart: accepting it changes no number, it only makes it permanent.
      return { classId: best[0], source: "prior", confidence, why, preselect: true, altClassIds: [] };
    }
    return null;
  };

  const all: TriageItem[] = [];
  for (const d of drafts.values()) {
    const stats = [...d.stats].sort((a, b) => b.seconds - a.seconds || a.appKey.localeCompare(b.appKey));
    const seconds = stats.reduce((n, k) => n + k.seconds, 0);
    if (seconds < minSeconds) continue;
    const titleTime = new Map<string, number>();
    for (const k of stats) {
      for (const [t, s] of k.titles) {
        const clean = displayTitle(t);
        if (clean) titleTime.set(clean, (titleTime.get(clean) || 0) + s);
      }
    }
    const skip = new Set([d.name.toLowerCase(), ...stats.map((k) => k.app.toLowerCase()), ...stats.map((k) => k.appKey.toLowerCase())]);
    const titles = [...titleTime.entries()]
      .filter(([t]) => !skip.has(t.toLowerCase()))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    const devices = new Set(stats.flatMap((k) => [...k.devices]));
    const keptSeconds: Record<string, number> = {};
    const projectSeconds: Record<string, number> = {};
    for (const k of stats) {
      for (const [id, secs] of base.kept.get(k.appKey) || []) keptSeconds[id] = (keptSeconds[id] || 0) + secs;
      for (const [id, secs] of k.projects) projectSeconds[id] = (projectSeconds[id] || 0) + secs;
    }
    let suggestion = suggest(d);
    if (suggestion?.preselect && overriddenSeconds({ keptSeconds, projectSeconds }, suggestion.classId, classById) >= OVERRIDE_MIN_SECONDS) {
      // Confirming would quietly move time the user already decided (or a project's time): ask instead.
      suggestion = { ...suggestion, preselect: false };
    }
    all.push({
      id: d.id,
      name: d.name,
      appKeys: stats.map((k) => k.appKey),
      devices: (["pc", "phone"] as Device[]).filter((x) => devices.has(x)),
      seconds,
      unassignedSeconds: stats.reduce((n, k) => n + k.unassigned, 0),
      titles,
      catalogId: d.entry ? d.entry.id : null,
      group: d.entry?.group ?? null,
      suggestion,
      keptSeconds,
      projectSeconds,
    });
  }
  all.sort((a, b) => triageWeight(b) - triageWeight(a) || a.name.localeCompare(b.name));
  const items = all.slice(0, Math.max(0, max));
  const restItems = all.slice(items.length);

  const questions: GroupQuestion[] = [];
  for (const [group, t] of groupTime) {
    const def = CATALOG_GROUPS[group];
    if (!def?.ask_pl || t.seconds < QUESTION_MIN_SECONDS) continue;
    const kinds = uniq([def.default, ...def.alt]);
    const sorted = [...classes].sort((a, b) => a.sort_order - b.sort_order);
    const optionClassIds = kinds.flatMap((kind) => sorted.filter((c) => c.kind === kind).map((c) => c.id));
    if (optionClassIds.length < 2) continue;
    questions.push({
      group,
      ask: def.ask_pl,
      seconds: t.seconds,
      defaultClassId: byKind.get(def.default)?.id ?? null,
      optionClassIds,
      examples: [...t.entries.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => catalogEntry(id)?.name)
        .filter((n): n is string => !!n)
        .slice(0, 3),
    });
  }
  questions.sort((a, b) => b.seconds - a.seconds);

  return {
    items,
    questions,
    rest: { count: restItems.length, seconds: restItems.reduce((n, it) => n + it.seconds, 0) },
    totalSeconds: base.totalSeconds,
    unassignedSeconds: base.unassignedSeconds,
    guessedSeconds: base.guessedSeconds,
    otherBucketSeconds,
  };
}

/** Below this, time a label would move from another class or project is not worth a warning. */
export const OVERRIDE_MIN_SECONDS = 60;

/**
 * Seconds a label to `classId` would take from what is already decided:
 * time a user rule or keyword put in another class, and project time when
 * the class is not bound to that project (a label drops the project).
 */
export function overriddenSeconds(
  item: Pick<TriageItem, "keptSeconds" | "projectSeconds">,
  classId: string,
  classById: Map<string, AppClass>,
): number {
  const project = classById.get(classId)?.project_id ?? null;
  let n = 0;
  for (const [id, secs] of Object.entries(item.keptSeconds)) if (id !== classId) n += secs;
  for (const [id, secs] of Object.entries(item.projectSeconds)) if (id !== project) n += secs;
  return n;
}

/** Rows that should ask the AI: no suggestion, or a weak one that is not the catalog's. */
export function needsAi(item: TriageItem): boolean {
  return !item.suggestion || (!item.suggestion.preselect && item.suggestion.source !== "catalog");
}

/** The banner: something to do, and enough time behind it to be worth ten seconds. */
export function triageWorth(r: TriageResult): boolean {
  return r.items.length > 0 && (r.unassignedSeconds >= 15 * 60 || r.questions.length > 0 || r.guessedSeconds >= 30 * 60);
}

// ---------------------------------------------------------------------------
// Choices and what they cost / buy
// ---------------------------------------------------------------------------

/** Per row: a class id, "skip" (Pomiń) or null (left as it is). */
export type TriageChoice = string | "skip" | null;

export const SKIP = "skip" as const;

/** What the dialog starts with: each pre-selected suggestion. */
export function defaultChoices(items: TriageItem[]): Record<string, TriageChoice> {
  const out: Record<string, TriageChoice> = {};
  for (const it of items) out[it.id] = it.suggestion?.preselect ? it.suggestion.classId : null;
  return out;
}

/** Unassigned seconds left once the chosen rows are written (an estimate: rows only, not the bucket). */
export function unassignedAfter(r: TriageResult, choices: Record<string, TriageChoice>): number {
  let left = r.unassignedSeconds;
  for (const it of r.items) {
    const c = choices[it.id];
    if (c && c !== SKIP) left -= it.unassignedSeconds;
  }
  return Math.max(0, left);
}

/** The AI request for these rows: one item per key, the row's friendly name as the app. */
export function toAiItems(items: TriageItem[]): AiItem[] {
  return items.flatMap((it) =>
    it.appKeys.map((app_key) => ({
      app_key,
      app: it.appKeys.length === 1 ? it.name : friendlyNameOfKey(app_key, it.name),
      device: it.devices.length === 1 && it.devices[0] === "phone" ? ("phone" as const) : ("pc" as const),
      minutes: Math.round(it.seconds / 60),
      titles: it.titles,
    })),
  );
}

function friendlyNameOfKey(appKey: string, fallback: string): string {
  const name = friendlyName(appKey, "");
  return name === appKey && PACKAGE_RE.test(appKey) ? fallback : name;
}

export interface LabelEntry {
  appKey: string;
  classId: string;
  projectId?: string | null;
}

/**
 * The writes for the chosen rows: one label entry per key (a class bound to
 * a project labels with that project), and the AI scorecard: accepted or
 * corrected where the row showed the AI's suggestion, dismissed per key of
 * a skipped row.
 */
export function planConfirm(
  items: TriageItem[],
  choices: Record<string, TriageChoice>,
  classes: AppClass[],
  ai: Map<string, AiSuggestion>,
): { entries: LabelEntry[]; decisions: AiDecision[]; assigned: TriageItem[]; skipped: TriageItem[] } {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const entries: LabelEntry[] = [];
  const decisions: AiDecision[] = [];
  const assigned: TriageItem[] = [];
  const skipped: TriageItem[] = [];
  for (const it of items) {
    const choice = choices[it.id];
    if (choice === SKIP) {
      skipped.push(it);
      for (const app_key of it.appKeys) decisions.push({ app_key, status: "dismissed", final_class_id: null });
      continue;
    }
    if (!choice || !classById.has(choice)) continue;
    assigned.push(it);
    const projectId = classById.get(choice)?.project_id ?? null;
    for (const appKey of it.appKeys) entries.push({ appKey, classId: choice, projectId });
    if (it.suggestion?.source === "ai") {
      for (const app_key of it.appKeys) {
        const a = ai.get(app_key);
        if (!a || !a.class_id) continue;
        // A decided row already holds the user's pick: re-picking it records nothing
        // (it must stay "corrected" when the model had said otherwise).
        if (a.decided && a.class_id === choice) continue;
        decisions.push({
          app_key,
          status: a.class_id === choice ? "accepted" : "corrected",
          final_class_id: choice,
          preselected: it.suggestion.preselect,
        });
      }
    }
  }
  return { entries, decisions, assigned, skipped };
}

// ---------------------------------------------------------------------------
// Write plans (used by useAppUsage) and undo
// ---------------------------------------------------------------------------

export interface RuleSnapshot {
  id: string;
  class_id: string;
  project_id: string | null;
  priority: number;
  source: RuleSource;
  confidence: number;
  enabled: boolean;
}

/** Everything a "Cofnij" needs to put the rules and claims back. */
export interface LabelUndo {
  /** Keys whose label was written. */
  keys: string[];
  /** Rules that did not exist before: deleted on undo. */
  created: string[];
  /** Rules that existed (manual ones updated, others overwritten by the upsert): restored on undo. */
  restore: RuleSnapshot[];
  /** Previous catalog_groups of classes whose claims changed. */
  classGroups: { id: string; catalog_groups: string[] }[];
  /** What app_class_suggestions held for the decided keys before the confirm. */
  decisions?: DecisionSnapshot | null;
}

export const EMPTY_UNDO: LabelUndo = { keys: [], created: [], restore: [], classGroups: [] };

export interface LabelBatchPlan {
  /** Hand-written rules for the key: only the target moves (planLabelWrite "update"). */
  updates: { appKey: string; classId: string; projectId: string | null; previous: RuleSnapshot }[];
  /** Everything else, in one upsert at the label priority; `previous` is the rule it overwrites, if any. */
  upserts: { appKey: string; classId: string; projectId: string | null; previous: RuleSnapshot | null }[];
  priority: number;
}

function snapshot(r: AppRule): RuleSnapshot {
  return {
    id: r.id,
    class_id: r.class_id,
    project_id: r.project_id,
    priority: r.priority,
    source: r.source,
    confidence: r.confidence,
    enabled: r.enabled,
  };
}

/** Same decision as planLabelWrite, per key, last entry per key winning (one statement cannot touch a row twice). */
export function planLabelBatch(rules: AppRule[], entries: LabelEntry[]): LabelBatchPlan {
  const byKey = new Map<string, LabelEntry>();
  for (const e of entries) if (e.appKey && e.classId) byKey.set(e.appKey, e);
  const plan: LabelBatchPlan = { updates: [], upserts: [], priority: PRIORITY_LABEL };
  for (const e of byKey.values()) {
    const existing = rules.find((r) => r.field === "app_key" && r.match_kind === "exact" && r.pattern === e.appKey);
    const projectId = e.projectId ?? null;
    if (existing && existing.source === "manual") {
      plan.updates.push({ appKey: e.appKey, classId: e.classId, projectId, previous: snapshot(existing) });
      // (the update also switches a disabled manual rule back on, or the label would do nothing)
    } else {
      plan.upserts.push({ appKey: e.appKey, classId: e.classId, projectId, previous: existing ? snapshot(existing) : null });
    }
  }
  return plan;
}

/**
 * Class updates that put each answered group in exactly one class: removed
 * from every other class, added to the answered one. Unchanged classes are
 * left out, so a re-confirmed answer writes nothing.
 */
export function planGroupClaims(
  classes: AppClass[],
  answers: Record<string, string>,
): { id: string; before: string[]; after: string[] }[] {
  const ids = new Set(classes.map((c) => c.id));
  const valid = Object.entries(answers).filter(([g, id]) => g && ids.has(id));
  const answered = new Set(valid.map(([g]) => g));
  const out: { id: string; before: string[]; after: string[] }[] = [];
  for (const c of classes) {
    const before = c.catalog_groups || [];
    const after = before.filter((g) => !answered.has(g));
    for (const [g, id] of valid) if (id === c.id && !after.includes(g)) after.push(g);
    const same = before.length === after.length && before.every((g) => after.includes(g));
    if (!same) out.push({ id: c.id, before: [...before], after });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/** 51600 -> "14 h 20 min", 2100 -> "35 min", 7200 -> "2 h", 20 -> "<1 min". */
export function durationLabel(seconds: number): string {
  const total = Math.round(Math.max(0, seconds) / 60);
  if (total < 1) return "<1 min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Polish count form: 1 pozycję, 2-4 pozycje (not 12-14), 5+ pozycji. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const tens = n % 100;
  const units = n % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}
