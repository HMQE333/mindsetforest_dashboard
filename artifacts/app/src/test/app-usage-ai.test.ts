import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  upsert: vi.fn(),
  pages: [] as { data: unknown[] | null; error: { code?: string; message?: string } | null }[],
  ranges: [] as [number, number][],
  filters: [] as [string, unknown][],
}));

vi.mock("@/integrations/supabase/client", () => {
  const select = () => {
    const q = {
      eq: (col: string, val: unknown) => { mock.filters.push([col, val]); return q; },
      order: () => q,
      range: (from: number, to: number) => {
        mock.ranges.push([from, to]);
        return Promise.resolve(mock.pages[mock.ranges.length - 1] ?? { data: [], error: null });
      },
    };
    return q;
  };
  return {
    supabase: {
      functions: { invoke: mock.invoke },
      from: () => ({ select, upsert: mock.upsert }),
    },
  };
});

import {
  AI_MAX_ITEMS,
  DECIDED_CONFIDENCE,
  aiErrorMessage,
  cachedSuggestions,
  decisionRows,
  dismissedKeys,
  loadSuggestionRows,
  normTitle,
  parseSuggestions,
  prepareAiItems,
  recordDecisions,
  redactForPrompt,
  requestAiSuggestions,
  rowToSuggestionRow,
  type AiItem,
  type SuggestionRow,
} from "../lib/app-usage-ai";

const item = (app_key: string, minutes: number, over: Partial<AiItem> = {}): AiItem => ({
  app_key, app: "Brave", device: "pc", minutes, titles: [], ...over,
});

const row = (over: Partial<SuggestionRow>): SuggestionRow => ({
  app_key: "k", status: "offered", class_id: "c-1", alt_class_id: null, confidence: 0.9, multi_purpose: false, reason: "r", ...over,
});

beforeEach(() => {
  mock.invoke.mockReset();
  mock.upsert.mockReset();
  mock.pages = [];
  mock.ranges = [];
  mock.filters = [];
});

// ---------------------------------------------------------------------------
// text

describe("normTitle", () => {
  it("drops the unread counter, the browser suffix and extra spaces", () => {
    expect(normTitle("(3) Inbox  -  Slowly - Brave")).toBe("Inbox - Slowly");
    expect(normTitle("Docs - Microsoft\u200B Edge")).toBe("Docs");
    expect(normTitle("Notion – Google Chrome")).toBe("Notion");
    expect(normTitle("(1,234) YouTube")).toBe("YouTube");
    expect(normTitle("Plan na dziś")).toBe("Plan na dziś");
    expect(normTitle("")).toBe("");
  });
});

