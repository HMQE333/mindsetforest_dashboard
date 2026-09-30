import { describe, it, expect } from "vitest";
import {
  classifySession,
  classifyAll,
  aggregateUsage,
  computeAppPriors,
  competingRule,
  logicalMinutesOfDay,
  planLabelWrite,
  proposeRule,
  regexPatternProblem,
  ruleHealth,
  testRule,
  formatHm,
  median,
  siteToken,
  weekdayBaseline,
  PRIORITY_LABEL,
  PRIORITY_MANUAL,
  type AppClass,
  type AppRule,
  type UsageSession,
  type ClassifyContext,
} from "../lib/app-usage-classify";
import { dailyRowToSession, rowToSession } from "../lib/app-usage-rows";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

const cls = (over: Partial<AppClass> & { id: string; kind: AppClass["kind"] }): AppClass => ({
  name: over.id,
  pillar_id: null,
  project_id: null,
  keywords: [],
  color: null,
  sort_order: 0,
  count_idle: false,
  is_default: false,
  ...over,
});

const WORK = cls({ id: "work", kind: "work", name: "Praca", keywords: ["Code"], sort_order: 0 });
const LEARN = cls({ id: "learn", kind: "learning", name: "Nauka", pillar_id: "mind", keywords: ["docs", "tutorial"], sort_order: 1 });
const COMM = cls({ id: "comm", kind: "communication", name: "Komunikacja", pillar_id: "people", keywords: ["Discord"], sort_order: 2 });
const WATCH = cls({ id: "watch", kind: "watching", name: "Oglądanie", count_idle: true, keywords: ["YouTube"], sort_order: 3 });
const WASTE = cls({ id: "waste", kind: "waste", name: "Marnowanie", keywords: ["Reddit"], sort_order: 4 });
const NEUTRAL = cls({ id: "neutral", kind: "neutral", name: "Neutralne", is_default: true, sort_order: 5 });
const CLASSES = [WORK, LEARN, COMM, WATCH, WASTE, NEUTRAL];

let ruleSeq = 0;
const rule = (over: Partial<AppRule> & { pattern: string; class_id: string }): AppRule => ({
  id: `r${++ruleSeq}`,
  field: "app_key",
  match_kind: "exact",
  project_id: null,
  priority: 0,
  source: "manual",
  confidence: 1,
  enabled: true,
  hits: 0,
  created_at: `2026-09-0${(ruleSeq % 9) + 1}T00:00:00Z`,
  ...over,
});

let sessSeq = 0;
const sess = (over: Partial<UsageSession> & { app_key: string }): UsageSession => {
  const n = ++sessSeq;
  return {
    id: `s${n}`,
    device_id: "dev",
    app: over.app_key.split("|")[0].trim(),
    window_title: "",
    started_at: `2026-09-28T10:${String(n % 60).padStart(2, "0")}:00Z`,
    ended_at: `2026-09-28T10:${String(n % 60).padStart(2, "0")}:30Z`,
    seconds: 60,
    idle: false,
    local_date: "2026-09-28",
    ...over,
  };
};

const ctx = (rules: AppRule[] = [], extra: Partial<ClassifyContext> = {}): ClassifyContext => ({
  classes: CLASSES,
  rules,
  projects: [{ id: "p1", name: "mindsetforest" }],
  ...extra,
});

// ---------------------------------------------------------------------------
// classifySession: rules
// ---------------------------------------------------------------------------

