import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  READER_FIRST_CHARS,
  READER_PIECE_CHARS,
  compactCount,
  firstPieceCount,
  neighbourAfterRemoval,
  noteHeading,
  readerPieces,
  readerTitle,
  readingLabel,
  swipeStep,
  type ReaderPiece,
} from "../components/archive/reader-model";
import LectureMarkdown, { useLectureLayout, type LinkHandlers } from "../components/archive/lectures/LectureMarkdown";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const texts = (pieces: ReaderPiece[]) => pieces.filter((p): p is Extract<ReaderPiece, { kind: "text" }> => p.kind === "text").map((p) => p.text);
const fences = (s: string) => s.split("\n").filter((l) => /^ {0,3}```/.test(l)).length;

/** A pasted export like the owner's: ~500k characters, one URL a line, no blank lines. */
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

describe("the reader's parts", () => {
  it("keeps an ordinary note whole and shows its [image] lines as images", () => {
    const note = "# Plan\n\nFirst line\n[image] https://cdn.example.com/a.png\nAfter the image\n\n  [image]   https://cdn.example.com/b.jpg  ";
    expect(readerPieces(note, Infinity)).toEqual([
      { kind: "text", text: "# Plan\n\nFirst line" },
      { kind: "image", url: "https://cdn.example.com/a.png" },
      { kind: "text", text: "After the image\n" },
      { kind: "image", url: "https://cdn.example.com/b.jpg" },
    ]);
    // Inside a sentence or a code block, "[image]" is text.
    expect(readerPieces("see [image] https://x.example/a.png here", Infinity)).toEqual([{ kind: "text", text: "see [image] https://x.example/a.png here" }]);
    expect(readerPieces("```\n[image] https://x.example/a.png\n```", Infinity)).toEqual([{ kind: "text", text: "```\n[image] https://x.example/a.png\n```" }]);
  });

  it("cuts a 500k-character URL dump into parts of about 10k at line ends, losing nothing", () => {
    const dump = urlDump();
    const t0 = performance.now();
    const pieces = readerPieces(dump);
    const ms = performance.now() - t0;
    const parts = texts(pieces);
    expect(parts.length).toBeGreaterThan(45);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThan(READER_PIECE_CHARS + 100);
    expect(parts.join("\n")).toBe(dump);
    // Each part starts on a whole URL.
    expect(parts.slice(1).every((p) => p.startsWith("https://"))).toBe(true);
    expect(ms).toBeLessThan(500);
    // It opens with ~30k characters; "Show all" brings the rest.
    const first = firstPieceCount(pieces);
    const opened = parts.slice(0, first).join("\n").length;
    expect(opened).toBeGreaterThan(READER_FIRST_CHARS / 2);
    expect(opened).toBeLessThanOrEqual(READER_FIRST_CHARS);
  });

  it("prefers a blank line for a cut, and never cuts inside a code block", () => {
    const para = (i: number) => `Paragraph ${i}. ${"word ".repeat(60)}`;
    const blocks: string[] = [];
    for (let i = 0; i < 60; i++) blocks.push(i % 7 === 3 ? "```ts\n" + Array.from({ length: 30 }, (_, k) => `const v${k} = ${k};`).join("\n") + "\n```" : para(i));
    const note = blocks.join("\n\n");
    const parts = texts(readerPieces(note, 3000));
    expect(parts.length).toBeGreaterThan(4);
    for (const p of parts) {
      expect(fences(p) % 2).toBe(0);
      expect(p.startsWith("Paragraph") || p.startsWith("```ts")).toBe(true);
    }
    expect(parts.join("\n\n").replace(/\n{3,}/g, "\n\n")).toBe(note);
  });

  it("closes and reopens a code block longer than two parts", () => {
    const code = "```python\n" + Array.from({ length: 400 }, (_, k) => `print(${k})  # line ${k}`).join("\n") + "\n```";
    const parts = texts(readerPieces(`Intro\n\n${code}\n\nOutro`, 2000));
    expect(parts.length).toBeGreaterThanOrEqual(3);
    for (const p of parts) expect(fences(p) % 2).toBe(0);
    expect(parts[0].startsWith("Intro")).toBe(true);
    expect(parts.slice(1).every((p) => p.startsWith("```python"))).toBe(true);
    expect(parts.at(-1)?.endsWith("Outro")).toBe(true);
    const body = parts.join("\n").split("\n").filter((l) => l.startsWith("print("));
    expect(body).toHaveLength(400);
  });

  it("cuts one enormous line at spaces", () => {
    const line = Array.from({ length: 5000 }, (_, i) => `w${i}`).join(" ");
    const parts = texts(readerPieces(`Title\n${line}`, 4000));
    expect(parts[0]).toBe("Title");
    expect(parts.slice(1).join("")).toBe(line);
    expect(parts.slice(1, -1).every((p) => p.length <= 4000 && p.endsWith(" "))).toBe(true);
  });

  it("opens at least one part, and every part of a note that fits", () => {
    const short: ReaderPiece[] = [{ kind: "text", text: "a".repeat(100) }, { kind: "image", url: "https://x.example/i.png" }];
    expect(firstPieceCount(short)).toBe(2);
    expect(firstPieceCount([{ kind: "text", text: "a".repeat(READER_FIRST_CHARS * 3) }])).toBe(1);
    expect(firstPieceCount([])).toBe(0);
  });
});