describe("redactForPrompt", () => {
  it("drops the folders of a file path and masks prefixed tokens", () => {
    expect(redactForPrompt("C:\\Users\\Jan Kowalski\\Desktop\\umowa_najmu.pdf - Adobe Acrobat Reader", 200)).toBe("umowa_najmu.pdf - Adobe Acrobat Reader");
    expect(redactForPrompt("/home/jan/notes/diagnoza.md - Obsidian")).toBe("diagnoza.md - Obsidian");
    // Token-shaped fixtures are assembled at run time so the repo holds nothing a secret scanner flags.
    const fake = (prefix: string) => [prefix, "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"].join("_");
    expect(redactForPrompt(`token=${fake("ghp")}`)).toBe("token=<id>");
    expect(redactForPrompt(fake(["sk", "live"].join("_")))).toBe("<id>");
    expect(redactForPrompt("https://app.example.com/invite/AbCdEf_GhIjKlMnOpQrStUvWx12345", 200)).toBe("https://app.example.com/invite/<id>");
    // lower-case slugs stay readable
    expect(redactForPrompt("kaede-to-suzu-the-animation-episode-12 - Oglądaj Anime", 200)).toBe("kaede-to-suzu-the-animation-episode-12 - Oglądaj Anime");
  });

  it("masks addresses, DM handles, query tokens, ids, tokens and long numbers", () => {
    expect(redactForPrompt("Odebrane | jan.kowalski@proton.me | Proton Mail")).toBe("Odebrane | <email> | Proton Mail");
    expect(redactForPrompt("Browser | @Arnold")).toBe("Browser | @<osoba>");
    expect(redactForPrompt("@Arnold | Discord")).toBe("@<osoba> | Discord");
    expect(redactForPrompt("sso.pwn.pl/login?reqauth=AbC123&next=/ - Brave")).toBe("sso.pwn.pl/login");
    expect(redactForPrompt("blob:https://claude.ai/3f2b8c1e-9d4a-4e7b-8c6f-1a2b3c4d5e6f")).toBe("blob:https://claude.ai/<id>");
    expect(redactForPrompt("Commit a3f9c2e81b7d4f60a2c3e9f1b8d7c6a5")).toBe("Commit <id>");
    expect(redactForPrompt("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl x")).toBe("token <id> x");
    expect(redactForPrompt("key Xk9fT2qLm8Rz4Vb7Nc1Wd5Hs3Jp6Gy0A")).toBe("key <id>");
    expect(redactForPrompt("Połączenie +48 601 234 567")).toBe("Połączenie #");
  });

  it("keeps what carries meaning: sites, slugs, file names, short numbers", () => {
    expect(redactForPrompt("rybiapaka.pl/admin/zamowienia")).toBe("rybiapaka.pl/admin/zamowienia");
    expect(redactForPrompt("honzuki-no-gekokujou-shisho-ni-naru odcinek 12")).toBe("honzuki-no-gekokujou-shisho-ni-naru odcinek 12");
    expect(redactForPrompt("mindsetforest_compact_dashboard_v2.tsx - Code")).toBe("mindsetforest_compact_dashboard_v2.tsx - Code");
    expect(redactForPrompt("Faktura 2026/10/11 za 1500 zł")).toBe("Faktura 2026/10/11 za 1500 zł");
    expect(redactForPrompt("x".repeat(300))).toHaveLength(80);
    expect(redactForPrompt("x".repeat(300), 120)).toHaveLength(120);
  });
});

/**
 * The function redacts with its own copy (an edge function cannot import from
 * the app). Pull that copy out of its source and run both on the same input.
 */
function serverHelpers(): { normTitle: (t: string) => string; redactForPrompt: (t: string, max?: number) => string } {
  const src = readFileSync(new URL("../../../../supabase/functions/ai-usage-classify/index.ts", import.meta.url), "utf8");
  const pick = (re: RegExp) => {
    const m = src.match(re);
    if (!m) throw new Error(`not found in the function: ${re}`);
    return m[0];
  };
  const code = [
    pick(/const BROWSER_SUFFIX = .*;/),
    pick(/function normTitle\([\s\S]*?\n\}/),
    pick(/function redactForPrompt\([\s\S]*?\n\}/),
  ].join("\n").replace(/\)\s*:\s*string\s*\{/g, ") {").replace(/(\w+)\s*:\s*string/g, "$1");
  return new Function(`${code}\nreturn { normTitle, redactForPrompt };`)();
}

describe("client and server redaction", () => {
  const server = serverHelpers();
  const samples = [
    "(2) Odebrane | jan.kowalski@proton.me | Proton Mail - Brave",
    "Browser | @Arnold", "@Arnold | Discord", "Browser | rybiapaka.pl", "com.openai.chatgpt",
    "sso.pwn.pl/login?reqauth=AbC123&next=/ - Google Chrome",
    "blob:https://claude.ai/3f2b8c1e-9d4a-4e7b-8c6f-1a2b3c4d5e6f",
    "Commit a3f9c2e81b7d4f60a2c3e9f1b8d7c6a5 · repo", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln",
    "key Xk9fT2qLm8Rz4Vb7Nc1Wd5Hs3Jp6Gy0A", "Połączenie +48 601 234 567", "EAN 5901234123457",
    "Docs - Microsoft\u200B Edge", "Prośba o pomoc finansową", "  spaced   out  ", "", "x".repeat(250),
  ];

  it("are the same code", () => {
    for (const s of samples) {
      expect(server.normTitle(s)).toBe(normTitle(s));
      expect(server.redactForPrompt(s)).toBe(redactForPrompt(s));
      expect(server.redactForPrompt(s, 120)).toBe(redactForPrompt(s, 120));
    }
  });
});

