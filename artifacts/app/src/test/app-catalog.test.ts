import { describe, it, expect } from "vitest";
import {
  CATALOG_GROUP_IDS,
  catalogClassFor,
  catalogConfidence,
  catalogEntry,
  matchCatalog,
  type CatalogEntry,
} from "../lib/app-catalog";
import { CATALOG_ENTRIES, CATALOG_GROUPS } from "../lib/app-catalog-data";
import { APP_KINDS, type AppClass } from "../lib/app-usage-classify";

const s = (app_key: string, window_title = "", app = app_key.split("|")[0].trim()) => ({ app_key, app, window_title });
const id = (session: ReturnType<typeof s>, phase?: "exact" | "loose") => matchCatalog(session, phase)?.entry.id ?? null;

// ---------------------------------------------------------------------------
// exact phase
// ---------------------------------------------------------------------------

describe("matchCatalog: exact phase", () => {
  it("pkg: case-sensitive equality with the app key", () => {
    const m = matchCatalog(s("com.openai.chatgpt", "ChatGPT", "ChatGPT"));
    expect(m).toMatchObject({ phase: "exact", how: "pakiet Androida" });
    expect(m?.entry.id).toBe("chatgpt");
    expect(id(s("com.Slack", "", ""))).toBe("slack");
    expect(id(s("com.slack", "", ""))).toBeNull();
    expect(id(s("COM.OPENAI.CHATGPT", "", ""))).toBeNull();
  });

  it("app: case-insensitive display name, phone labels included, never for browser keys", () => {
    expect(matchCatalog(s("Chatgpt"))).toMatchObject({ phase: "exact", how: "nazwa aplikacji" });
    expect(id(s("CHATGPT"))).toBe("chatgpt");
    expect(id(s("Code | mindsetforest", "", "Code"))).toBe("vscode");
    expect(id(s("com.xiaomi.camera2", "", "Aparat"))).toBe("camera");
    // a browser key is judged by its site, not by the browser's name
    expect(id(s("Browser | Nowhere", "", "Discord"), "exact")).toBeNull();
    expect(id(s("", "", ""))).toBeNull();
  });

  it("app_prefix: versioned names", () => {
    expect(id(s("Gimp 2.10"))).toBe("design_desktop");
    expect(id(s("Not Gimp"))).toBeNull();
  });

  it("site: the token after 'Browser | ', case-insensitive", () => {
    expect(matchCatalog(s("Browser | YouTube", "", "Brave"))).toMatchObject({ phase: "exact", how: "nazwa strony" });
    expect(id(s("Browser | youtube music"))).toBe("ytmusic");
    expect(id(s("browser|Proton Mail"))).toBe("protonmail");
    expect(id(s("Browser | AliExpress Open Platform"))).toBe("devportals_pl");
    expect(id(s("Browser | AliExpress"))).toBe("aliexpress");
    // the tokens tracker 1.2 derives from the address bar
    expect(id(s("Browser | New Tab"))).toBe("browser_chrome");
    expect(id(s("Browser | Browser page"))).toBe("browser_chrome");
    expect(id(s("Browser | Local file"))).toBe("pdf");
  });

  it("domain: a token that is itself a host equal to or under a pattern, longest pattern wins", () => {
    expect(matchCatalog(s("Browser | music.youtube.com"))).toMatchObject({ phase: "exact", how: "domena" });
    expect(id(s("Browser | music.youtube.com"))).toBe("ytmusic");
    expect(id(s("Browser | m.youtube.com"))).toBe("youtube");
    expect(id(s("Browser | www.youtube.com"))).toBe("youtube");
    expect(id(s("Browser | poczta.interia.pl"))).toBe("pl_webmail");
    expect(id(s("Browser | interia.pl"))).toBe("interia");
    expect(id(s("Browser | notx.com"))).toBeNull();
    expect(id(s("Browser | rybiapaka.pl"))).toBeNull();
  });

  it("tracker 1.2 host keys: CloudA and AWS by domain, the AliExpress affiliate portal is not shopping", () => {
    expect(id(s("Browser | wsbnlu.clouda.edu.pl"), "exact")).toBe("clouda");
    expect(id(s("Browser | docs.aws.amazon.com"), "exact")).toBe("cloudconsoles");
    expect(id(s("Browser | portals.aliexpress.com"), "exact")).toBe("devportals_pl");
  });

  it("never reads the title", () => {
    expect(id(s("Browser | other", "Lecture - YouTube - Brave"), "exact")).toBeNull();
    expect(id(s("Browser | other", "Lecture - YouTube - Brave"), "loose")).toBe("youtube");
  });
});