describe("classifySession: rules", () => {
  it("matches an exact app_key rule with confidence 1 and names the rule", () => {
    const r = rule({ pattern: "Browser | YouTube", class_id: "watch", source: "label" });
    const c = classifySession(sess({ app_key: "Browser | YouTube" }), ctx([r]));
    expect(c.classId).toBe("watch");
    expect(c.source).toBe("rule");
    expect(c.confidence).toBe(1);
    expect(c.ruleId).toBe(r.id);
    expect(c.why).toContain("Browser | YouTube");
  });

  it("higher priority wins regardless of source or match kind", () => {
    const low = rule({ pattern: "Browser | YouTube", class_id: "watch", priority: 0, source: "manual" });
    const high = rule({ pattern: "youtube", match_kind: "substring", class_id: "waste", priority: 5, source: "learned", confidence: 0.8 });
    const c = classifySession(sess({ app_key: "Browser | YouTube" }), ctx([low, high]));
    expect(c.classId).toBe("waste");
    expect(c.confidence).toBe(0.8);
  });

  it("at equal priority manual beats label beats learned, and exact beats substring", () => {
    const learned = rule({ pattern: "Browser | GitHub", class_id: "waste", source: "learned", confidence: 0.9 });
    const label = rule({ pattern: "Browser | GitHub", class_id: "learn", source: "label", match_kind: "substring" });
    const manualSub = rule({ pattern: "github", class_id: "comm", source: "manual", match_kind: "substring" });
    const manualExact = rule({ pattern: "Browser | GitHub", class_id: "work", source: "manual" });
    const c = classifySession(sess({ app_key: "Browser | GitHub" }), ctx([learned, label, manualSub, manualExact]));
    expect(c.classId).toBe("work");
    const c2 = classifySession(sess({ app_key: "Browser | GitHub" }), ctx([learned, label, manualSub]));
    expect(c2.classId).toBe("comm");
    const c3 = classifySession(sess({ app_key: "Browser | GitHub" }), ctx([learned, label]));
    expect(c3.classId).toBe("learn");
  });

  it("ignores disabled and suggested rules", () => {
    const disabled = rule({ pattern: "Discord", class_id: "waste", enabled: false });
    const suggested = rule({ pattern: "Discord", class_id: "waste", source: "suggested", priority: 99 });
    const c = classifySession(sess({ app_key: "Discord" }), ctx([disabled, suggested]));
    expect(c.source).toBe("keyword"); // falls through to the "Discord" keyword of Komunikacja
    expect(c.classId).toBe("comm");
  });

  it("a rule on field title matches the window title, app the display name", () => {
    const titleRule = rule({ field: "title", match_kind: "substring", pattern: "pull request", class_id: "work" });
    const appRule = rule({ field: "app", pattern: "Chrome", class_id: "neutral" });
    const s = sess({ app_key: "Browser | GitHub", app: "Chrome", window_title: "Fix bug - Pull Request #12" });
    expect(classifySession(s, ctx([titleRule])).classId).toBe("work");
    expect(classifySession(s, ctx([appRule])).classId).toBe("neutral");
    // same priority and source: the exact app rule outranks the substring title rule
    expect(classifySession(s, ctx([titleRule, appRule])).classId).toBe("neutral");
    expect(classifySession(sess({ app_key: "Browser | GitHub", app: "Firefox" }), ctx([appRule])).source).not.toBe("rule");
  });

  it("domain rules match hosts in titles and site tokens in keys", () => {
    const r = rule({ field: "title", match_kind: "domain", pattern: "youtube.com", class_id: "watch" });
    expect(classifySession(sess({ app_key: "Browser | x", window_title: "Talk - https://www.youtube.com/watch?v=1" }), ctx([r])).classId).toBe("watch");
    expect(classifySession(sess({ app_key: "Browser | x", window_title: "https://notyoutube.com/" }), ctx([r])).source).toBe("none");
    const bare = rule({ field: "app_key", match_kind: "domain", pattern: "youtube", class_id: "waste" });
    expect(classifySession(sess({ app_key: "Browser | YouTube" }), ctx([bare])).classId).toBe("waste");
  });

  it("a broken regex is skipped instead of throwing", () => {
    const bad = rule({ match_kind: "regex", pattern: "([unclosed", class_id: "waste", priority: 10 });
    const good = rule({ match_kind: "regex", pattern: "^browser \\| you", class_id: "watch" });
    const c = classifySession(sess({ app_key: "Browser | YouTube" }), ctx([bad, good]));
    expect(c.classId).toBe("watch");
    expect(c.source).toBe("rule");
  });
});

// ---------------------------------------------------------------------------
// regex safety
// ---------------------------------------------------------------------------

describe("regex safety", () => {
  it("screens dangerous shapes statically", () => {
    expect(regexPatternProblem("^browser \\| you")).toBeNull();
    expect(regexPatternProblem("a".repeat(201))).toMatch(/200/);
    expect(regexPatternProblem("(a)\\1")).toMatch(/wsteczne/);
    expect(regexPatternProblem("^(a+)+$")).toMatch(/Zagnieżdżone/);
    expect(regexPatternProblem("(?:.*)+x")).toMatch(/Zagnieżdżone/);
    expect(regexPatternProblem("(\\w+\\s?)*$")).toMatch(/Zagnieżdżone/);
    expect(regexPatternProblem("a+*")).toMatch(/Kwantyfikator/);
    expect(regexPatternProblem("([unclosed")).toMatch(/Niepoprawne/);
  });

  it("a regex that blows the probe budget is disabled for the session and flagged", () => {
    const slow = rule({ match_kind: "regex", pattern: "^(a|a)*$", class_id: "waste", priority: 50 });
    const invalid = rule({ match_kind: "regex", pattern: "^(a+)+$", class_id: "waste", enabled: false });
    const fine = rule({ match_kind: "regex", pattern: "^a+$", class_id: "work" });
    const rules = [slow, invalid, fine];
    const health = ruleHealth(rules);
    expect(health.get(slow.id)?.status).toBe("slow");
    expect(health.get(invalid.id)?.status).toBe("invalid");
    expect(health.get(fine.id)?.status).toBe("ok");
    const c = classifySession(sess({ app_key: "aaaa" }), ctx(rules));
    expect(c.ruleId).toBe(fine.id);
  });
});

