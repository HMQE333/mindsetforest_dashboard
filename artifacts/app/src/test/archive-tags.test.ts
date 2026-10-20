import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TYPE_TAGS,
  countTags,
  detectType,
  folderNoteCounts,
  inFolder,
  isTag,
  isTypeTag,
  mergeTags,
  normaliseTag,
  parseInlineTags,
  removeTags,
  renameTag,
  tagPaths,
  tagTree,
  typeOf,
} from "../lib/archive-tags";
import * as server from "../../../../supabase/functions/_shared/archive-tags";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const libSource = () => read("../lib/archive-tags.ts");
const sharedSource = () => read("../../../../supabase/functions/_shared/archive-tags.ts");
const fnSource = () => read("../../../../supabase/functions/ai-suggest-tags/index.ts");
const learningSql = () => read("../../../../supabase/migrations/20261019180000_archive_tag_learning.sql");
const storageSql = () => read("../../../../supabase/migrations/20261019190000_archive_images_owner_listing.sql");

const IMG = "https://abcd.supabase.co/storage/v1/object/public/archive-images/u1/1760000000000-k3j2.png";

/** A pasted export like the owner's: one URL a line, a heading, ~500k characters. */
function urlDump(target = 503_000): string {
  const lines = ["Watch later + bookmarks export"];
  let size = lines[0].length;
  for (let i = 0; size < target; i++) {
    const url = i % 3 ? `https://github.com/user${i}/repo-${i}-name` : `https://www.youtube.com/watch?v=${String(i).padStart(11, "x")}`;
    lines.push(url);
    size += url.length + 1;
  }
  return lines.join("\n");
}

describe("normaliseTag", () => {
  it("keeps Polish letters and lowercases", () => {
    expect(normaliseTag("#Książki")).toBe("książki");
    expect(normaliseTag("ŻÓŁW")).toBe("żółw");
    expect(normaliseTag("do przeczytania")).toBe("do-przeczytania");
    expect(normaliseTag("  Self   Improvement ")).toBe("self-improvement");
  });

  it("reads folder paths and drops empty segments and a trailing slash", () => {
    expect(normaliseTag("#projekty/RybiaPaka")).toBe("projekty/rybiapaka");
    expect(normaliseTag("projekty/RybiaPaka/")).toBe("projekty/rybiapaka");
    expect(normaliseTag("/projekty//rybia paka/")).toBe("projekty/rybia-paka");
    expect(normaliseTag("projekty/-/x")).toBe("projekty/x");
  });

  it("needs a letter: numbers are not tags", () => {
    for (const raw of ["#2", "13", "#2026", "1/2", "--", "#", "", "   ", "_"]) expect(normaliseTag(raw)).toBe("");
    expect(normaliseTag("2nd")).toBe("2nd");
    expect(normaliseTag("projekty/2026")).toBe("projekty/2026");
  });

  it("drops what a tag cannot hold, keeps - and _", () => {
    expect(normaliseTag("c++")).toBe("c");
    expect(normaliseTag("AI: prompty!")).toBe("ai-prompty");
    expect(normaliseTag("do_przeczytania")).toBe("do_przeczytania");
    expect(normaliseTag("emoji 🔥 tag")).toBe("emoji-tag");
  });

  it("composes decomposed letters (NFD input from macOS)", () => {
    expect(normaliseTag("ksia\u0328z\u0307ki")).toBe("książki");
  });

  it("refuses a pasted phrase longer than a label", () => {
    expect(normaliseTag("a".repeat(64))).toBe("a".repeat(64));
    expect(normaliseTag("a".repeat(65))).toBe("");
  });

  it("isTag is true only for a tag already in its normal form", () => {
    expect(isTag("książki")).toBe(true);
    expect(isTag("projekty/rybiapaka")).toBe(true);
    expect(isTag("Książki")).toBe(false);
    expect(isTag("2")).toBe(false);
    expect(isTag("")).toBe(false);
  });
});

describe("parseInlineTags", () => {
  it("reads Unicode tags and folder paths, in order, once each", () => {
    expect(parseInlineTags("Nowa książka #książki #Projekty/RybiaPaka/ i znowu #książki")).toEqual(["książki", "projekty/rybiapaka"]);
  });

  it("does not take #2 or #13 for tags", () => {
    expect(parseInlineTags("Krok #2: research, potem #13 i #2026")).toEqual([]);
  });

  it("skips URL fragments and Markdown headings", () => {
    expect(parseInlineTags("# Tytuł\n## Sekcja\nhttps://x.com/page#section #idea")).toEqual(["idea"]);
  });

  it("finds a tag at the start of a line, after a bracket, before punctuation", () => {
    expect(parseInlineTags("#nauka\n(#rust) koniec #fokus.")).toEqual(["nauka", "rust", "fokus"]);
  });

  it("reads type tags like any other", () => {
    expect(parseInlineTags("To jest #Insight")).toEqual(["insight"]);
  });

  it("leaves the text alone (it only reads)", () => {
    const text = "Notatka #książki #2";
    parseInlineTags(text);
    expect(text).toBe("Notatka #książki #2");
  });
});

