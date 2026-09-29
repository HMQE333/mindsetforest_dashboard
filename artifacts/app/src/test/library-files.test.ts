import { describe, it, expect } from "vitest";
import { isScan, matchFilesToBooks, pagesReadFor } from "../lib/library-data";

const books = [
  { id: "a", title: "Thinking, Fast and Slow" },
  { id: "b", title: "Deep Work: Rules for Focused Success in a Distracted World" },
  { id: "c", title: "The Laws of Human Nature" },
  { id: "d", title: "Human Nature" },
  { id: "e", title: "Traction" },
  { id: "f", title: "Zero to One" },
  { id: "g", title: "Psycho-Cybernetics" },
  { id: "h", title: "Zbrodnia i kara" },
];
const f = (name: string) => ({ name });

describe("matchFilesToBooks", () => {
  it("finds the title inside a messy file name", () => {
    const { matched, unmatched } = matchFilesToBooks(
      [f("Kahneman - Thinking, Fast and Slow (2011).pdf"), f("traction_weinberg_mares.PDF"), f("Psycho_Cybernetics - Maltz.pdf")],
      books,
    );
    expect(matched.map((m) => [m.file.name, m.book.id])).toEqual([
      ["Kahneman - Thinking, Fast and Slow (2011).pdf", "a"],
      ["traction_weinberg_mares.PDF", "e"],
      ["Psycho_Cybernetics - Maltz.pdf", "g"],
    ]);
    expect(unmatched).toEqual([]);
  });

  it("matches a file named after the main title only", () => {
    const { matched } = matchFilesToBooks([f("Cal Newport - Deep Work.pdf")], books);
    expect(matched[0]?.book.id).toBe("b");
  });

  it("prefers the longest title", () => {
    const { matched } = matchFilesToBooks([f("Robert Greene - The Laws of Human Nature.pdf")], books);
    expect(matched[0]?.book.id).toBe("c");
  });

  it("needs whole words, ignores accents and case", () => {
    expect(matchFilesToBooks([f("zeroToOne.pdf")], books).matched).toEqual([]);
    expect(matchFilesToBooks([f("ZBRODNIA I KARÁ.pdf")], books).matched[0]?.book.id).toBe("h");
  });

  it("gives each book one file and reports the rest", () => {
    const { matched, unmatched } = matchFilesToBooks([f("Traction.pdf"), f("Traction (1).pdf"), f("notes.pdf")], books);
    expect(matched).toHaveLength(1);
    expect(unmatched.map((u) => u.name)).toEqual(["Traction (1).pdf", "notes.pdf"]);
  });

  it("leaves a file two books match equally well unmatched", () => {
    const twins = [{ id: "x", title: "Traction" }, { id: "y", title: "Traction" }];
    expect(matchFilesToBooks([f("Traction.pdf")], twins).unmatched).toHaveLength(1);
  });
});

describe("pagesReadFor", () => {
  it("carries the PDF position over to the book's page count", () => {
    expect(pagesReadFor(50, 100, 300)).toBe(150);
    expect(pagesReadFor(100, 100, 300)).toBe(300);
  });

  it("uses the PDF's count when the book has none, and clamps", () => {
    expect(pagesReadFor(12, 240, 0)).toBe(12);
    expect(pagesReadFor(500, 240, 0)).toBe(240);
    expect(pagesReadFor(3, 0, 200)).toBe(0);
  });
});

describe("isScan", () => {
  it("calls a PDF with almost no text a scan", () => {
    expect(isScan({ pages: 200, textChars: 0 })).toBe(true);
    expect(isScan({ pages: 200, textChars: 1500 })).toBe(true);
    expect(isScan({ pages: 200, textChars: 350_000 })).toBe(false);
  });
});