describe("the reader's rendering", () => {
  const links: LinkHandlers = { resolve: () => ({ kind: "missing" }), onMoment: () => {}, onLecture: () => {} };
  const Note = ({ text }: { text: string }) => createElement(LectureMarkdown, { layout: useLectureLayout(text), lang: "en", links });

  it("renders a note's Markdown with clickable links that open in a new tab, and no raw HTML", () => {
    const html = renderToStaticMarkup(
      createElement(Note, { text: "## Sources\n\n- **Talk**: https://www.youtube.com/watch?v=abc\n- [Docs](https://example.com/docs)\n\n<script>alert(1)</script>" }),
    );
    expect(html).toContain('<a href="https://www.youtube.com/watch?v=abc" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("<strong");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a 10k part of the URL dump as about 200 links", () => {
    const part = texts(readerPieces(urlDump(60_000)))[0];
    const html = renderToStaticMarkup(createElement(Note, { text: part }));
    const anchors = html.match(/<a href="https:/g)?.length ?? 0;
    expect(anchors).toBeGreaterThan(150);
    expect(anchors).toBeLessThan(400);
  });
});

describe("stepping through notes", () => {
  const order = ["a", "b", "c", "d"];
  it("shows the next note after a deleted one, else the one before, else nothing", () => {
    expect(neighbourAfterRemoval(order, "b", (id) => id !== "b")).toBe("c");
    expect(neighbourAfterRemoval(order, "b", (id) => id === "a")).toBe("a");
    expect(neighbourAfterRemoval(order, "d", (id) => id !== "d")).toBe("c");
    expect(neighbourAfterRemoval(order, "b", () => false)).toBeNull();
    // Notes deleted elsewhere in the meantime are skipped.
    expect(neighbourAfterRemoval(order, "a", (id) => id === "d")).toBe("d");
    expect(neighbourAfterRemoval(order, "zz", (id) => id === "c")).toBe("c");
  });

  it("reads a swipe left as next and right as previous, and ignores scrolls, taps and slow drags", () => {
    expect(swipeStep({ dx: -120, dy: 10, ms: 250 })).toBe(1);
    expect(swipeStep({ dx: 120, dy: -20, ms: 250 })).toBe(-1);
    expect(swipeStep({ dx: -40, dy: 0, ms: 150 })).toBe(0); // too short
    expect(swipeStep({ dx: -120, dy: 90, ms: 250 })).toBe(0); // mostly a scroll
    expect(swipeStep({ dx: -200, dy: 0, ms: 1500 })).toBe(0); // a slow drag, e.g. selecting
  });
});

describe("the reader's header", () => {
  const auto = (content: string) => content.slice(0, 60).replace(/\n/g, " ");

  it("names a note by its own title, or by its first-line heading when the Inbox named it", () => {
    // A typed or AI title stays; the body keeps all its text.
    expect(noteHeading("Rybia Paka: model", "Intro line\n\nMore")).toEqual({ title: "Rybia Paka: model", shown: true, skip: 0 });
    // The Inbox's title is the first 60 characters cut mid-word: the first heading names the note and leaves the body.
    const spec = "# Product spec: weekly review ritual for the habit app\n\nRigid feedback loop costs the leverage.";
    const h = noteHeading(auto(spec), spec);
    expect(h).toMatchObject({ title: "Product spec: weekly review ritual for the habit app", shown: true });
    expect(spec.slice(h.skip)).toBe("\nRigid feedback loop costs the leverage.");
    // A title that repeats the first heading does not show it twice.
    expect(noteHeading("OUTPUT FORMAT", "## OUTPUT FORMAT\nYou are...").skip).toBe("## OUTPUT FORMAT\n".length);
  });

  it("lets the text start the page when an auto-titled note opens with a sentence or a link list", () => {
    const dump = "Watch later + bookmarks export (September dump)\nhttps://x.com/a/status/1\nhttps://x.com/b/status/2";
    expect(noteHeading(auto(dump), dump)).toEqual({ title: "Watch later + bookmarks export (September dump)", shown: false, skip: 0 });
    const thought = "I keep saving notes on Discord out of habit, ".repeat(4);
    const t = noteHeading(auto(thought), thought);
    expect(t.shown).toBe(false);
    expect(t.title.length).toBeLessThanOrEqual(80);
    expect(noteHeading(auto("[image] https://cdn.example.com/a.png"), "[image] https://cdn.example.com/a.png").title).toBe("Image note");
    expect(noteHeading("", "")).toEqual({ title: "Untitled", shown: false, skip: 0 });
  });

  it("reads an auto-title without its Markdown marks", () => {
    expect(readerTitle("# OUTPUT FORMAT  You are an expert")).toBe("OUTPUT FORMAT You are an expert");
    expect(readerTitle("**Rybia Paka** business model")).toBe("Rybia Paka business model");
    expect(readerTitle("#2 is a number, not a heading")).toBe("#2 is a number, not a heading");
    expect(readerTitle("   ")).toBe("Untitled");
  });

  it("gives a reading time, or the size of a note too long to read through", () => {
    expect(readingLabel(300)).toBeNull();
    expect(readingLabel(1320 * 3)).toBe("~3 min read");
    expect(readingLabel(503_164)).toBe("503k characters");
    expect(compactCount(812)).toBe("812");
    expect(compactCount(1250)).toBe("1.3k");
    expect(compactCount(30_000)).toBe("30k");
  });
});
