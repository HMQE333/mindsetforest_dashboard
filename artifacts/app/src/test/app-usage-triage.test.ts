import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  classifyAll,
  MAX_COUNTED_IDLE_SECONDS,
  PRIORITY_LABEL,
  type AppClass,
  type AppRule,
  type Classification,
  type UsageSession,
} from "../lib/app-usage-classify";
import type { AiSuggestion } from "../lib/app-usage-ai";
import { revertLabels, writeGroupClaims, writeLabelBatch } from "../hooks/useAppUsage";
import {
  SKIP,
  buildTriage,
  defaultChoices,
  deviceOf,
  displayTitle,
  durationLabel,
  friendlyName,
  needsAi,
  planConfirm,
  planGroupClaims,
  planLabelBatch,
  plural,
  siblingNames,
  toAiItems,
  triageWeight,
  triageWorth,
  unassignedAfter,
  type TriageInput,
  type TriageItem,
  type TriageResult,
} from "../lib/app-usage-triage";

// A recording fake of the query builder: the batch writers' requests, and
// the upsert answering with an id per pattern (an existing one when known).
const db = vi.hoisted(() => {
  type Call = { table: string; op: string; payload: unknown; options: unknown; select: string | null; filters: [string, string, unknown][] };
  const state = {
    calls: [] as Call[],
    existing: new Map<string, string>(),
    fail: null as null | ((c: Call) => { code?: string; message?: string } | null),
    reset() {
      state.calls = [];
      state.existing = new Map();
      state.fail = null;
    },
  };
  const respond = (c: Call) => {
    const error = state.fail?.(c) ?? null;
    if (error) return { data: null, error };
    if (c.op === "upsert" && c.select) {
      const rows = (c.payload as { pattern: string }[]).map((r) => ({ id: state.existing.get(r.pattern) ?? `new:${r.pattern}`, pattern: r.pattern }));
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  };
  const from = (table: string) => {
    const call: Call = { table, op: "", payload: null, options: null, select: null, filters: [] };
    state.calls.push(call);
    const q = {
      update: (p: unknown) => ((call.op = "update"), (call.payload = p), q),
      upsert: (p: unknown, o: unknown) => ((call.op = "upsert"), (call.payload = p), (call.options = o), q),
      delete: () => ((call.op = "delete"), q),
      select: (cols: string) => ((call.select = cols), q),
      eq: (k: string, v: unknown) => (call.filters.push(["eq", k, v]), q),
      in: (k: string, v: unknown) => (call.filters.push(["in", k, v]), q),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(respond(call)).then(ok, bad),
    };
    return q;
  };
  return { state, from };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from } }));

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
  catalog_groups: [],
  ...over,
});

const WORK = cls({ id: "work", kind: "work", name: "Praca", sort_order: 0 });
const LEARN = cls({ id: "learn", kind: "learning", name: "Nauka", sort_order: 1 });
const COMM = cls({ id: "comm", kind: "communication", name: "Komunikacja", sort_order: 2 });
const WATCH = cls({ id: "watch", kind: "watching", name: "Oglądanie", count_idle: true, sort_order: 3 });
const WASTE = cls({ id: "waste", kind: "waste", name: "Marnowanie", keywords: ["Plotki"], sort_order: 4 });
const NEUTRAL = cls({ id: "neutral", kind: "neutral", name: "Neutralne", is_default: true, sort_order: 5 });
const CLASSES = [WORK, LEARN, COMM, WATCH, WASTE, NEUTRAL];