// ---------------------------------------------------------------------------
// shaping

describe("prepareAiItems", () => {
  it("keeps one item per key, the most-used first, at most 60", () => {
    const many = Array.from({ length: 70 }, (_, i) => item(`k${i}`, i));
    const out = prepareAiItems([...many, item("k5", 500)]);
    expect(out).toHaveLength(AI_MAX_ITEMS);
    expect(out[0]).toMatchObject({ app_key: "k5", minutes: 500 });
    expect(out.filter((x) => x.app_key === "k5")).toHaveLength(1);
    expect(out.at(-1)?.minutes).toBe(11); // k69..k11 and k5 (moved to the top)
  });

  it("never alters a key; drops empty and over-long ones", () => {
    const out = prepareAiItems([item("Browser |  two  spaces", 5), item("   ", 9), item("x".repeat(201), 9)]);
    expect(out.map((x) => x.app_key)).toEqual(["Browser |  two  spaces"]);
  });

  it("sends up to three distinct, normalised titles that say more than the app name", () => {
    const [out] = prepareAiItems([item("Browser | CloudA", 97.4, {
      app: "Brave",
      device: "phone",
      titles: ["Wykład 3 - CloudA - Brave", "(2) Wykład 3 - CloudA", "brave", "", "Quiz", "Notatki", "Piąty"],
    })]);
    expect(out).toEqual({ app_key: "Browser | CloudA", app: "Brave", device: "phone", minutes: 97, titles: ["Wykład 3 - CloudA", "Quiz", "Notatki"] });
    expect(prepareAiItems([{ ...item("a", 1), device: "tablet" as "pc" }])[0].device).toBe("pc");
  });
});

describe("parseSuggestions", () => {
  it("checks what the function returned", () => {
    expect(parseSuggestions(null)).toEqual([]);
    expect(parseSuggestions([
      { app_key: "a", class_id: "c1", alt_class_id: "", confidence: 1.7, multi: "yes", why: 3, cached: true },
      { class_id: "c1" },
      { app_key: "b", class_id: null, confidence: "0.4", decided: true },
    ])).toEqual([
      { app_key: "a", class_id: "c1", alt_class_id: null, confidence: 1, multi: false, why: "", cached: true },
      { app_key: "b", class_id: null, alt_class_id: null, confidence: 0.4, multi: false, why: "", cached: false, decided: true },
    ]);
  });
});

