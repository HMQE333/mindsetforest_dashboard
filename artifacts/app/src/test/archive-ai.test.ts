import { describe, expect, it } from "vitest";
import { aiNoteTitle, aiTooLong, multiTooLong, titleAfterReplace } from "../lib/archive-ai";
import { checkAIResult, diffCounts, keepsAllOf, warnsOfLoss, wordDiff, type DiffPart } from "../lib/archive-ai-check";
import { agoText, findRecentDuplicates, inboxNotes, shortTitle, tagsFromInput } from "../lib/archive-data";

const join = (parts: DiffPart[], keep: "del" | "add") => parts.filter((p) => p.kind === "same" || p.kind === keep).map((p) => p.text).join("");

describe("wordDiff", () => {
  const cases: [string, string][] = [
    ["", ""],
    ["same text", "same text"],
    ["", "all new"],
    ["all gone", ""],
    ["Ala ma kota", "Ala ma psa"],
    ["one two three four", "one three four five"],
    ["Zażółć gęślą jaźń. Druga linia\n\nTrzecia", "Zażółć gęślą jaźń.\n\n> 💡 AI: dopisek\n\nDruga linia\n\nTrzecia"],
    ["https://a.com/x?y=1 and 42 things", "https://a.com/x?y=2 and 43 things"],
  ];
  it.each(cases)("rebuilds both sides: %j -> %j", (a, b) => {
    const parts = wordDiff(a, b);
    expect(join(parts, "del")).toBe(a);
    expect(join(parts, "add")).toBe(b);
  });

  it("marks only the changed word", () => {
    expect(wordDiff("Ala ma kota", "Ala ma psa")).toEqual([
      { kind: "same", text: "Ala ma " },
      { kind: "del", text: "kota" },
      { kind: "add", text: "psa" },
    ]);
  });

  it("shows an insertion as added only", () => {
    const parts = wordDiff("first\n\nsecond", "first\n\n> 💡 AI: more\n\nsecond");
    expect(parts.filter((p) => p.kind === "del")).toEqual([]);
    expect(diffCounts(parts)).toMatchObject({ removed: 0, added: 2 });
  });

  it("folds a change split by a space into one", () => {
    const parts = wordDiff("a b c d", "a x y d");
    expect(parts).toEqual([
      { kind: "same", text: "a " },
      { kind: "del", text: "b c" },
      { kind: "add", text: "x y" },
      { kind: "same", text: " d" },
    ]);
  });

  it("stays correct and fast on a big rewrite", () => {
    const a = Array.from({ length: 4000 }, (_, i) => `word${i % 97}`).join(" ");
    const b = Array.from({ length: 2500 }, (_, i) => `word${(i * 7) % 89}`).join(" ");
    const t0 = Date.now();
    const parts = wordDiff(a, b, { deadlineMs: 150 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(join(parts, "del")).toBe(a);
    expect(join(parts, "add")).toBe(b);
  });
});

describe("checkAIResult", () => {
  const note = "Kup #książki do 19.10.2026: https://allegro.pl/oferta/1 za 45 zł. Dużo dużo powtórzeń tutaj, naprawdę dużo.";

  it("passes a shorter text that keeps links, numbers and tags", () => {
    const short = "Kup #książki do 19.10.2026: https://allegro.pl/oferta/1 za 45 zł.";
    expect(checkAIResult("shorten", note, short)).toEqual([]);
  });

  it("names the missing link, number and tag", () => {
    const w = checkAIResult("shorten", note, "Kup książki za 40 zł.");
    expect(w.map((x) => x.kind)).toEqual(["links", "numbers", "tags"]);
    expect(w[0].items).toEqual(["https://allegro.pl/oferta/1"]);
    expect(w[1].items).toEqual(["19.10.2026", "45"]);
    expect(w[2].items).toEqual(["książki"]);
    expect(warnsOfLoss(w)).toBe(true);
  });

  it("says when Shorten made it longer, or nothing changed", () => {
    expect(checkAIResult("shorten", "abc 1", "abc 1 and more").map((w) => w.kind)).toEqual(["longer"]);
    expect(checkAIResult("clean", "abc", "abc").map((w) => w.kind)).toEqual(["nothing"]);
  });

  it("Expand: his text kept word for word, or a warning", () => {
    const own = "Pierwsza myśl.\n\nDruga myśl.";
    expect(checkAIResult("expand", own, "Pierwsza myśl.\n\n> 💡 AI: wyjaśnienie\n\nDruga myśl.")).toEqual([]);
    expect(checkAIResult("expand", own, "Pierwsza idea.\n\n> 💡 AI: wyjaśnienie\n\nDruga myśl.")[0].kind).toBe("changed");
    expect(checkAIResult("expand", own, own).map((w) => w.kind)).toEqual(["nothing"]);
  });

  it("Clean: a few typos are fine, a rewrite is not", () => {
    const text = "To jest notatka z kilkoma błendami i podwójnymi  spacjami, która ma zostać taka sama.";
    expect(checkAIResult("clean", text, text.replace("błendami", "błędami").replace("  ", " "))).toEqual([]);
    const rewrite = "Notatka zawiera błędy, które poprawiono, a treść skrócono.";
    expect(checkAIResult("clean", text, rewrite).map((w) => w.kind)).toContain("removed");
  });

  it("an empty answer is one warning", () => {
    expect(checkAIResult("shorten", note, "  ").map((w) => w.kind)).toEqual(["empty"]);
  });

  it("a summary is checked for links only", () => {
    expect(checkAIResult("summarize", "a 1 #x https://a.com", "short https://a.com")).toEqual([]);
  });
});

describe("keepsAllOf", () => {
  it("ignores white space, needs every word in order", () => {
    expect(keepsAllOf("a b\nc", "a  b\n\n> added\n\nc")).toBe(true);
    expect(keepsAllOf("a b c", "a c b")).toBe(false);
  });
});

describe("limits", () => {
  it("refuses a note the function would have to cut", () => {
    expect(aiTooLong("shorten", "x".repeat(30_000))).toBeNull();
    expect(aiTooLong("shorten", "x".repeat(30_001))).toMatch(/Too long for Shorten/);
    expect(aiTooLong("clean", "x".repeat(50_000))).toBeNull();
  });
  it("refuses notes too long to combine", () => {
    expect(multiTooLong([{ title: "a", content: "x" }, { title: "b", content: "y" }])).toBeNull();
    expect(multiTooLong([{ title: "Long one", content: "x".repeat(15_001) }])).toMatch(/Long one/);
    expect(multiTooLong(Array.from({ length: 5 }, (_, i) => ({ title: `${i}`, content: "x".repeat(14_000) })))).toMatch(/Together/);
  });
});

describe("titles", () => {
  it("an automatic title follows the new text; his own stays", () => {
    expect(titleAfterReplace("Long first line more", "Long first line\nmore", "Short\nrest")).toBe("Short rest");
    expect(titleAfterReplace("My title", "Long first line", "Short")).toBe("My title");
  });
  it("names a note made by AI", () => {
    expect(aiNoteTitle("expand", "Moja notatka")).toBe("Expanded: Moja notatka");
    expect(aiNoteTitle("merge", "", 3)).toBe("Merged (3 notes)");
  });
  it("shortTitle: a link becomes its host", () => {
    expect(shortTitle("https://www.youtube.com/watch?v=abcdefghijklmnopqrstuvwxyz0123456789")).toBe("youtube.com…");
    expect(shortTitle("[image] https://x.supabase.co/storage/v1/object/public/a.png")).toBe("x.supabase.co…");
    expect(shortTitle("https://a.com/x see this")).toBe("a.com… see this");
    expect(shortTitle("  two\n lines ")).toBe("two lines");
    expect(shortTitle("x".repeat(100), 20)).toBe(`${"x".repeat(19)}…`);
    expect(shortTitle("")).toBe("Untitled");
  });
});

describe("inbox", () => {
  it("one paste is one note unless he chose to split", () => {
    const text = "one\n---\ntwo";
    expect(inboxNotes(text, false)).toEqual([text]);
    expect(inboxNotes(text, true)).toEqual(["one", "two"]);
    expect(inboxNotes("  ", false)).toEqual([]);
  });

  it("finds a note saved in the last ten minutes, word for word", () => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    const recent = [
      { content: "fresh note\r\n", created_at: "2026-10-19T11:57:00Z" },
      { content: "older", created_at: "2026-10-19T11:30:00Z" },
      { content: "never reached", created_at: "2026-10-19T11:59:00Z" },
    ];
    expect(findRecentDuplicates(["fresh note", "Fresh note", "older"], recent, now)).toEqual([{ index: 0, savedAt: "2026-10-19T11:57:00Z" }]);
    expect(agoText("2026-10-19T11:57:00Z", now)).toBe("3 min ago");
    expect(agoText("2026-10-19T11:59:40Z", now)).toBe("just now");
  });
});

describe("tagsFromInput (the edit dialog)", () => {
  it("reads the tags with the rules, keeps an old non-tag he left in, one type at most", () => {
    expect(tagsFromInput("Książki, projekty/RybiaPaka/ , insight, 2, quote, książki", ["2", "książki"])).toEqual(["książki", "projekty/rybiapaka", "2", "quote"]);
  });
  it("drops a new non-tag and what he removed", () => {
    expect(tagsFromInput("13, nauka", ["2"])).toEqual(["nauka"]);
    expect(tagsFromInput("", ["2", "x"])).toEqual([]);
  });
});