describe("types", () => {
  it("are his eight, English, lowercase, no prefix", () => {
    expect([...TYPE_TAGS]).toEqual(["insight", "framework", "quote", "source", "question", "task", "capture", "fragment"]);
    expect(TYPE_TAGS.every((t) => isTag(t))).toBe(true);
    expect(isTypeTag("insight")).toBe(true);
    expect(isTypeTag("Insight")).toBe(false);
    expect(isTypeTag("idea")).toBe(false);
  });

  it("typeOf finds the note's type tag", () => {
    expect(typeOf(["rybiapaka", "framework"])).toBe("framework");
    expect(typeOf(["rybiapaka"])).toBeNull();
  });

  it("mergeTags: a new type replaces the old one, the rest are added once", () => {
    expect(mergeTags(["insight", "rybiapaka"], ["framework", "biznes", "rybiapaka"])).toEqual(["rybiapaka", "framework", "biznes"]);
    expect(mergeTags(["insight", "x"], ["y"])).toEqual(["insight", "x", "y"]);
    expect(mergeTags([], ["quote", "source"])).toEqual(["source"]);
    expect(mergeTags(["a"], ["#Książki", "#2", ""])).toEqual(["a", "książki"]);
  });

  it("mergeTags keeps old tags as they are, even ones that are not tags today", () => {
    expect(mergeTags(["2", "Trading"], ["nowy"])).toEqual(["2", "Trading", "nowy"]);
  });

  it("removeTags compares in normal form and can remove an old number tag", () => {
    expect(removeTags(["książki", "2", "x"], ["#Książki", "2"])).toEqual(["x"]);
  });
});

