/**
 * Built-in app catalog: matching (pure, no I/O).
 *
 * The catalog (`app-catalog-data.ts`) names well-known apps, sites and
 * Android packages and says what kind of time they usually are, so a fresh
 * account is not 50% "Nieprzypisane" before the user has labelled anything.
 * The classifier applies it in two phases around the user's own keywords:
 *
 *   exact  - the key itself names the thing: an Android package (`pkg`,
 *            case-sensitive), the app's display name (`app`, `app_prefix`;
 *            non-browser keys, phone labels included), the browser site token
 *            (`site`, "Browser | YouTube"), or a token that is itself a host
 *            equal to or under a `domain` ("Browser | music.youtube.com").
 *            Runs BEFORE keywords: keywords misfire on package names
 *            (com.facebook.orca hits "Facebook") and on "YouTube Music".
 *   loose  - browser keys only, guessed from the title: a `domain` found in
 *            it (longest pattern wins), a title segment equal to a `site`
 *            (last segment first, where sites put their name), `token_re` on
 *            the site token, and for "Browser | other" only, `title_re` on the
 *            title without the browser's suffix. Runs AFTER keywords.
 *
 * Everything is indexed once at module load: per session a match costs a few
 * Map lookups, one host scan and one split of the title.
 *
 * A kind becomes a class through `catalogClassFor`: the class that claims the
 * entry's group (`app_classes.catalog_groups`, the user's answer to the group
 * question), else the user's first class of that kind. An `opaque` entry
 * (phone browsers) is recognised but never classifies.
 */
import type { AppClass, AppKind, UsageSession } from "@/lib/app-usage-classify";
import { CATALOG_ENTRIES, CATALOG_GROUPS } from "@/lib/app-catalog-data";

export interface CatalogEntry {
  id: string;
  /** Display name (Polish where it is a description, the brand otherwise). */
  name: string;
  kind: AppKind;
  /** Ambiguous family the user answers once (see CATALOG_GROUPS). */
  group?: string;
  /** Other kinds this entry is plausibly used as. */
  alt?: AppKind[];
  match: {
    pkg?: string[];
    app?: string[];
    app_prefix?: string[];
    site?: string[];
    domain?: string[];
    token_re?: string[];
    title_re?: string[];
  };
  /** Overrides catalogConfidence. */
  confidence?: number;
  /** A guess from the title's shape, not a name. */
  heuristic?: boolean;
  /** Recognised but says nothing about the use (a phone browser): never classifies. */
  opaque?: boolean;
  /**
   * Its site names are ordinary words ("Ustawienia", "History"): they match
   * as the site token or the whole title, never as one segment of a longer
   * title, where they would beat the real site's name.
   */
  generic?: boolean;
  /** Its site names also match before ": " ("PayPal: Ustawienia"); off by default, AI chat titles look like that too. */
  colon_prefix?: boolean;
}

export interface CatalogGroup {
  default: AppKind;
  alt: AppKind[];
  /** The one-tap question; groups without one are never asked. */
  ask_pl?: string;
}

export type CatalogPhase = "exact" | "loose";

export interface CatalogMatch {
  entry: CatalogEntry;
  phase: CatalogPhase;
  /** Which matcher fired, short Polish ("pakiet Androida", "domena w tytule"). */
  how: string;
}

export const CATALOG_GROUP_IDS: string[] = Object.keys(CATALOG_GROUPS);

/** Confidence bands: a clear name, an entry with plausible alternatives, a title-shape guess. */
export const CATALOG_CONFIDENCE = { clear: 0.8, ambiguous: 0.6, heuristic: 0.5 } as const;

// ---------------------------------------------------------------------------
// Index (built once)
// ---------------------------------------------------------------------------

interface CatalogIndex {
  byId: Map<string, CatalogEntry>;
  pkg: Map<string, CatalogEntry>;
  app: Map<string, CatalogEntry>;
  appPrefix: [string, CatalogEntry][];
  site: Map<string, CatalogEntry>;
  domain: Map<string, CatalogEntry>;
  tokenRe: [RegExp, CatalogEntry][];
  titleRe: [RegExp, CatalogEntry][];
}

