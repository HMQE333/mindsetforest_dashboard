import { describe, expect, it } from "vitest";
import { ARCHIVE_PATTERN, CHATGPT_HOME, chatGptTarget, isChatGptUrl, matchesArchivePrompt, pickArchivePrompt } from "../lib/study-prompts";

/** The user's three Archive notes from 30 Sep - 2 Oct, shortened (scratchpad learning-mode.txt). */
const PRIMER = "I want you to create a compact, self-contained primer on **[SUBJECT]** designed to give me a deep entry into the field.";
const PIPELINE = "University textbook / papers / sources\n ↓\n ARCHITECT PROMPT\n ↓\n PRIMER PROMPT\n ↓\n Markdown";
const LEARNING = "Tryb nauki: mój spersonalizowany workflow\nUcz mnie tak, żeby maksymalizować szybkie zrozumienie.";
const ROWS = [
  { content: LEARNING, created_at: "2026-10-02 21:38:17.442303+00" },
  { content: PIPELINE, created_at: "2026-09-30 16:11:41.204625+00" },
  { content: PRIMER, created_at: "2026-09-30 15:40:24.331842+00" },
];

describe("Wczytaj z Archiwum", () => {
  it("finds the learning mode by its first words and the Primer by its request", () => {
    expect(pickArchivePrompt("learning", ROWS)?.content).toBe(LEARNING);
    expect(pickArchivePrompt("primer", ROWS)?.content).toBe(PRIMER);
    // The pipeline sketch mentions "PRIMER PROMPT" but is not the prompt.
    expect(matchesArchivePrompt("primer", PIPELINE)).toBe(false);
  });

  it("takes the newest match", () => {
    const newer = { content: "Tryb nauki: wersja 2\nKrócej.", created_at: "2026-10-10 08:00:00+00" };
    expect(pickArchivePrompt("learning", [...ROWS, newer])).toBe(newer);
    expect(pickArchivePrompt("learning", [newer, ...ROWS])).toBe(newer);
  });

  it("allows a heading or bold before 'Tryb nauki', and any case, but not the words in the middle of a note", () => {
    expect(matchesArchivePrompt("learning", "# Tryb nauki: mój workflow")).toBe(true);
    expect(matchesArchivePrompt("learning", "  **TRYB NAUKI**\nUcz mnie")).toBe(true);
    expect(matchesArchivePrompt("learning", "Notatka o tym, jak zmienić tryb nauki")).toBe(false);
    expect(matchesArchivePrompt("learning", "Trybik")).toBe(false);
    expect(matchesArchivePrompt("primer", "create a compact self-contained primer on X")).toBe(true);
    expect(matchesArchivePrompt("primer", "A Compact, Self Contained Primer")).toBe(true);
    expect(pickArchivePrompt("primer", [{ content: "", created_at: "2026-10-01" }])).toBeNull();
  });

  it("narrows the database query to rows the matcher can accept", () => {
    const like = (pattern: string, text: string) =>
      new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, "[\\s\\S]*")}$`, "i").test(text);
    expect(like(ARCHIVE_PATTERN.learning, LEARNING)).toBe(true);
    expect(like(ARCHIVE_PATTERN.primer, PRIMER)).toBe(true);
    expect(like(ARCHIVE_PATTERN.primer, "a compact, self contained primer")).toBe(true);
  });
});

describe("the ChatGPT project link", () => {
  it("accepts only https links on chatgpt.com", () => {
    expect(isChatGptUrl("https://chatgpt.com/g/g-p-67a8b9c0d1e2-logika/project")).toBe(true);
    expect(isChatGptUrl(" https://chatgpt.com/ ")).toBe(true);
    for (const bad of ["http://chatgpt.com/g/x", "https://chat.openai.com/g/x", "https://chatgpt.com.evil.example/", "https://user:pw@chatgpt.com/", "https://chatgpt.com:8443/g/x", "javascript:alert(1)", "chatgpt.com/g/x", ""]) {
      expect(isChatGptUrl(bad)).toBe(false);
    }
  });

  it("opens the project when set, else a new chat", () => {
    expect(chatGptTarget("https://chatgpt.com/g/g-p-1/project")).toBe("https://chatgpt.com/g/g-p-1/project");
    expect(chatGptTarget("")).toBe(CHATGPT_HOME);
    expect(chatGptTarget("https://example.com/")).toBe(CHATGPT_HOME);
    expect(chatGptTarget(null)).toBe("https://chatgpt.com/");
  });
});