describe("suggestion rows", () => {
  it("reads rows and drops broken ones", () => {
    expect(rowToSuggestionRow({ app_key: "a", status: "accepted", class_id: "c1", confidence: "0.93", multi_purpose: true, reason: "x", final_class_id: "c2" }))
      .toEqual({ app_key: "a", status: "accepted", class_id: "c1", alt_class_id: null, confidence: 0.93, multi_purpose: true, reason: "x", final_class_id: "c2" });
    expect(rowToSuggestionRow({ app_key: "a", status: "maybe" })).toBeNull();
    expect(rowToSuggestionRow({ status: "offered" })).toBeNull();
  });

  it("knows the skipped keys", () => {
    expect([...dismissedKeys([row({ app_key: "a", status: "dismissed" }), row({ app_key: "b" })])]).toEqual(["a"]);
  });

  it("serves the cache the way the function does", () => {
    const m = cachedSuggestions([
      row({ app_key: "offered", class_id: "c1", alt_class_id: "c2", confidence: 0.92, multi_purpose: true, reason: "Czat AI" }),
      row({ app_key: "none", class_id: null, confidence: 0.2 }),
      row({ app_key: "accepted", status: "accepted", class_id: "c1", final_class_id: "c1", confidence: 0.95 }),
      row({ app_key: "corrected", status: "corrected", class_id: "c1", final_class_id: "c3", confidence: 0.3 }),
      row({ app_key: "class-gone", status: "accepted", final_class_id: null }),
      row({ app_key: "skipped", status: "dismissed" }),
    ]);
    expect(m.get("offered")).toEqual({ app_key: "offered", class_id: "c1", alt_class_id: "c2", confidence: 0.92, multi: true, why: "Czat AI", cached: true, stale: true });
    expect(m.get("none")?.class_id).toBeNull();
    expect(m.get("accepted")).toMatchObject({ class_id: "c1", confidence: DECIDED_CONFIDENCE, decided: true, why: "Twój wcześniejszy wybór" });
    expect(m.get("corrected")).toMatchObject({ class_id: "c3", confidence: 0.3, decided: true, alt_class_id: null });
    expect(m.has("class-gone")).toBe(false);
    expect(m.has("skipped")).toBe(false);
  });
});

describe("decisionRows", () => {
  it("writes one row per key, the last decision winning", () => {
    const rows = decisionRows("u1", [
      { app_key: "a", status: "accepted", final_class_id: "c1", preselected: true },
      { app_key: "b", status: "dismissed", final_class_id: "c9" },
      { app_key: "a", status: "corrected", final_class_id: "c2" },
      { app_key: " ", status: "accepted", final_class_id: "c1" },
    ], "2026-10-11T10:00:00Z");
    expect(rows).toEqual([
      { user_id: "u1", item_type: "key", app_key: "a", title_key: "", status: "corrected", final_class_id: "c2", preselected: false, decided_at: "2026-10-11T10:00:00Z" },
      { user_id: "u1", item_type: "key", app_key: "b", title_key: "", status: "dismissed", final_class_id: null, preselected: false, decided_at: "2026-10-11T10:00:00Z" },
    ]);
    // Same columns in every row: PostgREST fills a column one row lacks with null.
    expect(new Set(rows.map((r) => Object.keys(r).join())).size).toBe(1);
  });
});

describe("aiErrorMessage", () => {
  it("says what went wrong in Polish", () => {
    expect(aiErrorMessage(402, "Payment required")).toBe("Brak środków na AI (OpenRouter).");
    expect(aiErrorMessage(429, null)).toBe("Za dużo zapytań do AI. Spróbuj za chwilę.");
    expect(aiErrorMessage(401, "Unauthorized")).toBe("Zaloguj się ponownie, żeby zapytać AI.");
    expect(aiErrorMessage(500, "AI gateway error")).toBe("AI gateway error");
    expect(aiErrorMessage(null, " ")).toBe("AI niedostępne.");
  });
});

// ---------------------------------------------------------------------------
// Supabase calls

