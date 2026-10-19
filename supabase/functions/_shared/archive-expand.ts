/**
 * Expand without touching his words: the model only names where an
 * explanation goes (after paragraph N) and what it says; the note is put
 * together here, so every character of his text stays as it was and each
 * addition is a marked block ("> 💡 AI: …").
 *
 * No imports: the app's tests load this file directly
 * (artifacts/app/src/test/archive-expand.test.ts).
 */

export interface ExpandAddition {
  /** 1-based paragraph number the block follows. */
  after: number;
  text: string;
}

export const MAX_ADDITIONS = 6;
const MAX_ADDITION_CHARS = 1_200;
const FENCE = /^\s*(```|~~~)/;

/**
 * The note's paragraphs as [first line, last line] (0-based, inclusive): runs
 * of non-blank lines, a fenced code block kept whole even across blank lines.
 */
export function paragraphRanges(content: string): [number, number][] {
  const lines = content.split("\n");
  const out: [number, number][] = [];
  let start = -1;
  let fence = false;
  lines.forEach((line, i) => {
    const blank = line.trim() === "";
    if (FENCE.test(line)) fence = !fence;
    if (blank && !fence) {
      if (start !== -1) out.push([start, i - 1]);
      start = -1;
    } else if (start === -1) start = i;
  });
  if (start !== -1) out.push([start, lines.length - 1]);
  return out;
}

/** The note as the model sees it: "[1] first paragraph", "[2] …". */
export function numberedParagraphs(content: string): string {
  const lines = content.split("\n");
  return paragraphRanges(content)
    .map(([a, b], i) => `[${i + 1}] ${lines.slice(a, b + 1).join("\n")}`)
    .join("\n\n");
}

/** One addition as Markdown quote lines, marked as the AI's. */
export function aiBlockLines(text: string): string[] {
  const clean = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*>\s?/, "").trimEnd())
    .join("\n")
    .trim()
    .replace(/^💡\s*/u, "")
    .replace(/^AI\s*:\s*/i, "")
    .slice(0, MAX_ADDITION_CHARS);
  if (!clean) return [];
  return clean.split("\n").map((l, i) => (i === 0 ? `> 💡 AI: ${l}` : l ? `> ${l}` : ">"));
}

/** The additions the model returned, checked: numbers in range, text present, at most MAX_ADDITIONS. */
export function validAdditions(raw: unknown, paragraphCount: number): ExpandAddition[] {
  if (!Array.isArray(raw) || paragraphCount < 1) return [];
  const out: ExpandAddition[] = [];
  for (const item of raw) {
    const r = item as { after?: unknown; text?: unknown };
    const n = Math.round(Number(r?.after));
    const text = typeof r?.text === "string" ? r.text : "";
    if (!text.trim()) continue;
    out.push({ after: Number.isFinite(n) ? Math.min(Math.max(n, 1), paragraphCount) : paragraphCount, text });
    if (out.length >= MAX_ADDITIONS) break;
  }
  return out;
}

/**
 * The note with the additions inserted after their paragraphs: whole lines
 * put between his lines, a blank line before each block, so his text is a
 * subsequence of the result character for character.
 */
export function insertAdditions(content: string, additions: readonly ExpandAddition[]): string {
  const ranges = paragraphRanges(content);
  if (!ranges.length || !additions.length) return content;
  const lines = content.split("\n");
  const after = new Map<number, string[]>();
  for (const a of additions) {
    const idx = Math.min(Math.max(Math.round(a.after), 1), ranges.length) - 1;
    const end = ranges[idx][1];
    const block = aiBlockLines(a.text);
    if (!block.length) continue;
    after.set(end, [...(after.get(end) ?? []), "", ...block]);
  }
  const out: string[] = [];
  lines.forEach((line, i) => {
    out.push(line);
    const extra = after.get(i);
    if (extra) {
      out.push(...extra);
      // Keep the block apart from a paragraph that follows straight after.
      if (i + 1 < lines.length && lines[i + 1].trim() !== "") out.push("");
    }
  });
  return out.join("\n");
}
