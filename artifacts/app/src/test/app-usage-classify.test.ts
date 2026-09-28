import { describe, it, expect } from "vitest";
import {
  classifySession,
  classifyAll,
  aggregateUsage,
  computeAppPriors,
  proposeRule,
  testRule,
  formatHm,
  median,
  siteToken,
  type AppClass,
  type AppRule,
  type UsageSession,
  type ClassifyContext,
} from "../lib/app-usage-classify";

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

  it("uses the per-app prior only at share >= 0.7", () => {
    const s = sess({ app_key: "Figma" });
    const low = classifySession(s, ctx([], { priors: { Figma: { classId: "work", share: 0.6 } } }));
    expect(low.source).toBe("none");
    const high = classifySession(s, ctx([], { priors: { Figma: { classId: "work", share: 0.8 } } }));
    expect(high.source).toBe("prior");
    expect(high.classId).toBe("work");
    expect(high.confidence).toBeCloseTo(0.55 + 0.15 * 0.8, 3);
  });

  it("classifyAll derives priors from rule/keyword decisions for the second pass", () => {
    const r = rule({ field: "title", match_kind: "substring", pattern: "repo", class_id: "work" });
    const sessions = [
      sess({ app_key: "Figma", app: "Figma", window_title: "repo design", seconds: 800 }),
      sess({ app_key: "Figma", app: "Figma", window_title: "logo", seconds: 100 }),
    ];
    const priors = computeAppPriors(sessions, sessions.map((s) => classifySession(s, ctx([r]))));
    expect(priors.Figma.share).toBe(1);
    const all = classifyAll(sessions, ctx([r]));
    expect(all[0].source).toBe("rule");
    expect(all[1].source).toBe("prior");
    expect(all[1].classId).toBe("work");
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