describe("detectType", () => {
  const cases: [string, string, ReturnType<typeof detectType>][] = [
    // source: links and little else
    ["a bare YouTube link", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "source"],
    ["a link with a few words", "Ciekawy wątek o nawykach https://x.com/naval/status/123456", "source"],
    ["two links", "https://github.com/supabase/supabase\nhttps://docs.deno.com/runtime/", "source"],
    ["a link with a tag", "Do przeczytania: https://paulgraham.com/greatwork.html #do-przeczytania", "source"],
    ["www without a scheme", "www.notion.so/templates", "source"],
    ["a PDF on the web is something to read", "https://example.com/raport-2026.pdf", "source"],
    ["a list of links", "- https://a.com/one\n- https://b.com/two\n- https://c.com/three", "source"],
    // capture: only pictures, films or uploads
    ["a pasted image", `[image] ${IMG}`, "capture"],
    ["a Markdown image", "![screenshot](https://i.imgur.com/abc123.png)", "capture"],
    ["an image with a caption", `Zrzut z rozmowy z klientem\n${IMG}`, "capture"],
    ["a video file", "https://cdn.example.com/video/klip.mp4?x=1", "capture"],
    ["a file name alone", "IMG_20261012_101500.jpg", "capture"],
    ["a Windows path", "C:\\Users\\Jan\\Desktop\\Notatki wykład 3.pdf", "capture"],
    ["an image and a page: unsure", `${IMG}\nhttps://example.com/article`, null],
    // quote
    ["Polish quotes and an em dash", "„Nie musisz być wielki, żeby zacząć, ale musisz zacząć, żeby być wielki.” — Zig Ziglar", "quote"],
    ["straight quotes and a hyphen", "\"The best way out is always through.\" - Robert Frost", "quote"],
    ["the words, then a line with the author", "Discipline equals freedom.\n— Jocko Willink", "quote"],
    ["a blockquote, then a hyphen line", "> We are what we repeatedly do.\n> Excellence, then, is not an act, but a habit.\n- Will Durant", "quote"],
    ["a shop after a hyphen is not an author", "Kupić mleko - Biedronka", null],
    ["a time after a hyphen is not an author", "Spotkanie z Tomkiem - jutro 10:00", null],
    ["an unquoted line and a hyphen line", "Trzeba zrobić research rynku\n- Tomek", null],
    // question
    ["one Polish question", "Czy warto uczyć się Rusta w 2026?", "question"],
    ["one English question", "What would this look like if it were easy?", "question"],
    ["a question with a tag", "Dlaczego odkładam trening na później? #nawyki", "question"],
    ["a question and its answer", "Dlaczego odkładam trening?\nBo nie mam planu.", null],
    ["a long paragraph ending with ?", `${"To jest długi akapit o tym, co robię źle. ".repeat(6)}Co dalej?`, null],
    // framework
    ["a routine", "Poranna rutyna:\n- woda\n- 10 min medytacji\n- plan dnia\n- trening", "framework"],
    ["numbered steps", "1. Zdefiniuj problem\n2. Zbierz dane\n3. Wybierz jedną rzecz\n4. Zmierz efekt", "framework"],
    ["a checklist under a heading", "## Weekly review\n- [ ] inbox zero\n- [ ] kalendarz\n- [ ] cele na tydzień", "framework"],
    ["a prompt template", "# ROLE\nYou are an editor.\n# TASK\n- shorten the text\n- keep every link\n- keep every number\n# OUTPUT FORMAT\n- markdown only", "framework"],
    ["a table", "| dzień | trening |\n|---|---|\n| pon | siła |\n| śr | bieg |", "framework"],
    ["two bullets are not a list", "Dwie rzeczy:\n- jedna\n- druga", null],
    ["an AI answer with paragraphs and a short list", `${"Długi akapit wyjaśnienia, który ma sporo zdań i tłumaczy temat. ".repeat(4)}\n\n${"Drugi akapit, równie długi, z kolejnymi szczegółami tematu. ".repeat(4)}\n\n- a\n- b\n- c`, null],
    ["a list of links with descriptions", "- https://a.com świetny artykuł o nawykach i motywacji\n- https://b.com kolejny długi opis tego co tam jest\n- https://c.com i jeszcze jeden z długim opisem treści\n- d", null],
    // the AI decides
    ["a thought", "Uświadomiłem sobie dziś, że najwięcej energii tracę na przełączanie się między projektami.", null],
    ["an idea", "Pomysł: aplikacja do śledzenia nawyków, która sama proponuje tagi na podstawie podobnych notatek.", null],
    ["a task", "Zadzwonić do księgowej w sprawie VAT", null],
    ["code", "```ts\nconst a = 1;\nconst b = 2;\n```", null],
    ["empty", "   \n ", null],
    ["only tags", "#idea #rybiapaka", null],
  ];
  for (const [name, text, want] of cases) {
    it(`${name} -> ${want}`, () => expect(detectType(text)).toBe(want));
  }

  it("reads his 500k-character link dump as a source, quickly", () => {
    const dump = urlDump();
    const t0 = performance.now();
    expect(detectType(dump)).toBe("source");
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("never throws on odd input", () => {
    for (const s of [undefined as unknown as string, null as unknown as string, "„", "\"\" -", "— A", "?", "[image]", "![](", "```"]) {
      expect(() => detectType(s)).not.toThrow();
    }
  });
});

describe("folders", () => {
  it("tagPaths, inFolder and renameTag follow the slash", () => {
    expect(tagPaths("a/b/c")).toEqual(["a", "a/b", "a/b/c"]);
    expect(inFolder("projekty/rybiapaka", "projekty")).toBe(true);
    expect(inFolder("projekty", "projekty")).toBe(true);
    expect(inFolder("projektyx", "projekty")).toBe(false);
    expect(renameTag("projekty/rybiapaka/spec", "projekty/rybiapaka", "firma/rybia-paka")).toBe("firma/rybia-paka/spec");
    expect(renameTag("projektyx", "projekty", "p")).toBe("projektyx");
  });

  it("countTags counts notes, a tag twice on one note once", () => {
    expect(countTags([["a", "a", "b"], ["a"]])).toEqual(new Map([["a", 2], ["b", 1]]));
  });

  it("tagTree nests paths, adds up sub-folders, sorts by name, leaves types out", () => {
    const tree = tagTree([
      ["projekty/rybiapaka", 3],
      ["projekty/blog", 1],
      ["projekty", 1],
      ["książki", 2],
      ["insight", 5],
      ["ai/prompty/youtube", 1],
    ]);
    expect(tree.map((n) => n.name)).toEqual(["ai", "książki", "projekty"]);
    const projekty = tree[2];
    expect(projekty).toMatchObject({ path: "projekty", own: 1, count: 5 });
    expect(projekty.children.map((c) => [c.path, c.count])).toEqual([["projekty/blog", 1], ["projekty/rybiapaka", 3]]);
    expect(tree[0].children[0].children[0]).toMatchObject({ name: "youtube", path: "ai/prompty/youtube", own: 1, count: 1 });
    expect(tree[0].count).toBe(1);
    expect(tagTree([["insight", 5]], { includeTypes: true }).map((n) => n.path)).toEqual(["insight"]);
  });

  it("with folderNoteCounts, a note in two sub-folders counts once in the parent", () => {
    const notes = [["projekty/blog", "projekty/rybiapaka", "insight"], ["projekty/rybiapaka"], ["książki"]];
    const exact = folderNoteCounts(notes);
    expect(exact.get("projekty")).toBe(2);
    expect(exact.get("projekty/rybiapaka")).toBe(2);
    expect(exact.has("insight")).toBe(false);
    const tree = tagTree(countTags(notes), { noteCounts: exact });
    expect(tree.find((n) => n.path === "projekty")?.count).toBe(2);
    expect(tagTree(countTags(notes)).find((n) => n.path === "projekty")?.count).toBe(3);
  });
});

describe("the edge function's copy of the rules", () => {
  const block = (src: string) => {
    const b = src.indexOf("// ---- tag rules: begin");
    const e = src.indexOf("// ---- tag rules: end ----");
    expect(b).toBeGreaterThanOrEqual(0);
    expect(e).toBeGreaterThan(b);
    return src.slice(b, e);
  };

  it("is word for word the app's", () => {
    expect(block(sharedSource())).toBe(block(libSource()));
  });

  it("has no imports, so these tests can load it as it is", () => {
    expect(sharedSource()).not.toMatch(/^\s*import\s/m);
  });

  it("answers the same on a mixed corpus", () => {
    const corpus = [
      "#Książki", "#2", "projekty/RybiaPaka/", "do przeczytania", "Insight", "",
      "https://youtu.be/x", `[image] ${IMG}`, "Czy to działa?", "„Słowa.” — Ktoś Mądry",
      "- a\n- b\n- c", "Zwykła myśl o niczym konkretnym, dość długa jak na tytuł.", urlDump(20_000),
    ];
    for (const s of corpus) {
      expect(server.normaliseTag(s)).toBe(normaliseTag(s));
      expect(server.detectType(s)).toBe(detectType(s));
      expect(server.isTag(s)).toBe(isTag(s));
    }
    expect([...server.TYPE_TAGS]).toEqual([...TYPE_TAGS]);
  });
});

describe("learning: neighbours and feedback", () => {
  const n = (id: string, similarity: number, ...tags: string[]) => ({ id, similarity, tags });

  it("scores each tag by the summed similarity of the notes carrying it", () => {
    const ev = server.scoreNeighbours([n("a", 0.8, "rybiapaka", "biznes"), n("b", 0.6, "rybiapaka"), n("c", 0.5, "framework")], new Map());
    expect(ev.tags.get("rybiapaka")).toMatchObject({ notes: 2 });
    expect(ev.tags.get("rybiapaka")!.score).toBeCloseTo(1.4);
    expect(ev.tags.get("biznes")!.score).toBeCloseTo(0.8);
    expect(ev.types.get("framework")).toMatchObject({ notes: 1 });
    expect(ev.tags.has("framework")).toBe(false);
  });

  it("ignores notes below the similarity floor and tags that are not tags", () => {
    const ev = server.scoreNeighbours([n("a", 0.2, "daleko"), n("b", 0.7, "2", "Książki", "książki")], new Map());
    expect(ev.tags.has("daleko")).toBe(false);
    expect(ev.tags.has("2")).toBe(false);
    expect(ev.tags.get("książki")).toMatchObject({ notes: 1 });
  });

  it("moves scores by his answers on those notes: accepted gains, turned down loses", () => {
    const feedback = server.latestFeedback([
      { block_id: "a", tag: "rybiapaka", accepted: true, created_at: "2026-10-01" },
      { block_id: "a", tag: "marketing", accepted: false, created_at: "2026-10-01" },
    ]);
    const ev = server.scoreNeighbours([n("a", 0.8, "rybiapaka")], feedback);
    expect(ev.tags.get("rybiapaka")!.score).toBeCloseTo(0.8 + server.ACCEPT_BOOST * 0.8);
    expect(ev.tags.get("marketing")!.score).toBeCloseTo(-server.REJECT_PENALTY * 0.8);
    expect(ev.tags.get("marketing")!.notes).toBe(0);
  });

  it("latestFeedback keeps his last answer per note and tag", () => {
    const fb = server.latestFeedback([
      { block_id: "a", tag: "x", accepted: true, created_at: "2026-10-02" },
      { block_id: "a", tag: "x", accepted: false, created_at: "2026-10-01" },
      { block_id: "a", tag: "#Y", accepted: false, created_at: "2026-10-01" },
    ]);
    expect(fb.get("a")).toEqual(new Map([["x", true], ["y", false]]));
  });
});

describe("learning: combining the chips", () => {
  const vocab = new Map([["rybiapaka", 7], ["biznes", 3], ["książki", 12], ["projekty/blog", 2], ["nauka", 1], ["do-przeczytania", 0]]);
  const evidence = (tags: [string, number, number][] = [], types: [string, number, number][] = []) => ({
    tags: new Map(tags.map(([tag, score, notes]) => [tag, { tag, score, notes }])),
    types: new Map(types.map(([tag, score, notes]) => [tag, { tag, score, notes }])),
  });
  const base = { current: [] as string[], ruleType: null, evidence: evidence(), rejectedHere: new Set<string>(), ai: null, vocabulary: vocab };

  it("puts the type first: the rule's over the model's", () => {
    const out = server.combineSuggestions({ ...base, ruleType: "source", ai: { type: "insight", tags: [] } });
    expect(out[0]).toMatchObject({ tag: "source", kind: "type", source: "type-rule", reason: "tylko linki" });
  });

  it("takes the model's type when the rule is unsure, and says why in Polish", () => {
    const out = server.combineSuggestions({ ...base, ai: { type: "insight", tags: [] } });
    expect(out[0]).toMatchObject({ tag: "insight", source: "ai", reason: "AI: Twoja myśl lub wniosek" });
  });

  it("falls back to the similar notes' type, then to fragment", () => {
    const withNeighbours = server.combineSuggestions({ ...base, evidence: evidence([], [["framework", 1.2, 2]]) });
    expect(withNeighbours[0]).toMatchObject({ tag: "framework", source: "neighbours", reason: "2 podobne notatki mają #framework" });
    const nothing = server.combineSuggestions(base);
    expect(nothing).toEqual([expect.objectContaining({ tag: "fragment", kind: "type", source: "type-rule" })]);
  });

  it("offers no type when the note has one, and never one he turned down here", () => {
    expect(server.combineSuggestions({ ...base, current: ["quote"], ruleType: "source" }).some((s) => s.kind === "type")).toBe(false);
    const out = server.combineSuggestions({ ...base, ruleType: "source", rejectedHere: new Set(["source"]), ai: { type: "capture", tags: [] } });
    expect(out[0].tag).toBe("capture");
  });

  it("ranks tags by similar notes plus the model; the similar notes win a tie", () => {
    const out = server.combineSuggestions({
      ...base,
      ruleType: "framework",
      evidence: evidence([["rybiapaka", 1.5, 2], ["biznes", 0.6, 1], ["nauka", 0.3, 1]]),
      ai: { type: "framework", tags: ["książki", "rybiapaka"] },
    });
    // biznes (one note, 0.6) ties książki (the model's first pick, 0.6): the similar notes win.
    expect(out.map((s) => s.tag)).toEqual(["framework", "rybiapaka", "biznes", "książki"]);
    expect(out[1]).toMatchObject({ source: "neighbours", reason: "2 podobne notatki mają #rybiapaka" });
    expect(out[2]).toMatchObject({ source: "neighbours", reason: "1 podobna notatka ma #biznes" });
    expect(out[3]).toMatchObject({ source: "ai", reason: "AI: Twój tag (12 notatek)" });
    // "nauka" from one weak note alone is not enough.
    expect(out.some((s) => s.tag === "nauka")).toBe(false);

    const tie = server.combineSuggestions({
      ...base,
      evidence: evidence([["biznes", server.AI_WEIGHT, 1]]),
      ai: { type: null, tags: ["nauka"] },
    });
    expect(tie.filter((s) => s.kind === "tag").map((s) => s.tag)).toEqual(["biznes", "nauka"]);
  });

  it("gives at most five chips, at most four tags", () => {
    const out = server.combineSuggestions({
      ...base,
      ruleType: "source",
      evidence: evidence([["a", 3, 3], ["b", 2.5, 3], ["c", 2, 2], ["d", 1.5, 2], ["e", 1, 1]]),
      ai: { type: null, tags: ["f", "g"] },
    });
    expect(out).toHaveLength(server.MAX_SUGGESTIONS);
    expect(out.filter((s) => s.kind === "tag")).toHaveLength(server.MAX_TAGS);
  });

  it("never offers a tag on the note, a type name as a tag, or one he turned down here", () => {
    const out = server.combineSuggestions({
      ...base,
      current: ["Książki"],
      evidence: evidence([["książki", 2, 2], ["biznes", 1, 1]]),
      rejectedHere: new Set(["biznes"]),
      ai: { type: null, tags: ["insight", "nauka"] },
    });
    expect(out.filter((s) => s.kind === "tag").map((s) => s.tag)).toEqual(["nauka"]);
  });

  it("holds back a model tag he turned down on similar notes", () => {
    const out = server.combineSuggestions({
      ...base,
      evidence: evidence([["marketing", -server.REJECT_PENALTY * 0.7, 0]]),
      ai: { type: "insight", tags: ["marketing", "nauka"] },
    });
    expect(out.map((s) => s.tag)).toEqual(["insight", "nauka"]);
  });

  it("marks new tags and says when a new one sits in a known folder", () => {
    const out = server.combineSuggestions({ ...base, ai: { type: "task", tags: ["projekty/podcast", "zupełnie-nowy", "do-przeczytania"] } });
    const by = Object.fromEntries(out.map((s) => [s.tag, s]));
    expect(by["projekty/podcast"]).toMatchObject({ reason: "AI: nowy tag w projekty/", isNew: true });
    expect(by["zupełnie-nowy"]).toMatchObject({ reason: "AI: nowy tag", isNew: true });
    expect(by["do-przeczytania"]).toMatchObject({ reason: "AI: Twój folder" });
    expect(by["do-przeczytania"].isNew).toBeUndefined();
  });

  it("maps the model's spelling onto his vocabulary", () => {
    const out = server.combineSuggestions({ ...base, ai: { type: null, tags: ["ksiazki", "Do_Przeczytania"] } });
    expect(out.filter((s) => s.kind === "tag").map((s) => s.tag)).toEqual(["książki", "do-przeczytania"]);
  });

  it("speaks Polish plurals", () => {
    expect(server.similarNotesReason(1, "x")).toBe("1 podobna notatka ma #x");
    expect(server.similarNotesReason(3, "x")).toBe("3 podobne notatki mają #x");
    expect(server.similarNotesReason(5, "x")).toBe("5 podobnych notatek ma #x");
    expect(server.similarNotesReason(12, "x")).toBe("12 podobnych notatek ma #x");
    expect(server.similarNotesReason(22, "x")).toBe("22 podobne notatki mają #x");
    expect(server.notesCount(1)).toBe("1 notatka");
    expect(server.notesCount(4)).toBe("4 notatki");
    expect(server.notesCount(14)).toBe("14 notatek");
  });
});

describe("learning: the model's side", () => {
  it("buildVocabulary counts notes per tag, leaves out types and numbers, adds saved folders at 0", () => {
    const v = server.buildVocabulary([["Książki", "2", "insight"], ["książki", "rybiapaka"], ["książki"]], ["projekty/nowy", "książki"]);
    expect([...v]).toEqual([["książki", 3], ["rybiapaka", 1], ["projekty/nowy", 0]]);
  });

  it("the system prompt holds his vocabulary (top 150) and the eight types", () => {
    const v = new Map(Array.from({ length: 200 }, (_, i) => [`tag${String(i).padStart(3, "0")}`, 200 - i] as [string, number]));
    const p = server.systemPrompt(v);
    expect(p).toContain("tag000 (200)");
    expect(p).toContain("tag149 (51)");
    expect(p).not.toContain("tag150");
    for (const t of TYPE_TAGS) expect(p).toContain(`- ${t}:`);
    expect(server.systemPrompt(new Map())).toContain("(no tags yet)");
  });

  it("a note goes to the model capped, without link queries or addresses, with the similar notes' tags", () => {
    const content = `Spec https://shop.pl/p?ref=abc&token=xyz od jan@firma.pl\n${"x".repeat(3000)}`;
    const ev = {
      tags: new Map([["rybiapaka", { tag: "rybiapaka", score: 1.42, notes: 2 }], ["minus", { tag: "minus", score: -1, notes: 0 }]]),
      types: new Map([["framework", { tag: "framework", score: 0.6, notes: 1 }]]),
    };
    const s = server.noteForPrompt(3, { title: "Spec https://shop.pl/p?ref=abc&token=xyz od", content, tags: ["biznes", "2"] }, ev);
    expect(s).toMatch(/^\[3\]\nalready tagged: biznes\nsimilar notes: rybiapaka 1\.42, framework 0\.60\ntext \(first 2000 of \d+ characters\):/);
    expect(s).not.toContain("token=xyz");
    expect(s).not.toContain("jan@firma.pl");
    expect(s).toContain("https://shop.pl/p");
    expect(s).not.toContain("minus");
    expect(s.length).toBeLessThan(2300);
    // The Inbox title is the start of the text: not sent twice.
    expect(s.match(/Spec/g)).toHaveLength(1);
  });

  it("parseAiPicks reads the tool answer and survives a bad one", () => {
    const picks = server.parseAiPicks(JSON.stringify({
      items: [
        { i: 2, type: "Framework", tags: ["#Książki", "insight", "książki", 5, "projekty/Blog"] },
        { i: 1, type: "nonsense", tags: "x" },
        { i: 9, type: "task", tags: [] },
        { i: 2, type: "task", tags: ["dup"] },
      ],
    }), 3);
    expect(picks).toEqual([{ type: null, tags: [] }, { type: "framework", tags: ["książki", "projekty/blog"] }, null]);
    expect(server.parseAiPicks("not json", 2)).toEqual([null, null]);
    expect(server.parseAiPicks(undefined, 1)).toEqual([null]);
  });

  it("the tool offers exactly the eight types", () => {
    const item = (server.SUGGEST_TOOL.function.parameters.properties.items as { items: { properties: { type: { enum: string[] } } } }).items;
    expect(item.properties.type.enum).toEqual([...TYPE_TAGS]);
  });
});

describe("learning: pillars (round 2, section 10)", () => {
  const known = new Map(server.parsePillars([
    { id: "mind", name: "Mind", tagline: "Learning & Programming" },
    { id: "money", name: "Money", tagline: "Wealth & Income" },
    { id: "order", name: "Order" },
  ]).map((p) => [p.id, p]));
  const ev = (pillars: [string, number, number][] = []) => ({
    tags: new Map(),
    types: new Map(),
    pillars: new Map(pillars.map(([tag, score, notes]) => [tag, { tag, score, notes }])),
  });
  const base = { current: [] as string[], ruleType: null, rejectedHere: new Set<string>(), ai: null, vocabulary: new Map<string, number>() };

  it("parsePillars keeps his pillars bounded and drops the catch-all and malformed ids", () => {
    const out = server.parsePillars([
      { id: "uncategorized", name: "Uncategorized" },
      { id: "Mind", name: "  Mind \n", tagline: "x".repeat(200) },
      { id: "mind", name: "dup" },
      { id: "bad id", name: "x" },
      { id: "body" },
      "nonsense",
    ]);
    expect(out).toEqual([{ id: "mind", name: "Mind", tagline: "x".repeat(80) }, { id: "body", name: "body" }]);
    expect(server.parsePillars(undefined)).toEqual([]);
  });

  it("feedback keeps pillar rows as pillar:<id> (not squashed into a tag)", () => {
    const fb = server.latestFeedback([
      { block_id: "a", tag: "pillar:Money", accepted: false, created_at: "2026-10-01" },
      { block_id: "a", tag: "pillar:", accepted: true, created_at: "2026-10-01" },
    ]);
    expect(fb.get("a")).toEqual(new Map([["pillar:money", false]]));
  });

  it("similar notes' pillars score by similarity, moved by his answers; the catch-all never", () => {
    const feedback = server.latestFeedback([{ block_id: "b", tag: "pillar:mind", accepted: false, created_at: "2026-10-01" }]);
    const e = server.scoreNeighbours([
      { id: "a", tags: [], pillars: ["money", "uncategorized"], similarity: 0.8 },
      { id: "b", tags: ["x"], pillars: ["money"], similarity: 0.6 },
      { id: "c", tags: [], pillars: ["mind"], similarity: 0.1 },
    ], feedback);
    expect(e.pillars!.get("money")).toMatchObject({ notes: 2 });
    expect(e.pillars!.get("money")!.score).toBeCloseTo(1.4);
    expect(e.pillars!.get("mind")!.score).toBeCloseTo(-server.REJECT_PENALTY * 0.6);
    expect(e.pillars!.has("uncategorized")).toBe(false);
    expect(e.tags.has("pillar:mind")).toBe(false);
  });

  it("up to two pillar chips after the type and tags, with Polish reasons", () => {
    const out = server.combineSuggestions({
      ...base,
      ruleType: "source",
      evidence: ev([["money", 1.4, 2], ["order", 0.3, 1]]),
      ai: { type: null, tags: [], pillars: ["mind", "order"] },
      pillars: { known, current: [] },
    });
    expect(out[0].kind).toBe("type");
    expect(out.filter((s) => s.kind === "pillar")).toEqual([
      { tag: "pillar:money", kind: "pillar", source: "neighbours", reason: "2 podobne notatki są w Money", score: 1.4 },
      { tag: "pillar:order", kind: "pillar", source: "ai", reason: "AI: pasuje do Order", score: 0.84 },
    ]);
  });

  it("never a pillar the note has, one he turned down here, one he does not have, or without his list", () => {
    const input = {
      ...base,
      evidence: ev([["money", 2, 3], ["body", 2, 3]]),
      ai: { type: null, tags: [], pillars: ["mind"] },
    };
    expect(server.combineSuggestions({ ...input, rejectedHere: new Set(["pillar:mind"]), pillars: { known, current: ["money"] } }).filter((s) => s.kind === "pillar")).toEqual([]);
    expect(server.combineSuggestions(input).some((s) => s.kind === "pillar")).toBe(false);
    expect(server.combineSuggestions({ ...input, pillars: { known, current: [] } }).filter((s) => s.kind === "pillar").map((s) => s.tag)).toEqual(["pillar:money", "pillar:mind"]);
    expect(server.similarNotesPillarReason(1, "Mind")).toBe("1 podobna notatka jest w Mind");
    expect(server.similarNotesPillarReason(5, "Mind")).toBe("5 podobnych notatek jest w Mind");
  });

  it("the model is asked for pillars only when his list is sent", () => {
    const tool = server.suggestTool(["mind", "money"]);
    const item = (tool.function.parameters.properties.items as { items: { properties: Record<string, { items?: { enum?: string[] } }>; required: string[] } }).items;
    expect(item.properties.pillars.items!.enum).toEqual(["mind", "money"]);
    expect(item.required).toContain("pillars");
    expect("pillars" in (server.SUGGEST_TOOL.function.parameters.properties.items as { items: { properties: object } }).items.properties).toBe(false);
    const p = server.systemPrompt(new Map(), [...known.values()]);
    expect(p).toContain("HIS PILLARS");
    expect(p).toContain("mind: Mind - Learning & Programming");
    expect(server.systemPrompt(new Map())).not.toContain("HIS PILLARS");
    const s = server.noteForPrompt(1, { title: "", content: "x", tags: [], pillars: ["money", "nope"] }, ev([["mind", 0.9, 1]]), known);
    expect(s).toContain("pillars now: money\nsimilar notes' pillars: mind 0.90\n");
  });

  it("parseAiPicks keeps only his pillar ids, at most two", () => {
    const picks = server.parseAiPicks({ items: [{ i: 1, type: "task", tags: [], pillars: ["Money", "nonsense", "mind", "order"] }] }, 1, ["mind", "money", "order"]);
    expect(picks[0]).toEqual({ type: "task", tags: [], pillars: ["money", "mind"] });
    expect(server.parseAiPicks({ items: [{ i: 1, type: "task", tags: [], pillars: ["money"] }] }, 1)[0]).toEqual({ type: "task", tags: [] });
  });
});

describe("learning: content that looks like a credential never goes to a model", () => {
  const secret = [
    "login: jan.kowalski\nhasło: Kot!2024x",
    "Password: hunter22",
    "moje hasło to Wiosna2026",
    "hasło Kot!2024x do banku",
    "PIN 4821",
    "api_key = abcdef1234567890",
    "OPENAI sk-proj-abcdefghijklmnopqrstuvwx1234",
    "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "AKIAABCDEFGHIJKLMNOP",
    "-----BEGIN OPENSSH PRIVATE KEY-----\nabc",
    "ftp://admin:sekret@serwer.pl/pliki",
    "jan@example.com / Haslo123!",
    "konto bankowe\nKot!2024x",
    "klucz: 9f8e7d6c5b4a39281706f5e4d3c2b1a0aa77bb88",
    "a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9",
    "seed phrase: abandon ability able about",
  ];
  const plain = [
    "Jak działają tokeny w LLM-ach? Limit to 128k tokenów.",
    "Menedżer haseł: warto przejść na Bitwarden",
    "Hasło dnia: konsekwencja",
    "Zadzwonić do Tomka, tel. 600 100 200",
    "COVID-19",
    "Sklep\nsklep24.pl",
    "IMG_20261012_101500.jpg",
    "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdEFG/edit",
    "Notatka o Rust i WebAssembly, 2026",
    "jan@example.com napisał wczoraj",
    "",
  ];
  for (const s of secret) it(`skips: ${JSON.stringify(s.slice(0, 30))}`, () => expect(server.looksLikeCredential(s)).toBe(true));
  for (const s of plain) it(`keeps: ${JSON.stringify(s.slice(0, 30))}`, () => expect(server.looksLikeCredential(s)).toBe(false));

  it("checks a 10k-character slice of a huge note quickly", () => {
    const t0 = performance.now();
    server.looksLikeCredential(urlDump(10_000));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("ai-suggest-tags wiring", () => {
  const src = fnSource();

  it("keeps the items mode for the Inbox's AI Tag button", () => {
    expect(src).toContain('body?.mode === "learn"');
    expect(src).toContain("itemsMode(auth.userId, body)");
    expect(src).toContain('name: "suggest_tags"');
    expect(src).toMatch(/return jsonResponse\(\{ tags \}\)/);
  });

  it("uses the shared rules and the locked neighbours RPC with the service role", () => {
    expect(src).toContain('from "../_shared/archive-tags.ts"');
    expect(src).toMatch(/db\.rpc\("similar_archive_blocks", \{ p_user: userId, p_block: b\.id, p_k: NEIGHBOURS_K \}\)/);
    expect(src).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(src).toMatch(/\.slice\(0, MAX_BLOCKS\)/);
    expect(src).toMatch(/const MAX_BLOCKS = 20;/);
  });

  it("caps the month per user under its own feature, and still answers past it", () => {
    expect(src).toContain('const FEATURE = "archive-tags"');
    expect(src).toContain('Deno.env.get("TAGS_BUDGET_USD") || "1"');
    expect(src).toMatch(/monthSpend\(userId\)\) >= BUDGET_USD\) \{\s*ai = "capped"/);
  });

  it("checks for secrets before embedding and before the model", () => {
    const secretAt = src.indexOf("const secret = new Set(");
    expect(secretAt).toBeGreaterThan(0);
    expect(src.indexOf("await embedFirst(")).toBeGreaterThan(secretAt);
    expect(src).toMatch(/!embedded\.has\(b\.id\) && !secret\.has\(b\.id\)/);
    expect(src).toMatch(/const askable = blocks\.filter\(\(b\) => !secret\.has\(b\.id\)\)/);
  });

  it("takes his pillars from the request and offers only those", () => {
    expect(src).toContain("const pillars = parsePillars(body?.pillars);");
    expect(src).toContain("tools: [suggestTool(pillarIds)]");
    expect(src).toMatch(/pillars: knownPillars\.size \? \{ known: knownPillars, current: b\.pillars \?\? \[\] \} : undefined/);
    expect(src).toContain('select("id,title,content,tags,pillars")');
  });

  it("the items mode never sends an item that looks like a credential", () => {
    expect(src).toMatch(/const sent = items\.map\(\(_, i\) => i\)\.filter\(\(i\) => !looksLikeCredential\(/);
    expect(src).toContain("sent.map((i, k) => `[${k + 1}]\\n${items[i]}`)");
  });

  it("embeds a just-saved note through ai-embed-block", () => {
    expect(src).toContain("/functions/v1/ai-embed-block");
    expect(src).toContain('action: "embed"');
  });
});

describe("migrations", () => {
  it("archive_tag_feedback: own rows only, gone with the note", () => {
    const sql = learningSql();
    expect(sql).toMatch(/block_id uuid NOT NULL REFERENCES public\.archive_blocks\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/source IN \('neighbours', 'ai', 'type-rule', 'manual'\)/);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/FOR SELECT\s+USING \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/FOR INSERT\s+WITH CHECK \(\s*auth\.uid\(\) = user_id\s+AND EXISTS/);
  });

  it("similar_archive_blocks is locked like search_archive_blocks", () => {
    const sql = learningSql();
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.similar_archive_blocks(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.similar_archive_blocks(uuid, uuid, integer) TO service_role;");
    expect(sql).toMatch(/RETURNS TABLE \(id uuid, tags text\[\], pillars text\[\], similarity double precision\)/);
    // A note with only a pillar is a neighbour for pillars; the catch-all is not.
    expect(sql).toMatch(/OR EXISTS \(SELECT 1 FROM unnest\(ab\.pillars\) AS p\(pillar\) WHERE p\.pillar <> 'uncategorized'\)/);
    // The result type changed from a draft: dropped before it is created.
    expect(sql.indexOf("DROP FUNCTION IF EXISTS public.similar_archive_blocks(uuid, uuid, integer);")).toBeLessThan(sql.indexOf("CREATE FUNCTION public.similar_archive_blocks"));
  });

  it("archive-images: the public read policy goes, the owner's (and old file-share) stays readable", () => {
    const sql = storageSql();
    expect(sql).toContain('DROP POLICY IF EXISTS "Public read access for archive images" ON storage.objects;');
    expect(sql).toMatch(/FOR SELECT\s+TO authenticated/);
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = 'file-share'\s+AND \(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/);
  });
});