// ---------------------------------------------------------------------------
// classifySession: keywords, priors, none
// ---------------------------------------------------------------------------

describe("classifySession: keywords and priors", () => {
  it("class keywords must match as whole words, case-insensitively", () => {
    expect(classifySession(sess({ app_key: "Browser | reddit" }), ctx()).classId).toBe("waste");
    const c = classifySession(sess({ app_key: "Browser | Redditor" }), ctx());
    expect(c.source).toBe("none");
    expect(classifySession(sess({ app_key: "Browser | reddit" }), ctx()).confidence).toBe(0.75);
  });

  it("a project name in the key or title yields the work class with projectId set", () => {
    const c = classifySession(sess({ app_key: "PyCharm | mindsetforest" }), ctx());
    expect(c.classId).toBe("work");
    expect(c.projectId).toBe("p1");
    expect(c.source).toBe("keyword");
    // class keyword + project name in the same text attaches the project too
    const c2 = classifySession(sess({ app_key: "Code | mindsetforest" }), ctx());
    expect(c2.classId).toBe("work");
    expect(c2.projectId).toBe("p1");
    // a class bound to the project wins over the default work class
    const bound = cls({ id: "mf", kind: "work", name: "MF", project_id: "p1", sort_order: 9 });
    const c3 = classifySession(sess({ app_key: "PyCharm | mindsetforest" }), ctx([], { classes: [...CLASSES, bound] }));
    expect(c3.classId).toBe("mf");
  });

  it("uses the per-app prior only at share >= 0.7 and with enough history", () => {
    const s = sess({ app_key: "Figma" });
    const low = classifySession(s, ctx([], { priors: { Figma: { classId: "work", share: 0.6 } } }));
    expect(low.source).toBe("none");
    const high = classifySession(s, ctx([], { priors: { Figma: { classId: "work", share: 0.8 } } }));
    expect(high.source).toBe("prior");
    expect(high.classId).toBe("work");
    expect(high.confidence).toBeCloseTo(0.55 + 0.15 * 0.8, 3);
    const thin = classifySession(s, ctx([], { priors: { Figma: { classId: "work", share: 1, seconds: 600 } } }));
    expect(thin.source).toBe("none");
  });

  it("classifyAll derives priors from rule/keyword decisions for the second pass", () => {
    const r = rule({ field: "title", match_kind: "substring", pattern: "repo", class_id: "work" });
    const sessions = [
      sess({ app_key: "Figma", app: "Figma", window_title: "repo design", seconds: 3000 }),
      sess({ app_key: "Figma", app: "Figma", window_title: "logo", seconds: 100 }),
    ];
    const priors = computeAppPriors(sessions, sessions.map((s) => classifySession(s, ctx([r]))));
    expect(priors.Figma).toMatchObject({ classId: "work", share: 1, seconds: 3000 });
    const all = classifyAll(sessions, ctx([r]));
    expect(all[0].source).toBe("rule");
    expect(all[1].source).toBe("prior");
    expect(all[1].classId).toBe("work");
  });

  it("an unknown browser site never inherits the browser's history", () => {
    const rules = [rule({ pattern: "Browser | GitHub", class_id: "work" }), rule({ pattern: "Browser | YouTube", class_id: "watch" })];
    const sessions = [
      sess({ app_key: "Browser | GitHub", app: "Chrome", seconds: 5 * 3600 }),
      sess({ app_key: "Browser | YouTube", app: "Chrome", seconds: 3600 }),
      sess({ app_key: "Browser | new-site", app: "Chrome", seconds: 900 }),
      sess({ app_key: "Code | new-project", app: "Code", seconds: 900 }),
    ];
    const all = classifyAll(sessions, ctx(rules, { classes: CLASSES.map((c) => ({ ...c, keywords: [] })) }));
    expect(all[2].source).toBe("none");
    expect(all[3].source).toBe("none");
    const priors = computeAppPriors(sessions, all);
    expect(priors.Chrome).toBeUndefined();
    expect(priors["Browser | GitHub"].classId).toBe("work");
  });

  it("priors ignore idle time and need 30 minutes of history", () => {
    const r = rule({ field: "title", match_kind: "substring", pattern: "budget", class_id: "work" });
    const idleWaste = rule({ field: "title", match_kind: "substring", pattern: "party", class_id: "waste" });
    const sessions = [
      sess({ app_key: "Word", app: "Word", window_title: "budget.docx", seconds: 1000 }),
      sess({ app_key: "Word", app: "Word", window_title: "party.docx", seconds: 20000, idle: true }),
    ];
    const thin = computeAppPriors(sessions, sessions.map((s) => classifySession(s, ctx([r, idleWaste]))));
    expect(thin.Word).toBeUndefined(); // 1000 s non-idle is below the 30-minute floor
    sessions.push(sess({ app_key: "Word", app: "Word", window_title: "budget v2.docx", seconds: 1000 }));
    const priors = computeAppPriors(sessions, sessions.map((s) => classifySession(s, ctx([r, idleWaste]))));
    expect(priors.Word).toMatchObject({ classId: "work", share: 1, seconds: 2000 });
    const unknown = classifySession(sess({ app_key: "Word", app: "Word", window_title: "letter.docx" }), ctx([], { priors }));
    expect(unknown.classId).toBe("work");
  });

  it("returns none when nothing applies", () => {
    const c = classifySession(sess({ app_key: "Mystery" }), ctx());
    expect(c).toMatchObject({ classId: null, projectId: null, confidence: 0, source: "none" });
  });
});

