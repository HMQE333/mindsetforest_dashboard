import { describe, it, expect } from "vitest";
import { isScan, pagesReadFor } from "../lib/library-data";

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