// ---------------------------------------------------------------------------
// loose phase
// ---------------------------------------------------------------------------

describe("matchCatalog: loose phase", () => {
  it("domain in the title, longest pattern across every host in it", () => {
    const m = matchCatalog(s("Browser | other", "Talk https://www.youtube.com/watch?v=1 - Brave"), "loose");
    expect(m).toMatchObject({ phase: "loose", how: "domena w tytule" });
    expect(m?.entry.id).toBe("youtube");
    expect(id(s("Browser | other", "interia.pl | poczta.interia.pl - Brave"), "loose")).toBe("pl_webmail");
    expect(id(s("Browser | other", "Question about fix.com - Brave"), "loose")).toBeNull();
    // the domain of an e-mail address is not a site
    expect(id(s("Browser | poczta.home.pl", "Odebrane (3) - jan.kowalski@wp.pl - Poczta home.pl"), "loose")).toBeNull();
    expect(id(s("Browser | outlook.office365.com", "Poczta — kontakt@interia.pl — Outlook - Brave"))).toBe("outlook");
  });

  it("generic page words match only as the whole title, and ': ' only for brands that opt in", () => {
    expect(id(s("Browser | other", "Ustawienia - Brave"))).toBe("browser_chrome");
    expect(id(s("Browser | excalidraw.com", "Untitled - Excalidraw - Brave"), "loose")).not.toBe("browser_chrome");
    expect(id(s("Browser | rybiapaka.pl", "Ustawienia | RybiaPaka.pl - Brave"), "loose")).toBeNull();
    expect(id(s("Browser | other", "PayPal: Ustawienia - Brave"))).toBe("payments");
    expect(id(s("Browser | Fandom", "Player | Roblox Wiki | Fandom - Brave"), "loose")).not.toBe("player");
    // an AI chat titled "Brand: topic" is not that brand
    expect(id(s("Browser | other", "Max: limit of a function explained - Brave"))).toBeNull();
    expect(id(s("Browser | other", "Uber: system design interview - Brave"))).toBeNull();
  });

  it("title segment equal to a site, last segment first", () => {
    const m = matchCatalog(s("Browser | other", "Many & Few - Miro - Brave"), "loose");
    expect(m).toMatchObject({ phase: "loose", how: "fragment tytułu" });
    expect(m?.entry.id).toBe("miro");
    // ": " and the count prefix are split off like the tracker's separators
    expect(id(s("Browser | other", "Proton Mail: Sign-in - Brave"))).toBe("protonmail");
    expect(id(s("Browser | other", "(3) Facebook - Brave"))).toBe("facebook");
    expect(id(s("Browser | other", "Bilety :: KOLEO"))).toBe("trains_pl");
    // "History" (browser page) is a page title here, the site is the last segment
    expect(id(s("Browser | other", "History - Wikipedia - Brave"))).toBe("wikipedia");
    expect(id(s("Browser | other", "Sprint planning"))).toBeNull();
  });

  it("token_re on the site token (GitHub repo keys)", () => {
    const m = matchCatalog(s("Browser | anthropics/claude-code", "README.md at main · anthropics/claude-code - Brave"));
    expect(m).toMatchObject({ phase: "loose", how: "wzorzec klucza" });
    expect(m?.entry.id).toBe("github");
    expect(id(s("Browser | not a/repo"))).toBeNull();
    expect(id(s("Browser | HMQE333/mindsetforest_dashboard"))).toBe("github");
    for (const t of ["2026/2027", "TCP/IP", "UI/UX", "r/Polska", "r/programming", "u/someone"]) expect(id(s(`Browser | ${t}`))).toBeNull();
  });

  it("title_re only for 'Browser | other', on the title without the browser's suffix", () => {
    const m = matchCatalog(s("Browser | other", "Hot Knives • Fog Lake - Brave"));
    expect(m).toMatchObject({ phase: "loose", how: "wzorzec tytułu" });
    expect(m?.entry.id).toBe("music_web");
    expect(id(s("Browser | other", "Hot Knives • Fog Lake"))).toBe("music_web"); // installed web app window
    expect(id(s("Browser | other", "Hot Knives • Fog Lake - Google Chrome - Osobisty"))).toBe("music_web");
    expect(id(s("Browser | other", "(1) Param (@ParamSiddh) / X - Google Chrome"))).toBe("x");
    expect(id(s("Browser | other", "Song - Remix • Artist - Brave"))).toBeNull();
    // a named site is not second-guessed from its title's shape
    expect(id(s("Browser | rybiapaka.pl", "Hot Knives • Fog Lake - Brave"))).toBeNull();
  });

  it("only browser keys, and without a phase exact comes first", () => {
    expect(id(s("Code | proj", "github.com - notes.md - Code", "Code"), "loose")).toBeNull();
    const m = matchCatalog(s("Browser | YouTube", "Mix - Spotify - Brave"));
    expect(m).toMatchObject({ phase: "exact" });
    expect(m?.entry.id).toBe("youtube");
    expect(matchCatalog(s("Browser | other", ""))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// entry -> class, confidence, lookups
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

describe("catalogClassFor", () => {
  const chatgpt = catalogEntry("chatgpt")!;
  const youtube = catalogEntry("youtube")!;

  it("a class that claims the group beats the kind", () => {
    const classes = [cls({ id: "work", kind: "work", sort_order: 0 }), cls({ id: "learn", kind: "learning", sort_order: 1, catalog_groups: ["ai_chat"] })];
    expect(catalogClassFor(chatgpt, classes)?.id).toBe("learn");
    expect(catalogClassFor(catalogEntry("vscode")!, classes)?.id).toBe("work"); // no group: by kind
  });

  it("picks the lowest sort_order, whatever the array order", () => {
    const byKind = [cls({ id: "work-b", kind: "work", sort_order: 5 }), cls({ id: "work-a", kind: "work", sort_order: 1 })];
    expect(catalogClassFor(chatgpt, byKind)?.id).toBe("work-a");
    const byGroup = [
      cls({ id: "late", kind: "neutral", sort_order: 3, catalog_groups: ["ai_chat"] }),
      cls({ id: "early", kind: "learning", sort_order: 2, catalog_groups: ["ai_chat", "music"] }),
      cls({ id: "work", kind: "work", sort_order: 0 }),
    ];
    expect(catalogClassFor(chatgpt, byGroup)?.id).toBe("early");
  });

  it("null when no class claims the group and none has the kind", () => {
    expect(catalogClassFor(youtube, [cls({ id: "work", kind: "work" })])).toBeNull();
    expect(catalogClassFor(youtube, [])).toBeNull();
  });
});

describe("catalogConfidence", () => {
  it("clear 0.8, alternatives 0.6 (entry or group), heuristic 0.5, explicit wins", () => {
    expect(catalogConfidence(catalogEntry("youtube")!)).toBe(0.8);
    expect(catalogConfidence(catalogEntry("reddit")!)).toBe(0.6); // alt
    expect(catalogConfidence(catalogEntry("chatgpt")!)).toBe(0.6); // group with alternatives
    expect(catalogConfidence(catalogEntry("food_delivery")!)).toBe(0.6); // only the group (errands) has alternatives
    expect(catalogConfidence(catalogEntry("pko")!)).toBe(0.8); // finance: a group without alternatives
    expect(catalogConfidence(catalogEntry("music_web")!)).toBe(0.5);
    const guess: CatalogEntry = { id: "t", name: "t", kind: "neutral", heuristic: true, match: {} };
    expect(catalogConfidence(guess)).toBe(0.5);
    expect(catalogConfidence({ ...guess, confidence: 0.9 })).toBe(0.9);
  });
});

describe("catalog data", () => {
  it("lookups", () => {
    expect(catalogEntry("chatgpt")?.name).toBe("ChatGPT");
    expect(catalogEntry("nope")).toBeUndefined();
    expect(CATALOG_GROUP_IDS).toEqual(Object.keys(CATALOG_GROUPS));
    expect(CATALOG_GROUP_IDS).toContain("ai_chat");
  });

  it("is well-formed: unique ids, known kinds and groups, compilable patterns, normalised domains", () => {
    expect(CATALOG_ENTRIES).toHaveLength(187);
    expect(new Set(CATALOG_ENTRIES.map((e) => e.id)).size).toBe(CATALOG_ENTRIES.length);
    for (const e of CATALOG_ENTRIES) {
      expect(APP_KINDS).toContain(e.kind);
      for (const k of e.alt || []) expect(APP_KINDS).toContain(k);
      if (e.group) expect(CATALOG_GROUPS[e.group]).toBeDefined();
      for (const re of [...(e.match.token_re || []), ...(e.match.title_re || [])]) expect(() => new RegExp(re)).not.toThrow();
      for (const d of e.match.domain || []) expect(d).toMatch(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/);
      expect(Object.values(e.match).some((v) => v && v.length > 0)).toBe(true);
    }
    for (const g of Object.values(CATALOG_GROUPS)) {
      expect(APP_KINDS).toContain(g.default);
      for (const k of g.alt) expect(APP_KINDS).toContain(k);
    }
  });
});