function buildIndex(entries: CatalogEntry[]): CatalogIndex {
  const index: CatalogIndex = {
    byId: new Map(),
    pkg: new Map(),
    app: new Map(),
    appPrefix: [],
    site: new Map(),
    domain: new Map(),
    tokenRe: [],
    titleRe: [],
  };
  // The first entry to claim a name keeps it, so catalog order breaks ties.
  const put = (map: Map<string, CatalogEntry>, key: string, entry: CatalogEntry) => {
    if (key && !map.has(key)) map.set(key, entry);
  };
  for (const e of entries) {
    put(index.byId, e.id, e);
    const m = e.match;
    for (const v of m.pkg || []) put(index.pkg, v.trim(), e);
    for (const v of m.app || []) put(index.app, v.trim().toLowerCase(), e);
    for (const v of m.app_prefix || []) index.appPrefix.push([v.trim().toLowerCase(), e]);
    for (const v of m.site || []) put(index.site, v.trim().toLowerCase(), e);
    for (const v of m.domain || []) put(index.domain, normaliseHost(v), e);
    for (const v of m.token_re || []) index.tokenRe.push([new RegExp(v), e]);
    for (const v of m.title_re || []) index.titleRe.push([new RegExp(v, "i"), e]);
  }
  return index;
}

function normaliseHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

const INDEX = buildIndex(CATALOG_ENTRIES);

