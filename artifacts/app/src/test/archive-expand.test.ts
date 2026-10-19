import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aiBlockLines,
  insertAdditions,
  numberedParagraphs,
  paragraphRanges,
  validAdditions,
} from "../../../../supabase/functions/_shared/archive-expand";
import { AI_ACTIONS } from "../lib/archive-ai";
import { checkAIResult, keepsAllOf } from "../lib/archive-ai-check";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("Expand is put together on the server", () => {
  const note = "Pierwsza myśl o #nauka.\nDruga linia tej samej.\n\n- punkt 1\n- punkt 2\n\n```\nkod\n\nwciąż kod\n```\n\nOstatnia https://a.com/x";

  it("splits paragraphs at blank lines, a code block whole", () => {
    expect(paragraphRanges(note)).toEqual([[0, 1], [3, 4], [6, 10], [12, 12]]);
    expect(numberedParagraphs("a\n\nb")).toBe("[1] a\n\n[2] b");
  });

  it("inserts marked blocks and leaves every character of his text in place", () => {
    const out = insertAdditions(note, [
      { after: 1, text: "Wyjaśnienie.\nDruga linia." },
      { after: 4, text: "> 💡 AI: Na koniec." },
      { after: 1, text: "Jeszcze jedno." },
    ]);
    expect(out).toBe(
      "Pierwsza myśl o #nauka.\nDruga linia tej samej.\n\n> 💡 AI: Wyjaśnienie.\n> Druga linia.\n\n> 💡 AI: Jeszcze jedno.\n\n- punkt 1\n- punkt 2\n\n```\nkod\n\nwciąż kod\n```\n\nOstatnia https://a.com/x\n\n> 💡 AI: Na koniec.",
    );
    expect(keepsAllOf(note, out)).toBe(true);
    expect(checkAIResult("expand", note, out)).toEqual([]);
  });

  it("checks what the model returned", () => {
    expect(validAdditions([{ after: 9, text: "x" }, { after: "2", text: "y" }, { after: 1, text: "  " }, null], 3)).toEqual([
      { after: 3, text: "x" },
      { after: 2, text: "y" },
    ]);
    expect(validAdditions("nope", 3)).toEqual([]);
    expect(aiBlockLines("")).toEqual([]);
    expect(aiBlockLines("a\n\nb")).toEqual(["> 💡 AI: a", ">", "> b"]);
  });

  it("no additions: the note unchanged", () => {
    expect(insertAdditions(note, [])).toBe(note);
  });
});

describe("the borders the app states are the ones the functions are given", () => {
  const expand = read("../../../../supabase/functions/ai-archive-expand/index.ts");
  const clean = read("../../../../supabase/functions/ai-archive-clean/index.ts");
  const multi = read("../../../../supabase/functions/ai-archive-multi/index.ts");

  it("Shorten keeps links, numbers, names, dates and #tags and adds nothing", () => {
    expect(AI_ACTIONS.shorten.border).toMatch(/link, number, name, date and #tag/);
    expect(expand).toMatch(/Keep EVERY link \(URL\) exactly as written, every number, name and date, and every #tag/);
    expect(expand).toMatch(/Never add anything/);
  });

  it("Expand never sends his text back through the model", () => {
    expect(expand).toMatch(/insertAdditions\(content, additions\)/);
    expect(AI_ACTIONS.expand.border).toMatch(/> 💡 AI:/);
  });

  it("Clean fixes typing only and no longer splits", () => {
    expect(clean).not.toMatch(/Separate genuinely different topics with ---/);
    expect(clean).toMatch(/split the text into several notes/);
  });

  it("no function forces plain text any more", () => {
    for (const src of [expand, clean, multi]) expect(src).not.toMatch(/Write in plain text only/);
  });

  it("no function cuts a note silently", () => {
    expect(expand).not.toMatch(/slice\(0, 30_000\)/);
    expect(clean).not.toMatch(/slice\(0, 60_000\)/);
    expect(multi).not.toMatch(/slice\(0, 8_000\)/);
  });
});