// ---------------------------------------------------------------------------
// aggregateUsage
// ---------------------------------------------------------------------------

describe("aggregateUsage", () => {
  const rules = [
    rule({ pattern: "Code | mindsetforest", class_id: "work", project_id: "p1" }),
    rule({ pattern: "Browser | YouTube", class_id: "watch" }),
    rule({ pattern: "Browser | docs", class_id: "learn" }),
    rule({ pattern: "Explorer", class_id: "neutral" }),
  ];
  const sessions = [
    sess({ app_key: "Code | mindsetforest", seconds: 3600, window_title: "a.ts" }),
    sess({ app_key: "Code | mindsetforest", seconds: 1800, window_title: "b.ts", local_date: "2026-09-27" }),
    sess({ app_key: "Browser | YouTube", seconds: 600 }),
    sess({ app_key: "Browser | YouTube", seconds: 900, idle: true }), // watching counts idle
    sess({ app_key: "Code | mindsetforest", seconds: 500, idle: true }), // work does not
    sess({ app_key: "Browser | docs", seconds: 1200 }),
    sess({ app_key: "Explorer", seconds: 300 }),
    sess({ app_key: "Mystery", seconds: 700 }),
    sess({ app_key: "Mystery", seconds: 200, idle: true }), // unassigned idle is away time
  ];
  const agg = aggregateUsage(sessions, CLASSES, classifyAll(sessions, ctx(rules)));

  it("counts idle sessions only in count_idle classes", () => {
    expect(agg.byKind.watching).toBe(1500);
    expect(agg.byKind.work).toBe(5400);
    expect(agg.idleSeconds).toBe(700);
    expect(agg.totalSeconds).toBe(3600 + 1800 + 600 + 900 + 1200 + 300 + 700);
  });

  it("sums per class, project, pillar and reports unclassified time", () => {
    expect(agg.byClass.work).toBe(5400);
    expect(agg.byProject.p1).toBe(5400);
    expect(agg.byPillar.mind).toBe(1200);
    expect(agg.unclassifiedSeconds).toBe(700);
  });

  it("focus ratio = productive / non-idle non-neutral time", () => {
    // non-idle, non-neutral: work 5400 + watch 600 + learn 1200 + unassigned 700 = 7900
    expect(agg.focusRatio).toBeCloseTo(6600 / 7900, 6);
  });

  it("builds a per-day series and ranked app keys with sample titles", () => {
    expect(agg.byDay.map((d) => d.date)).toEqual(["2026-09-27", "2026-09-28"]);
    expect(agg.byDay[0].byKind.work).toBe(1800);
    expect(agg.byDay[0].focusRatio).toBe(1);
    expect(agg.topAppKeys[0].appKey).toBe("Code | mindsetforest");
    expect(agg.topAppKeys[0].sessions).toBe(2);
    expect(agg.topAppKeys[0].titles).toEqual(["a.ts", "b.ts"]);
    expect(agg.topAppKeys[0].kind).toBe("work");
    expect(agg.byAppKey["Mystery"].classId).toBeNull();
    expect(agg.byAppKey["Mystery"].source).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// proposeRule and helpers
// ---------------------------------------------------------------------------

describe("proposeRule", () => {
  it("proposes the whole site for a browser key", () => {
    const p = proposeRule("Browser | YouTube", "Some video", "watch", { app: "Chrome", labels: [] });
    expect(p).toMatchObject({ field: "app_key", match_kind: "exact", pattern: "Browser | YouTube", class_id: "watch" });
    expect(p?.reason).toContain("YouTube");
  });

  it("does not repeat a rule that already exists", () => {
    const p = proposeRule("Browser | YouTube", "", "watch", {
      app: "Chrome",
      labels: [],
      existingRules: [{ field: "app_key", match_kind: "exact", pattern: "browser | youtube" }],
    });
    expect(p).toBeNull();
  });

  it("proposes the app after three keys of it share a class", () => {
    const labels = [
      { appKey: "Code | a", app: "Code", classId: "work" },
      { appKey: "Code | b", app: "Code", classId: "work" },
      { appKey: "Code | other", app: "Code", classId: "waste" },
    ];
    expect(proposeRule("Code | c", "", "work", { app: "Code", labels })).toMatchObject({ field: "app", match_kind: "exact", pattern: "Code" });
    expect(proposeRule("Code | c", "", "work", { app: "Code", labels: labels.slice(0, 1) })).toBeNull();
  });

  it("proposes a title rule bound to a project whose name recurs", () => {
    const p = proposeRule("Word", "mindsetforest plan.docx", "work", {
      app: "Word",
      labels: [],
      projects: [{ id: "p1", name: "mindsetforest" }],
      titles: ["notes.docx", "mindsetforest budget.docx"],
    });
    expect(p).toMatchObject({ field: "title", match_kind: "substring", pattern: "mindsetforest", project_id: "p1", class_id: "work" });
  });

  it("planLabelWrite keeps a manual rule and upserts a label otherwise", () => {
    const manual = rule({ pattern: "Word", class_id: "work", source: "manual", priority: PRIORITY_MANUAL });
    const label = rule({ pattern: "Excel", class_id: "work", source: "label", priority: PRIORITY_LABEL });
    expect(planLabelWrite([manual, label], "Word")).toEqual({ mode: "update", ruleId: manual.id });
    expect(planLabelWrite([manual, label], "Excel")).toEqual({ mode: "upsert", priority: PRIORITY_LABEL });
    expect(planLabelWrite([manual, label], "Nowy")).toEqual({ mode: "upsert", priority: PRIORITY_LABEL });
  });

  it("competingRule names the rule that outranks a fresh label", () => {
    const manualApp = rule({ field: "app", pattern: "Chrome", class_id: "neutral", source: "manual", priority: PRIORITY_MANUAL });
    const label = rule({ pattern: "Browser | GitHub", class_id: "work", source: "label", priority: PRIORITY_LABEL });
    const s = sess({ app_key: "Browser | GitHub", app: "Chrome" });
    expect(competingRule(s, ctx([manualApp, label]), "work")?.id).toBe(manualApp.id);
    expect(competingRule(s, ctx([label]), "work")).toBeNull();
    expect(competingRule(s, ctx([manualApp, label]), "neutral")).toBeNull();
  });

  it("siteToken, testRule, formatHm and median", () => {
    expect(siteToken("Browser | GitHub")).toBe("GitHub");
    expect(siteToken("Code | x")).toBeNull();
    const hits = testRule({ field: "app_key", match_kind: "substring", pattern: "browser" }, [
      sess({ app_key: "Browser | a" }),
      sess({ app_key: "Code | a" }),
    ]);
    expect(hits.map((h) => h.app_key)).toEqual(["Browser | a"]);
    expect(formatHm(5400)).toBe("1:30");
    expect(formatHm(59)).toBe("0:00");
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// weekday baseline and row adapters
// ---------------------------------------------------------------------------

describe("weekday baseline", () => {
  const rules = [rule({ pattern: "Code", class_id: "work" })];
  // local ISO strings so the time-of-day cutoff is deterministic across zones
  const at = (date: string, hh: number, mm = 0) => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d, hh, mm).toISOString();
  };
  const day = (date: string, hh: number, seconds: number) =>
    sess({ app_key: "Code", local_date: date, started_at: at(date, hh), ended_at: at(date, hh, 30), seconds });

  it("minutes since 04:00 honour the day boundary", () => {
    expect(logicalMinutesOfDay(new Date(2026, 8, 28, 4, 0))).toBe(0);
    expect(logicalMinutesOfDay(new Date(2026, 8, 28, 10, 30))).toBe(390);
    expect(logicalMinutesOfDay(new Date(2026, 8, 28, 3, 59))).toBe(1439);
  });

  it("takes the median over the days that have data and needs at least two", () => {
    const dates = ["2026-09-21", "2026-09-14", "2026-09-07", "2026-08-31"];
    const one = [day("2026-09-21", 9, 3600)];
    expect(weekdayBaseline(one, CLASSES, classifyAll(one, ctx(rules)), dates, null)).toBeNull();
    const three = [day("2026-09-21", 9, 3600), day("2026-09-14", 9, 1800), day("2026-09-07", 9, 7200)];
    const b = weekdayBaseline(three, CLASSES, classifyAll(three, ctx(rules)), dates, null);
    expect(b?.days).toBe(3);
    expect(b?.byKind.work).toBe(3600); // median of 3600, 1800, 7200, missing day ignored
  });

  it("a partial today is compared with the same time-of-day slice of earlier days", () => {
    const dates = ["2026-09-21", "2026-09-14"];
    const sessions = [day("2026-09-21", 9, 1800), day("2026-09-21", 20, 3600), day("2026-09-14", 9, 1800), day("2026-09-14", 21, 3600)];
    const cls = classifyAll(sessions, ctx(rules));
    expect(weekdayBaseline(sessions, CLASSES, cls, dates, null)?.byKind.work).toBe(5400);
    // cutoff at 12:00 local = 480 minutes after 04:00
    expect(weekdayBaseline(sessions, CLASSES, cls, dates, 480)?.byKind.work).toBe(1800);
  });
});

describe("row adapters", () => {
  const row = {
    id: "x",
    device_id: "d",
    app: "Code",
    app_key: "Code | p",
    window_title: "t",
    started_at: "2026-09-28T08:00:00Z",
    ended_at: "2026-09-28T08:00:00Z",
    seconds: 0,
    idle: false,
    local_date: "2026-09-28",
  };
  it("drops zero-second tombstones", () => {
    expect(rowToSession(row)).toBeNull();
    expect(rowToSession({ ...row, seconds: 5 })?.seconds).toBe(5);
    const daily = { local_date: "2026-09-28", device_id: "d", app: "Code", app_key: "Code | p", idle: false, seconds: 0, session_count: 1, last_seen_at: null };
    expect(dailyRowToSession(daily)).toBeNull();
    expect(dailyRowToSession({ ...daily, seconds: 60 })?.seconds).toBe(60);
  });
});

describe("review fixes", () => {
  it("a word in the app key beats an earlier class's word in the title", () => {
    const s = sess({ app_key: "Browser | YouTube", window_title: "Claude Code in 10 minutes - YouTube" });
    expect(classifySession(s, ctx()).classId).toBe("watch");
  });

  it("a title keyword still classifies when the key names nothing", () => {
    const s = sess({ app_key: "Browser | other", window_title: "Python docs: asyncio" });
    expect(classifySession(s, ctx()).classId).toBe("learn");
  });

  it("idle time in a watching class counts up to three hours per session", () => {
    const s = sess({ app_key: "Browser | YouTube", idle: true, seconds: 5 * 3600 });
    const agg = aggregateUsage([s], CLASSES, classifyAll([s], ctx()));
    expect(agg.byKind.watching).toBe(3 * 3600);
    expect(agg.idleSeconds).toBe(2 * 3600);
  });

  it("the weekday baseline only counts the part of a session before the cutoff", () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 21, h, m).toISOString();
    const long = (date: string) => sess({ app_key: "Code", local_date: date, started_at: at(9, 50), ended_at: at(12), seconds: 7800 });
    const sessions = [long("2026-09-21"), long("2026-09-14")];
    // cutoff 10:00 local = 360 minutes after 04:00: 10 minutes of each session
    expect(weekdayBaseline(sessions, CLASSES, classifyAll(sessions, ctx()), ["2026-09-21", "2026-09-14"], 360)?.byKind.work).toBe(600);
  });
});