let ruleSeq = 0;
const rule = (over: Partial<AppRule> & { pattern: string; class_id: string }): AppRule => ({
  id: `r${++ruleSeq}`,
  field: "app_key",
  match_kind: "exact",
  project_id: null,
  priority: PRIORITY_LABEL,
  source: "label",
  confidence: 1,
  enabled: true,
  hits: 0,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

const PC = "3f2a1b9c-1111-2222-3333-444455556666";
const PHONE = "android:Pixel 8:1a2b3c";

let sessSeq = 0;
const sess = (over: Partial<UsageSession> & { app_key: string }): UsageSession => {
  const n = ++sessSeq;
  return {
    id: `s${n}`,
    device_id: PC,
    app: over.app_key.split("|")[0].trim(),
    window_title: "",
    started_at: "2026-10-05T10:00:00Z",
    ended_at: "2026-10-05T10:10:00Z",
    seconds: 600,
    idle: false,
    local_date: "2026-10-05",
    ...over,
  };
};

const min = (m: number) => m * 60;

function run(sessions: UsageSession[], over: Partial<TriageInput> = {}): TriageResult {
  const classes = over.classes ?? CLASSES;
  const rules = over.rules ?? [];
  const classifications = over.classifications ?? classifyAll(sessions, { classes, rules, projects: [] });
  return buildTriage({ sessions, classifications, classes, rules, dismissed: new Set(), ai: new Map(), ...over });
}

const byId = (r: TriageResult, id: string): TriageItem => {
  const it = r.items.find((x) => x.id === id);
  if (!it) throw new Error(`no row ${id}: ${r.items.map((x) => x.id).join(", ")}`);
  return it;
};

const ai = (over: Partial<AiSuggestion> & { app_key: string }): AiSuggestion => ({
  class_id: null,
  alt_class_id: null,
  confidence: 0.9,
  multi: false,
  why: "sklep wędkarski",
  cached: false,
  ...over,
});

// ---------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------

describe("friendlyName / deviceOf / siblingNames / displayTitle", () => {
  it("names a browser key by its site, a package by its label or the catalog, anything else by its key", () => {
    expect(friendlyName("Browser | YouTube", "Brave")).toBe("YouTube");
    expect(friendlyName("Browser | rybiapaka.pl", "Chrome")).toBe("rybiapaka.pl");
    expect(friendlyName("com.facebook.orca", "Messenger")).toBe("Messenger");
    // A phone that reports the package as its label: the catalog knows the name.
    expect(friendlyName("com.openai.chatgpt", "com.openai.chatgpt")).toBe("ChatGPT");
    expect(friendlyName("com.unknown.thing", "")).toBe("com.unknown.thing");
    expect(friendlyName("Code | mindsetforest", "Code")).toBe("Code | mindsetforest");
    expect(friendlyName("Claude", "Claude")).toBe("Claude");
  });

  it("tells a phone by its android: id", () => {
    expect(deviceOf(PHONE)).toBe("phone");
    expect(deviceOf(PC)).toBe("pc");
  });

  it("derives sibling names from hosts and package segments, skipping filler segments", () => {
    expect(siblingNames("Browser | rybiapaka.pl", "Brave")).toEqual(["rybiapaka.pl", "rybiapaka"]);
    expect(siblingNames("pl.rybiapaka.app", "RybiaPaka")).toEqual(["rybiapaka"]);
    expect(siblingNames("com.openai.chatgpt", "ChatGPT")).toEqual(["chatgpt"]);
    expect(siblingNames("com.google.android.gm", "Gmail")).toEqual(["gmail"]);
    expect(siblingNames("Browser | X", "Brave")).toEqual([]);
  });

  it("drops the unread counter and the browser's name from a title", () => {
    expect(displayTitle("(3) Inbox - Gmail - Brave")).toBe("Inbox - Gmail");
    expect(displayTitle("Edge tab - Microsoft​ Edge")).toBe("Edge tab");
    expect(displayTitle("Raport.docx - Word")).toBe("Raport.docx - Word");
  });
});

// ---------------------------------------------------------------------------
// buildTriage: what counts
// ---------------------------------------------------------------------------

describe("buildTriage: considered time and totals", () => {
  it("counts like aggregateUsage and leaves the user's own decisions (rules, keywords) out of the rows", () => {
    const sessions = [
      sess({ app_key: "Browser | Plotki", seconds: min(10) }), // keyword -> decided
      sess({ app_key: "Labelled", seconds: min(10) }), // rule -> decided
      sess({ app_key: "Discord", app: "Discord", seconds: min(10) }), // catalog -> guessed
      sess({ app_key: "Mystery", seconds: min(10) }), // none
      sess({ app_key: "Mystery", seconds: min(30), idle: true }), // idle, not counted
      sess({ app_key: "Browser | YouTube", seconds: 5 * 3600, idle: true }), // idle in a count_idle class: capped
    ];
    const r = run(sessions, { rules: [rule({ pattern: "Labelled", class_id: "work" })] });
    expect(r.totalSeconds).toBe(min(40) + MAX_COUNTED_IDLE_SECONDS);
    expect(r.unassignedSeconds).toBe(min(10));
    expect(r.guessedSeconds).toBe(min(10) + MAX_COUNTED_IDLE_SECONDS);
    expect(r.items.map((i) => i.id).sort()).toEqual(["cat:discord", "cat:youtube", "key:Mystery"]);
    expect(byId(r, "key:Mystery").unassignedSeconds).toBe(min(10));
    expect(byId(r, "cat:discord").unassignedSeconds).toBe(0);
  });

  it("never makes a row of Browser | other: its time is reported apart", () => {
    const r = run([
      sess({ app_key: "Browser | other", app: "Brave", window_title: "Moja rozmowa - Brave", seconds: min(30) }),
      sess({ app_key: "Browser | other", app: "Brave", window_title: "New Tab - Brave", seconds: min(5) }),
    ]);
    expect(r.items).toEqual([]);
    expect(r.otherBucketSeconds).toBe(min(35));
    expect(r.unassignedSeconds).toBe(min(30));
  });

  it("does not walk the sessions again when only the answers change, and does when the classes change", () => {
    const sessions = [sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(10) })];
    const classifications = classifyAll(sessions, { classes: CLASSES, rules: [] });
    const a = run(sessions, { classifications });
    const b = run(sessions, { classifications, groupAnswers: { ai_chat: "learn" } });
    expect(a.items[0].suggestion?.classId).toBe("work");
    expect(b.items[0].suggestion?.classId).toBe("learn");
    // count_idle flips: the cached walk must not be reused for a different classes array.
    const idle = [sess({ app_key: "Mystery", seconds: min(10), idle: true })];
    const idleCls = classifyAll(idle, { classes: CLASSES, rules: [] });
    expect(run(idle, { classifications: idleCls }).totalSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildTriage: grouping
// ---------------------------------------------------------------------------

describe("buildTriage: rows", () => {
  it("puts one service's phone app, PC app and browser tab in one row that writes every key", () => {
    const r = run([
      sess({ app_key: "com.openai.chatgpt", app: "ChatGPT", device_id: PHONE, seconds: min(20) }),
      sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(30) }),
      sess({ app_key: "Browser | ChatGPT", app: "Brave", window_title: "ChatGPT - Brave", seconds: min(10) }),
    ]);
    expect(r.items).toHaveLength(1);
    const row = r.items[0];
    expect(row).toMatchObject({ id: "cat:chatgpt", name: "ChatGPT", catalogId: "chatgpt", group: "ai_chat", seconds: min(60) });
    expect(row.appKeys).toEqual(["Chatgpt", "com.openai.chatgpt", "Browser | ChatGPT"]);
    expect(row.devices).toEqual(["pc", "phone"]);
  });

  it("joins a browser key to an entry only when most of its time matched it in the title", () => {
    const r = run([
      sess({ app_key: "Browser | Cybersecurity", app: "Brave", window_title: "(12) Discord | #czat | Cybersecurity - Brave", seconds: min(10) }),
      sess({ app_key: "Browser | Half", app: "Brave", window_title: "Discord | #x | Half - Brave", seconds: min(5) }),
      sess({ app_key: "Browser | Half", app: "Brave", window_title: "Half - Brave", seconds: min(5) }),
    ]);
    expect(byId(r, "cat:discord").appKeys).toEqual(["Browser | Cybersecurity"]);
    expect(byId(r, "key:Browser | Half").catalogId).toBeNull();
  });

  it("keeps the top titles without the browser suffix or the app's own name", () => {
    const r = run([
      sess({ app_key: "Mystery", app: "Mystery", window_title: "Mystery", seconds: min(30) }),
      sess({ app_key: "Mystery", app: "Mystery", window_title: "Raport - Mystery", seconds: min(20) }),
      sess({ app_key: "Mystery", app: "Mystery", window_title: "(2) Notatki - Brave", seconds: min(10) }),
    ]);
    expect(byId(r, "key:Mystery").titles).toEqual(["Raport - Mystery", "Notatki"]);
  });

  it("drops dismissed keys (also out of a catalog row) and rows under minSeconds, caps at max, sums the rest", () => {
    const sessions = [
      sess({ app_key: "com.openai.chatgpt", app: "ChatGPT", device_id: PHONE, seconds: min(20) }),
      sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(30) }),
      sess({ app_key: "A", seconds: min(9) }),
      sess({ app_key: "B", seconds: min(8) }),
      sess({ app_key: "C", seconds: min(7) }),
      sess({ app_key: "Tiny", seconds: 60 }),
    ];
    const r = run(sessions, { dismissed: new Set(["Chatgpt", "B"]), max: 2 });
    expect(r.items.map((i) => i.id)).toEqual(["cat:chatgpt", "key:A"]);
    expect(byId(r, "cat:chatgpt")).toMatchObject({ appKeys: ["com.openai.chatgpt"], seconds: min(20) });
    expect(r.rest).toEqual({ count: 1, seconds: min(7) });
    const all = run(sessions, { dismissed: new Set(["Chatgpt", "B"]), max: Infinity });
    expect(all.items.map((i) => i.id)).toEqual(["cat:chatgpt", "key:A", "key:C"]);
  });

  it("orders by time with unassigned time counted twice", () => {
    const r = run([
      sess({ app_key: "Discord", app: "Discord", seconds: min(25) }), // guessed: weight 25
      sess({ app_key: "Mystery", seconds: min(20) }), // unassigned: weight 40
      sess({ app_key: "com.instagram.android", app: "Instagram", device_id: PHONE, seconds: min(60) }), // guessed: 60
    ]);
    expect(r.items.map((i) => i.id)).toEqual(["cat:instagram", "key:Mystery", "cat:discord"]);
    expect(triageWeight({ seconds: 100, unassignedSeconds: 40 })).toBe(140);
  });
});

// ---------------------------------------------------------------------------
// buildTriage: suggestions
// ---------------------------------------------------------------------------

describe("buildTriage: suggestions", () => {
  it("pre-selects the catalog's class, with the entry's alternative kinds as alternatives", () => {
    const r = run([sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(10) })]);
    expect(r.items[0].suggestion).toMatchObject({ classId: "work", source: "catalog", preselect: true, altClassIds: ["learn"] });
    expect(r.items[0].suggestion?.why).toBe("Katalog: ChatGPT");
  });

  it("follows a pending group answer, and a stored claim through catalogClassFor", () => {
    const sessions = [sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(10) })];
    const answered = run(sessions, { groupAnswers: { ai_chat: "learn" } }).items[0].suggestion;
    expect(answered).toMatchObject({ classId: "learn", source: "catalog", preselect: true, confidence: 0.9 });
    expect(answered?.why).toContain("Twoja odpowiedź");
    expect(answered?.altClassIds).toContain("work");
    const claimed = [WORK, { ...LEARN, catalog_groups: ["ai_chat"] }, COMM, WATCH, WASTE, NEUTRAL];
    expect(run(sessions, { classes: claimed }).items[0].suggestion).toMatchObject({ classId: "learn", source: "catalog" });
    // An answer naming a class that does not exist is ignored.
    expect(run(sessions, { groupAnswers: { ai_chat: "gone" } }).items[0].suggestion?.classId).toBe("work");
  });

  it("suggests an opaque entry (a phone browser) without pre-selecting it, and never asks the AI about it", () => {
    const r = run([sess({ app_key: "com.android.chrome", app: "Chrome", device_id: PHONE, seconds: min(30) })]);
    const row = byId(r, "cat:phone_browsers");
    expect(row.unassignedSeconds).toBe(min(30));
    expect(row.suggestion).toMatchObject({ classId: "neutral", source: "catalog", preselect: false });
    expect(needsAi(row)).toBe(false);
  });

  it("prefers a key of the same entry the user already labelled over the entry's default", () => {
    const rules = [rule({ pattern: "Browser | ChatGPT", class_id: "learn" })];
    const sessions = [
      sess({ app_key: "com.openai.chatgpt", app: "ChatGPT", device_id: PHONE, seconds: min(20) }),
      sess({ app_key: "Browser | ChatGPT", app: "Brave", seconds: min(10) }), // decided by the rule
    ];
    const row = byId(run(sessions, { rules }), "cat:chatgpt");
    expect(row.appKeys).toEqual(["com.openai.chatgpt"]);
    expect(row.suggestion).toMatchObject({ classId: "learn", source: "sibling", preselect: true, altClassIds: ["work"] });
    expect(row.suggestion?.why).toBe("Tak jak „ChatGPT”");
    // An explicit answer still wins over the sibling.
    expect(byId(run(sessions, { rules, groupAnswers: { ai_chat: "work" } }), "cat:chatgpt").suggestion?.source).toBe("catalog");
  });

  it("suggests the class of a labelled key with the same name on another device", () => {
    const rules = [rule({ pattern: "Browser | rybiapaka.pl", class_id: "learn" })];
    const r = run([sess({ app_key: "pl.rybiapaka.app", app: "RybiaPaka", device_id: PHONE, seconds: min(5) })], { rules });
    expect(r.items[0].suggestion).toMatchObject({ classId: "learn", source: "sibling", preselect: true });
    // A suggested (not accepted) rule is not the user's decision.
    const suggested = [rule({ pattern: "Browser | rybiapaka.pl", class_id: "learn", source: "suggested" })];
    const s2 = run([sess({ app_key: "pl.rybiapaka.app", app: "RybiaPaka", device_id: PHONE, seconds: min(5) })], { rules: suggested });
    expect(s2.items[0].suggestion).toBeNull();
  });

  it("uses the AI: pre-selected only when sure, single-purpose and not the user's earlier pick", () => {
    const sessions = [
      sess({ app_key: "Browser | rybiapaka.pl", app: "Brave", seconds: min(20) }),
      sess({ app_key: "Browser | najlepsiwykonawcy.pl", app: "Chrome", seconds: min(15) }),
      sess({ app_key: "Browser | multi.pl", app: "Chrome", seconds: min(10) }),
      sess({ app_key: "Browser | decided.pl", app: "Chrome", seconds: min(9) }),
      sess({ app_key: "Browser | gone.pl", app: "Chrome", seconds: min(8) }),
    ];
    const map = new Map<string, AiSuggestion>([
      ["Browser | rybiapaka.pl", ai({ app_key: "Browser | rybiapaka.pl", class_id: "waste", alt_class_id: "neutral", confidence: 0.9 })],
      ["Browser | najlepsiwykonawcy.pl", ai({ app_key: "Browser | najlepsiwykonawcy.pl", class_id: "work", confidence: 0.6 })],
      ["Browser | multi.pl", ai({ app_key: "Browser | multi.pl", class_id: "work", confidence: 0.95, multi: true })],
      ["Browser | decided.pl", ai({ app_key: "Browser | decided.pl", class_id: "learn", confidence: 0.5, decided: true, why: "Twój wcześniejszy wybór" })],
      ["Browser | gone.pl", ai({ app_key: "Browser | gone.pl", class_id: "deleted-class" })],
    ]);
    const r = run(sessions, { ai: map });
    const s = (k: string) => byId(r, `key:${k}`).suggestion;
    expect(s("Browser | rybiapaka.pl")).toMatchObject({ classId: "waste", source: "ai", preselect: true, altClassIds: ["neutral"] });
    expect(s("Browser | rybiapaka.pl")?.why).toBe("AI: sklep wędkarski");
    expect(s("Browser | najlepsiwykonawcy.pl")).toMatchObject({ classId: "work", preselect: false });
    expect(s("Browser | multi.pl")).toMatchObject({ classId: "work", preselect: false });
    expect(s("Browser | decided.pl")).toMatchObject({ classId: "learn", preselect: false, why: "Twój wcześniejszy wybór" });
    expect(s("Browser | gone.pl")).toBeNull();
    expect(needsAi(byId(r, "key:Browser | rybiapaka.pl"))).toBe(false);
    expect(needsAi(byId(r, "key:Browser | najlepsiwykonawcy.pl"))).toBe(true);
    expect(needsAi(byId(r, "key:Browser | gone.pl"))).toBe(true);
  });

  it("falls back to the prior the classifier used", () => {
    const sessions = [sess({ app_key: "Notes", seconds: min(10) })];
    const classifications: Classification[] = [
      { classId: "work", projectId: null, confidence: 0.67, source: "prior", why: "Historia: 80% czasu tej aplikacji w tej klasie" },
    ];
    const r = run(sessions, { classifications });
    expect(r.guessedSeconds).toBe(min(10));
    expect(r.items[0].suggestion).toMatchObject({ classId: "work", source: "prior", preselect: true, confidence: 0.67 });
  });

  it("stays silent (\"?\") with no catalog entry, sibling, AI answer or prior", () => {
    const r = run([sess({ app_key: "Mystery", seconds: min(10) })]);
    expect(r.items[0].suggestion).toBeNull();
    expect(needsAi(r.items[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildTriage: questions
// ---------------------------------------------------------------------------

describe("buildTriage: group questions", () => {
  const sessions = [
    sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(30) }),
    sess({ app_key: "com.anthropic.claude", app: "Claude", device_id: PHONE, seconds: min(10) }),
    sess({ app_key: "Spotify", app: "Spotify", seconds: min(3) }),
    sess({ app_key: "Browser | Allegro", app: "Brave", seconds: 90 }), // under 2 min: not asked
    sess({ app_key: "Browser | Wikipedia", app: "Brave", seconds: min(10) }), // reference: no ask_pl
  ];

  it("asks the groups with a question and at least 2 minutes behind them, biggest first", () => {
    const r = run(sessions);
    expect(r.questions.map((q) => q.group)).toEqual(["ai_chat", "music"]);
    const q = r.questions[0];
    expect(q).toMatchObject({ seconds: min(40), defaultClassId: "work", optionClassIds: ["work", "learn"], examples: ["ChatGPT", "Claude"] });
    expect(q.ask).toMatch(/praca czy nauka/);
    expect(r.questions[1]).toMatchObject({ defaultClassId: "neutral", optionClassIds: ["neutral", "watch"] });
  });

  it("offers every class of the kinds involved, and skips a question with fewer than two options", () => {
    const twoWork = [...CLASSES, cls({ id: "work2", kind: "work", name: "Klient", sort_order: 9 })];
    expect(run(sessions, { classes: twoWork }).questions[0].optionClassIds).toEqual(["work", "work2", "learn"]);
    const noLearning = CLASSES.filter((c) => c.kind !== "learning");
    expect(run(sessions, { classes: noLearning }).questions.map((q) => q.group)).toEqual(["music"]);
  });

  it("does not ask a group some class already claims, nor count dismissed keys", () => {
    const claimed = CLASSES.map((c) => (c.id === "learn" ? { ...c, catalog_groups: ["ai_chat"] } : c));
    expect(run(sessions, { classes: claimed }).questions.map((q) => q.group)).toEqual(["music"]);
    const r = run(sessions, { dismissed: new Set(["Chatgpt"]) });
    expect(r.questions[0]).toMatchObject({ group: "ai_chat", seconds: min(10) });
  });

  it("counts Browser | other titles the catalog recognises toward the question (the answer reclassifies them)", () => {
    const r = run([sess({ app_key: "Browser | other", app: "Brave", window_title: "Pomoc z kodem - ChatGPT - Brave", seconds: min(5) })]);
    expect(r.items).toEqual([]);
    expect(r.questions.map((q) => q.group)).toEqual(["ai_chat"]);
  });
});

// ---------------------------------------------------------------------------
// banner, choices, writes
// ---------------------------------------------------------------------------

describe("triageWorth", () => {
  const base: TriageResult = {
    items: [],
    questions: [],
    rest: { count: 0, seconds: 0 },
    totalSeconds: 0,
    unassignedSeconds: 0,
    guessedSeconds: 0,
    otherBucketSeconds: 0,
  };
  const row = { id: "key:x" } as TriageItem;
  it("needs a row and enough at stake", () => {
    expect(triageWorth({ ...base, unassignedSeconds: min(60) })).toBe(false);
    expect(triageWorth({ ...base, items: [row], unassignedSeconds: min(14) })).toBe(false);
    expect(triageWorth({ ...base, items: [row], unassignedSeconds: min(15) })).toBe(true);
    expect(triageWorth({ ...base, items: [row], guessedSeconds: min(30) })).toBe(true);
    expect(triageWorth({ ...base, items: [row], questions: [{ group: "music" } as TriageResult["questions"][number]] })).toBe(true);
  });
});

describe("choices: defaults, estimate, confirm plan", () => {
  const sessions = [
    sess({ app_key: "Chatgpt", app: "Chatgpt", seconds: min(30) }),
    sess({ app_key: "com.openai.chatgpt", app: "ChatGPT", device_id: PHONE, seconds: min(10) }),
    sess({ app_key: "com.android.chrome", app: "Chrome", device_id: PHONE, seconds: min(20) }),
    sess({ app_key: "Browser | rybiapaka.pl", app: "Brave", seconds: min(15) }),
    sess({ app_key: "Mystery", seconds: min(10) }),
  ];
  const projectWork = { ...WORK, project_id: "p1" };
  const classes = [projectWork, LEARN, COMM, WATCH, WASTE, NEUTRAL];
  const aiMap = new Map([["Browser | rybiapaka.pl", ai({ app_key: "Browser | rybiapaka.pl", class_id: "waste", confidence: 0.9 })]]);
  const r = run(sessions, { classes, ai: aiMap });

  it("starts from the pre-selected suggestions and estimates what stays unassigned", () => {
    const ch = defaultChoices(r.items);
    expect(ch).toEqual({ "cat:chatgpt": "work", "cat:phone_browsers": null, "key:Browser | rybiapaka.pl": "waste", "key:Mystery": null });
    expect(r.unassignedSeconds).toBe(min(45));
    expect(unassignedAfter(r, ch)).toBe(min(30));
    expect(unassignedAfter(r, { ...ch, "cat:phone_browsers": "neutral", "key:Mystery": SKIP })).toBe(min(10));
  });

  it("writes one label per key (with the class's project) and the AI scorecard", () => {
    const ch = { ...defaultChoices(r.items), "key:Browser | rybiapaka.pl": "neutral", "key:Mystery": SKIP };
    const plan = planConfirm(r.items, ch, classes, aiMap);
    expect(plan.entries).toEqual([
      { appKey: "Chatgpt", classId: "work", projectId: "p1" },
      { appKey: "com.openai.chatgpt", classId: "work", projectId: "p1" },
      { appKey: "Browser | rybiapaka.pl", classId: "neutral", projectId: null },
    ]);
    expect(plan.decisions).toEqual([
      { app_key: "Browser | rybiapaka.pl", status: "corrected", final_class_id: "neutral", preselected: true },
      { app_key: "Mystery", status: "dismissed", final_class_id: null },
    ]);
    expect(plan.assigned.map((i) => i.id)).toEqual(["cat:chatgpt", "key:Browser | rybiapaka.pl"]);
    expect(plan.skipped.map((i) => i.id)).toEqual(["key:Mystery"]);
    const accepted = planConfirm(r.items, defaultChoices(r.items), classes, aiMap);
    expect(accepted.decisions).toEqual([{ app_key: "Browser | rybiapaka.pl", status: "accepted", final_class_id: "waste", preselected: true }]);
  });

  it("asks the AI one item per key, named like the row", () => {
    const items = toAiItems(r.items.filter((i) => i.id === "key:Mystery" || i.id === "cat:chatgpt"));
    expect(items).toEqual([
      { app_key: "Chatgpt", app: "Chatgpt", device: "pc", minutes: 40, titles: [] },
      { app_key: "com.openai.chatgpt", app: "ChatGPT", device: "pc", minutes: 40, titles: [] },
      { app_key: "Mystery", app: "Mystery", device: "pc", minutes: 10, titles: [] },
    ]);
  });
});

describe("planLabelBatch / planGroupClaims", () => {
  it("updates a manual rule's target, upserts the rest and remembers what each overwrote", () => {
    const manual = rule({ pattern: "Hermes", class_id: "work", source: "manual", priority: 10 });
    const learned = rule({ pattern: "Browser | X", class_id: "waste", source: "learned", priority: 0, confidence: 0.8 });
    const other = rule({ pattern: "hermes", class_id: "learn", field: "app" });
    const plan = planLabelBatch([manual, learned, other], [
      { appKey: "Hermes", classId: "learn" },
      { appKey: "Browser | X", classId: "neutral" },
      { appKey: "New", classId: "comm", projectId: "p1" },
      { appKey: "New", classId: "neutral" }, // last entry per key wins
    ]);
    expect(plan.priority).toBe(PRIORITY_LABEL);
    expect(plan.updates).toEqual([
      { appKey: "Hermes", classId: "learn", projectId: null, previous: expect.objectContaining({ id: manual.id, class_id: "work", source: "manual", priority: 10 }) },
    ]);
    expect(plan.upserts).toEqual([
      { appKey: "Browser | X", classId: "neutral", projectId: null, previous: expect.objectContaining({ id: learned.id, source: "learned", confidence: 0.8 }) },
      { appKey: "New", classId: "neutral", projectId: null, previous: null },
    ]);
  });

  it("moves a group into exactly one class and writes nothing for an unchanged answer", () => {
    const classes = [{ ...WORK, catalog_groups: ["ai_chat", "music"] }, LEARN, NEUTRAL];
    expect(planGroupClaims(classes, { ai_chat: "learn", shopping: "neutral", news: "missing" })).toEqual([
      { id: "work", before: ["ai_chat", "music"], after: ["music"] },
      { id: "learn", before: [], after: ["ai_chat"] },
      { id: "neutral", before: [], after: ["shopping"] },
    ]);
    expect(planGroupClaims(classes, { ai_chat: "work" })).toEqual([]);
  });
});

describe("copy helpers", () => {
  it("formats durations and Polish counts", () => {
    expect(durationLabel(51_600)).toBe("14 h 20 min");
    expect(durationLabel(2100)).toBe("35 min");
    expect(durationLabel(7200)).toBe("2 h");
    expect(durationLabel(20)).toBe("<1 min");
    const p = (n: number) => plural(n, "pozycję", "pozycje", "pozycji");
    expect([1, 2, 4, 5, 12, 14, 22, 25, 102].map(p)).toEqual([
      "pozycję", "pozycje", "pozycje", "pozycji", "pozycji", "pozycji", "pozycje", "pozycji", "pozycje",
    ]);
  });
});

// ---------------------------------------------------------------------------
// useAppUsage batch writers (mocked client)
// ---------------------------------------------------------------------------

describe("writeLabelBatch / writeGroupClaims / revertLabels", () => {
  beforeEach(() => db.state.reset());

  const manual = rule({ id: "m1", pattern: "Hermes", class_id: "work", source: "manual", priority: 10 });
  const learned = rule({ id: "l1", pattern: "Browser | X", class_id: "waste", source: "learned", priority: 0, confidence: 0.8 });

  it("moves manual rules one by one and upserts everything else in one request", async () => {
    db.state.existing.set("Browser | X", "l1");
    const { undo, error } = await writeLabelBatch("u1", [manual, learned], [
      { appKey: "Hermes", classId: "learn" },
      { appKey: "Browser | X", classId: "neutral" },
      { appKey: "Chatgpt", classId: "work", projectId: "p1" },
      { appKey: "com.openai.chatgpt", classId: "work", projectId: "p1" },
    ]);
    expect(error).toBeNull();
    const calls = db.state.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      table: "app_rules",
      op: "update",
      payload: { class_id: "learn", project_id: null },
      filters: [["eq", "id", "m1"], ["eq", "user_id", "u1"]],
    });
    expect(calls[1]).toMatchObject({ table: "app_rules", op: "upsert", options: { onConflict: "user_id,field,match_kind,pattern" }, select: "id,pattern" });
    expect(calls[1].payload).toEqual([
      expect.objectContaining({ user_id: "u1", field: "app_key", match_kind: "exact", pattern: "Browser | X", class_id: "neutral", priority: PRIORITY_LABEL, source: "label", confidence: 1, enabled: true }),
      expect.objectContaining({ pattern: "Chatgpt", class_id: "work", project_id: "p1" }),
      expect.objectContaining({ pattern: "com.openai.chatgpt", class_id: "work", project_id: "p1" }),
    ]);
    expect(undo.keys).toEqual(["Hermes", "Browser | X", "Chatgpt", "com.openai.chatgpt"]);
    expect(undo.created).toEqual(["new:Chatgpt", "new:com.openai.chatgpt"]);
    expect(undo.restore.map((r) => [r.id, r.class_id, r.source])).toEqual([["m1", "work", "manual"], ["l1", "waste", "learned"]]);
  });

  it("keeps the undo of what was written when the upsert fails", async () => {
    db.state.fail = (c) => (c.op === "upsert" ? { code: "42501", message: "denied" } : null);
    const { undo, error } = await writeLabelBatch("u1", [manual], [
      { appKey: "Hermes", classId: "learn" },
      { appKey: "Chatgpt", classId: "work" },
    ]);
    expect(error).toMatchObject({ code: "42501" });
    expect(undo.keys).toEqual(["Hermes"]);
    expect(undo.created).toEqual([]);
  });

  it("treats a rule the server no longer had as created", async () => {
    // Local state knows "Browser | X" as l1, the server answers with a fresh id: it was deleted elsewhere.
    const { undo } = await writeLabelBatch("u1", [learned], [{ appKey: "Browser | X", classId: "neutral" }]);
    expect(undo.created).toEqual(["new:Browser | X"]);
    expect(undo.restore).toEqual([]);
  });

  it("writes one update per class whose claims change", async () => {
    const classes = [{ ...WORK, catalog_groups: ["ai_chat"] }, LEARN, NEUTRAL];
    expect(await writeGroupClaims("u1", classes, { ai_chat: "learn" })).toBeNull();
    expect(db.state.calls.map((c) => [c.table, c.op, c.payload, c.filters[0][2]])).toEqual([
      ["app_classes", "update", { catalog_groups: [] }, "work"],
      ["app_classes", "update", { catalog_groups: ["ai_chat"] }, "learn"],
    ]);
    db.state.reset();
    db.state.fail = () => ({ code: "PGRST204", message: "column catalog_groups not found" });
    expect(await writeGroupClaims("u1", classes, { ai_chat: "learn" })).toMatchObject({ code: "PGRST204" });
  });

  it("undoes: created rules deleted in one request, the rest restored field by field", async () => {
    const err = await revertLabels("u1", {
      keys: ["a", "b", "c"],
      created: ["n1", "n2"],
      restore: [{ id: "l1", class_id: "waste", project_id: null, priority: 0, source: "learned", confidence: 0.8, enabled: true }],
      classGroups: [{ id: "work", catalog_groups: ["ai_chat"] }],
    });
    expect(err).toBeNull();
    const [del, restore, claim] = db.state.calls;
    expect(del).toMatchObject({ table: "app_rules", op: "delete", filters: [["in", "id", ["n1", "n2"]], ["eq", "user_id", "u1"]] });
    expect(restore).toMatchObject({
      table: "app_rules",
      op: "update",
      payload: { class_id: "waste", project_id: null, priority: 0, source: "learned", confidence: 0.8, enabled: true },
      filters: [["eq", "id", "l1"], ["eq", "user_id", "u1"]],
    });
    expect(claim).toMatchObject({ table: "app_classes", op: "update", payload: { catalog_groups: ["ai_chat"] } });
  });
});