describe("requestAiSuggestions", () => {
  it("does not call the function with nothing to ask", async () => {
    expect(await requestAiSuggestions([item(" ", 3)])).toEqual({ suggestions: [], error: null });
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it("sends the prepared items and returns the checked answers", async () => {
    mock.invoke.mockResolvedValue({
      data: { suggestions: [{ app_key: "com.ubercab", class_id: "c6", alt_class_id: null, confidence: 0.95, multi: false, why: "Przejazdy", cached: false }], failed: 0 },
      error: null,
    });
    const r = await requestAiSuggestions([item("com.ubercab", 17, { device: "phone", app: "Uber", titles: ["Uber"] })]);
    expect(mock.invoke).toHaveBeenCalledWith("ai-usage-classify", {
      body: { items: [{ app_key: "com.ubercab", app: "Uber", device: "phone", minutes: 17, titles: [] }] },
    });
    expect(r).toEqual({ suggestions: [{ app_key: "com.ubercab", class_id: "c6", alt_class_id: null, confidence: 0.95, multi: false, why: "Przejazdy", cached: false }], error: null });
  });

  it("turns failures into an error line, never a throw", async () => {
    mock.invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: { status: 402, json: async () => ({ error: "Payment required" }) } }),
    });
    expect(await requestAiSuggestions([item("a", 1)])).toEqual({ suggestions: [], error: "Brak środków na AI (OpenRouter)." });

    mock.invoke.mockResolvedValueOnce({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: { status: 500, json: async () => ({ error: "OPENROUTER_API_KEY is not configured" }) } }),
    });
    expect((await requestAiSuggestions([item("a", 1)])).error).toBe("OPENROUTER_API_KEY is not configured");

    mock.invoke.mockResolvedValueOnce({ data: { suggestions: [], failed: 3 }, error: null });
    expect((await requestAiSuggestions([item("a", 1)])).error).toBe("AI niedostępne.");

    mock.invoke.mockResolvedValueOnce({ data: { suggestions: [{ app_key: "a", class_id: "c1" }], failed: 3 }, error: null });
    expect((await requestAiSuggestions([item("a", 1)])).error).toBeNull();

    mock.invoke.mockRejectedValueOnce(new Error("offline"));
    expect(await requestAiSuggestions([item("a", 1)])).toEqual({ suggestions: [], error: "offline" });
  });
});

describe("loadSuggestionRows", () => {
  it("reads the user's key rows a page at a time", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ app_key: `k${i}`, status: "offered", class_id: "c1", confidence: 0.5 }));
    mock.pages = [{ data: page, error: null }, { data: [{ app_key: "last", status: "dismissed" }, { app_key: "", status: "offered" }], error: null }];
    const r = await loadSuggestionRows("u1");
    expect(r.ready).toBe(true);
    expect(r.rows).toHaveLength(1001);
    expect(r.rows.at(-1)).toMatchObject({ app_key: "last", status: "dismissed" });
    expect(mock.ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(mock.filters).toContainEqual(["user_id", "u1"]);
    expect(mock.filters).toContainEqual(["item_type", "key"]);
  });

  it("is not ready while the table is missing", async () => {
    mock.pages = [{ data: null, error: { code: "PGRST205", message: "Could not find the table" } }];
    expect(await loadSuggestionRows("u1")).toEqual({ rows: [], ready: false });
  });

  it("treats any other failure as an empty cache", async () => {
    mock.pages = [{ data: null, error: { code: "08006", message: "connection" } }];
    expect(await loadSuggestionRows("u1")).toEqual({ rows: [], ready: true });
  });
});

describe("recordDecisions", () => {
  it("writes every decision in one upsert on the row's identity", async () => {
    mock.upsert.mockResolvedValue({ error: null });
    expect(await recordDecisions("u1", [
      { app_key: "a", status: "accepted", final_class_id: "c1" },
      { app_key: "b", status: "dismissed", final_class_id: null },
    ])).toBe(true);
    expect(mock.upsert).toHaveBeenCalledTimes(1);
    const [rows, options] = mock.upsert.mock.calls[0];
    expect(rows.map((r: { app_key: string; status: string }) => [r.app_key, r.status])).toEqual([["a", "accepted"], ["b", "dismissed"]]);
    expect(options).toEqual({ onConflict: "user_id,item_type,app_key,title_key" });
  });

  it("does nothing for nothing, and reports a failed write", async () => {
    expect(await recordDecisions("u1", [])).toBe(true);
    expect(mock.upsert).not.toHaveBeenCalled();
    mock.upsert.mockResolvedValue({ error: { message: "nope" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await recordDecisions("u1", [{ app_key: "a", status: "dismissed", final_class_id: null }])).toBe(false);
  });
});