export function catalogEntry(id: string): CatalogEntry | undefined {
  return INDEX.byId.get(id);
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

const BROWSER_KEY_RE = /^browser\s*\|\s*(.+)$/i;
const HOST_TOKEN_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/;
/** A host in free text; not the domain of an e-mail address ("jan@wp.pl"), the same bounds as the tracker's. */
const HOST_IN_TEXT_RE = /(?<![\w.@-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w-])/g;
/** Tracker separators plus " :: ", " • " and " >> ". */
const SEGMENT_RE = /\s+(?:[-\u2013\u2014|\u00b7\u2022]|::|>>)\s+/;
const COLON_PREFIX_RE = /^([^:]{2,40}):\s+\S/;
const COUNT_PREFIX_RE = /^\(\d+\+?\)\s*/;
const LAST_SEGMENT_RE = /\s+[-\u2013\u2014|\u00b7]\s+([^-\u2013\u2014|\u00b7]*)$/;
const INVISIBLE_RE = /[\u200b-\u200d\u2060\ufeff]/g;

/** The browser's own name and profile, as the tracker drops them before picking a site. */
const BROWSER_TITLE_WORDS = new Set([
  "google chrome", "chromium", "mozilla firefox", "firefox", "microsoft edge", "brave", "opera", "opera gx",
  "vivaldi", "waterfox", "librewolf", "floorp", "arc", "zen browser", "zen", "personal", "work", "default",
  "osobisty", "prywatny", "praca", "służbowy", "domyślny", "profile 1", "person 1", "osoba 1",
]);

/** The site token of a browser key, null for anything else. */
function browserToken(appKey: string): string | null {
  const m = BROWSER_KEY_RE.exec(appKey.trim());
  return m ? m[1].trim() : null;
}

/** The longest catalog domain the host equals or sits under, with that domain. */
function domainEntry(host: string): { domain: string; entry: CatalogEntry } | null {
  let h = host;
  for (;;) {
    const entry = INDEX.domain.get(h);
    if (entry) return { domain: h, entry };
    const dot = h.indexOf(".");
    if (dot < 0) return null;
    h = h.slice(dot + 1);
  }
}

function titleSegments(title: string): string[] {
  return title
    .replace(INVISIBLE_RE, "")
    .split(SEGMENT_RE)
    .map((s) => s.replace(COUNT_PREFIX_RE, "").trim().toLowerCase())
    .filter(Boolean);
}

/** "Hot Knives • Fog Lake - Brave" -> "Hot Knives • Fog Lake". */
function stripBrowserSuffix(title: string): string {
  let t = title.replace(INVISIBLE_RE, "").trim();
  for (;;) {
    const m = LAST_SEGMENT_RE.exec(t);
    if (!m || !BROWSER_TITLE_WORDS.has(m[1].trim().toLowerCase())) return t;
    t = t.slice(0, m.index).trim();
  }
}

const found = (entry: CatalogEntry, phase: CatalogPhase, how: string): CatalogMatch => ({ entry, phase, how });

function matchExact(session: Pick<UsageSession, "app" | "app_key">): CatalogMatch | null {
  const byPkg = INDEX.pkg.get(session.app_key.trim());
  if (byPkg) return found(byPkg, "exact", "pakiet Androida");
  const token = browserToken(session.app_key);
  if (token !== null) {
    const lower = token.toLowerCase();
    const bySite = INDEX.site.get(lower);
    if (bySite) return found(bySite, "exact", "nazwa strony");
    const host = normaliseHost(lower);
    if (HOST_TOKEN_RE.test(host)) {
      const hit = domainEntry(host);
      if (hit) return found(hit.entry, "exact", "domena");
    }
    return null;
  }
  const app = (session.app || "").trim().toLowerCase();
  if (!app) return null;
  const byApp = INDEX.app.get(app);
  if (byApp) return found(byApp, "exact", "nazwa aplikacji");
  for (const [prefix, entry] of INDEX.appPrefix) {
    if (app.startsWith(prefix)) return found(entry, "exact", "nazwa aplikacji");
  }
  return null;
}

function matchLoose(session: Pick<UsageSession, "app_key" | "window_title">): CatalogMatch | null {
  const token = browserToken(session.app_key);
  if (token === null) return null;
  const title = session.window_title || "";
  if (title) {
    let best: { domain: string; entry: CatalogEntry } | null = null;
    for (const raw of title.toLowerCase().match(HOST_IN_TEXT_RE) || []) {
      const hit = domainEntry(normaliseHost(raw));
      if (hit && (!best || hit.domain.length > best.domain.length)) best = hit;
    }
    if (best) return found(best.entry, "loose", "domena w tytule");
    const bare = stripBrowserSuffix(title).replace(COUNT_PREFIX_RE, "").trim().toLowerCase();
    const whole = INDEX.site.get(bare);
    if (whole) return found(whole, "loose", "tytuł");
    const segments = titleSegments(title);
    for (let i = segments.length - 1; i >= 0; i--) {
      const bySite = INDEX.site.get(segments[i]);
      if (bySite && !bySite.generic) return found(bySite, "loose", "fragment tytułu");
    }
    const colon = COLON_PREFIX_RE.exec(bare);
    const byPrefix = colon ? INDEX.site.get(colon[1].trim()) : undefined;
    if (byPrefix?.colon_prefix) return found(byPrefix, "loose", "fragment tytułu");
  }
  for (const [re, entry] of INDEX.tokenRe) {
    if (re.test(token)) return found(entry, "loose", "wzorzec klucza");
  }
  // Title shapes are a guess, so only where the tracker found no site at all.
  if (title && token.toLowerCase() === "other") {
    const bare = stripBrowserSuffix(title);
    for (const [re, entry] of INDEX.titleRe) {
      if (re.test(bare)) return found(entry, "loose", "wzorzec tytułu");
    }
  }
  return null;
}

/**
 * The catalog entry a session belongs to, or null. Without `phase` the exact
 * matchers are tried first, then the loose ones. Opaque entries are returned
 * too (triage groups by them); the classifier skips them.
 */
export function matchCatalog(
  session: Pick<UsageSession, "app" | "app_key" | "window_title">,
  phase?: CatalogPhase,
): CatalogMatch | null {
  if (phase !== "loose") {
    const exact = matchExact(session);
    if (exact || phase === "exact") return exact;
  }
  return matchLoose(session);
}

// ---------------------------------------------------------------------------
// Entry -> class, confidence
// ---------------------------------------------------------------------------

interface ClassLookup {
  byGroup: Map<string, AppClass>;
  byKind: Map<AppKind, AppClass>;
}

const classLookupCache = new WeakMap<AppClass[], ClassLookup>();

function classLookup(classes: AppClass[]): ClassLookup {
  const cached = classLookupCache.get(classes);
  if (cached) return cached;
  const lookup: ClassLookup = { byGroup: new Map(), byKind: new Map() };
  for (const c of [...classes].sort((a, b) => a.sort_order - b.sort_order)) {
    for (const g of c.catalog_groups || []) if (!lookup.byGroup.has(g)) lookup.byGroup.set(g, c);
    if (!lookup.byKind.has(c.kind)) lookup.byKind.set(c.kind, c);
  }
  classLookupCache.set(classes, lookup);
  return lookup;
}

/**
 * The class an entry lands in: the lowest sort_order class that claims the
 * entry's group, else the lowest sort_order class of the entry's kind, else
 * null (the user has no class of that kind, so the catalog stays silent).
 */
export function catalogClassFor(entry: CatalogEntry, classes: AppClass[]): AppClass | null {
  const lookup = classLookup(classes);
  return (entry.group ? lookup.byGroup.get(entry.group) : undefined) ?? lookup.byKind.get(entry.kind) ?? null;
}

/**
 * 0.8 for a clear name, 0.6 when the entry or its group lists alternative
 * kinds (a group without alternatives, like games, is not ambiguous), 0.5
 * for a heuristic; an explicit `confidence` wins.
 */
export function catalogConfidence(entry: CatalogEntry): number {
  if (typeof entry.confidence === "number") return entry.confidence;
  if (entry.heuristic) return CATALOG_CONFIDENCE.heuristic;
  const groupAlt = entry.group ? CATALOG_GROUPS[entry.group]?.alt ?? [] : [];
  return (entry.alt?.length ?? 0) > 0 || groupAlt.length > 0 ? CATALOG_CONFIDENCE.ambiguous : CATALOG_CONFIDENCE.clear;
}
