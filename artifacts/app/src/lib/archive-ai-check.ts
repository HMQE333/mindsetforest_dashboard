/**
 * What an AI result did to his text, for the preview (loaded with it, not
 * with the Archive): a word-level diff and the checks of the borders that can
 * be tested: every link, number and #tag of the original still there (Shorten,
 * Clean, Merge, own prompt), his own words untouched (Expand), Shorten not
 * longer, Clean not rewriting.
 *
 * Pure: no React, no Supabase.
 */
import { LINK_REGEX } from "./archive-data";
import { parseInlineTags } from "./archive-tags";
import type { AIAction } from "./archive-ai";

// ---- word diff ----

export type DiffKind = "same" | "add" | "del";
export interface DiffPart {
  kind: DiffKind;
  text: string;
}

/** Words (letters, digits, _), runs of white space, runs of other characters. */
const TOKEN = /[\p{L}\p{M}\p{N}_]+|\s+|[^\p{L}\p{M}\p{N}_\s]+/gu;

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

type Op = [DiffKind, number[]];

/**
 * Token-level diff (Myers' middle-snake bisection, after diff-match-patch).
 * Works on token ids; past the deadline a stretch is reported as removed and
 * added whole instead of searched further, so a huge rewrite stays fast.
 */
function diffIds(a: number[], b: number[], deadline: number): Op[] {
  if (a.length === b.length && a.every((t, i) => t === b[i])) return a.length ? [["same", a]] : [];
  let pre = 0;
  const minLen = Math.min(a.length, b.length);
  while (pre < minLen && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < minLen - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const head = a.slice(0, pre);
  const tail = a.slice(a.length - suf);
  const midA = a.slice(pre, a.length - suf);
  const midB = b.slice(pre, b.length - suf);
  const out: Op[] = [];
  if (head.length) out.push(["same", head]);
  out.push(...diffMiddle(midA, midB, deadline));
  if (tail.length) out.push(["same", tail]);
  return out;
}

function diffMiddle(a: number[], b: number[], deadline: number): Op[] {
  if (!a.length) return b.length ? [["add", b]] : [];
  if (!b.length) return [["del", a]];
  if (a.length === 1 || b.length === 1) {
    // One token on a side: keep it as "same" if the other side has it.
    const [short, long, shortIsA] = a.length === 1 ? [a, b, true] : [b, a, false];
    const at = long.indexOf(short[0]);
    if (at === -1) return [["del", a], ["add", b]];
    const edge: DiffKind = shortIsA ? "add" : "del";
    const out: Op[] = [];
    if (at > 0) out.push([edge, long.slice(0, at)]);
    out.push(["same", short]);
    if (at < long.length - 1) out.push([edge, long.slice(at + 1)]);
    return out;
  }
  return bisect(a, b, deadline);
}

function bisect(a: number[], b: number[], deadline: number): Op[] {
  const n = a.length;
  const m = b.length;
  const maxD = Math.ceil((n + m) / 2);
  const off = maxD;
  const size = 2 * maxD + 2;
  const v1 = new Int32Array(size).fill(-1);
  const v2 = new Int32Array(size).fill(-1);
  v1[off + 1] = 0;
  v2[off + 1] = 0;
  const delta = n - m;
  const front = delta % 2 !== 0;
  let k1start = 0, k1end = 0, k2start = 0, k2end = 0;
  for (let d = 0; d < maxD; d++) {
    if (Date.now() > deadline) break;
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      const k1o = off + k1;
      let x1 = k1 === -d || (k1 !== d && v1[k1o - 1] < v1[k1o + 1]) ? v1[k1o + 1] : v1[k1o - 1] + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[x1] === b[y1]) { x1++; y1++; }
      v1[k1o] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const k2o = off + delta - k1;
        if (k2o >= 0 && k2o < size && v2[k2o] !== -1 && x1 >= n - v2[k2o]) return split(a, b, x1, y1, deadline);
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      const k2o = off + k2;
      let x2 = k2 === -d || (k2 !== d && v2[k2o - 1] < v2[k2o + 1]) ? v2[k2o + 1] : v2[k2o - 1] + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[n - x2 - 1] === b[m - y2 - 1]) { x2++; y2++; }
      v2[k2o] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const k1o = off + delta - k2;
        if (k1o >= 0 && k1o < size && v1[k1o] !== -1) {
          const x1 = v1[k1o];
          const y1 = off + x1 - k1o;
          if (x1 >= n - x2) return split(a, b, x1, y1, deadline);
        }
      }
    }
  }
  return [["del", a], ["add", b]];
}

function split(a: number[], b: number[], x: number, y: number, deadline: number): Op[] {
  return [...diffIds(a.slice(0, x), b.slice(0, y), deadline), ...diffIds(a.slice(x), b.slice(y), deadline)];
}

/**
 * What changed from `before` to `after`, word by word: parts in order, each
 * "same", "del" (only in before) or "add" (only in after). Joining the same
 * and del parts gives `before`, the same and add parts give `after`. A change
 * separated from the next one by nothing but white space reads as one change.
 */
export function wordDiff(before: string, after: string, opts: { deadlineMs?: number } = {}): DiffPart[] {
  const ids = new Map<string, number>();
  const words: string[] = [];
  const idOf = (t: string) => {
    let id = ids.get(t);
    if (id === undefined) {
      id = words.length;
      ids.set(t, id);
      words.push(t);
    }
    return id;
  };
  const a = tokenize(before).map(idOf);
  const b = tokenize(after).map(idOf);
  const ops = diffIds(a, b, Date.now() + (opts.deadlineMs ?? 250));

  // Back to text, folding white space caught between two changes into the change.
  const raw: DiffPart[] = ops.map(([kind, toks]) => ({ kind, text: toks.map((t) => words[t]).join("") }));
  const folded: DiffPart[] = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (p.kind === "same" && /^\s+$/.test(p.text) && i > 0 && i < raw.length - 1 && raw[i - 1].kind !== "same" && raw[i + 1].kind !== "same") {
      folded.push({ kind: "del", text: p.text }, { kind: "add", text: p.text });
    } else folded.push(p);
  }
  // A run of changes: everything removed first, then everything added.
  const out: DiffPart[] = [];
  let del = "";
  let add = "";
  const flush = () => {
    if (del) out.push({ kind: "del", text: del });
    if (add) out.push({ kind: "add", text: add });
    del = add = "";
  };
  for (const p of folded) {
    if (p.kind === "del") del += p.text;
    else if (p.kind === "add") add += p.text;
    else {
      flush();
      const last = out[out.length - 1];
      if (last?.kind === "same") last.text += p.text;
      else out.push({ ...p });
    }
  }
  flush();
  return out;
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu;

export function countWords(text: string): number {
  return (text.match(WORD) ?? []).length;
}

/** Words removed and added across a diff. */
export function diffCounts(parts: readonly DiffPart[]): { removed: number; added: number; changes: number } {
  let removed = 0;
  let added = 0;
  let changes = 0;
  let inChange = false;
  for (const p of parts) {
    if (p.kind === "same") { inChange = false; continue; }
    if (!inChange) changes++;
    inChange = true;
    if (p.kind === "del") removed += countWords(p.text);
    else added += countWords(p.text);
  }
  return { removed, added, changes };
}

// ---- checks ----

export type AIWarningKind = "links" | "numbers" | "tags" | "changed" | "longer" | "removed" | "empty" | "nothing";
export interface AIWarning {
  kind: AIWarningKind;
  message: string;
  /** The links, numbers or tags concerned. */
  items?: string[];
}

/** Numbers as written ("19.10.2026", "14:30", "3,5", "2"), outside links. */
const NUMBER = /\d+(?:[.,:/-]\d+)*/g;

/**
 * The links in a text, each once, as compared: without a sentence's trailing
 * punctuation or closing bracket ("…/cennik)." is "…/cennik"). Compared as
 * whole links, so a link dropped while a longer one starting with it stays
 * ("https://x.pl" next to "https://x.pl/cennik") is still missed.
 */
function linksOf(text: string): string[] {
  const all = text.match(new RegExp(LINK_REGEX.source, "g")) ?? [];
  // Markdown's emphasis around a link ("**https://x.pl**") is not part of it either.
  return [...new Set(all.map((u) => u.replace(/[)\].,;:!?'"’”»*_~]+$/u, "")))];
}

function numbersOf(text: string): string[] {
  const outside = text.replace(new RegExp(LINK_REGEX.source, "g"), " ");
  return [...new Set(outside.match(NUMBER) ?? [])];
}

const quoteList = (items: string[], max = 4) =>
  items.slice(0, max).map((s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s)).join(", ") + (items.length > max ? ` and ${items.length - max} more` : "");

/** Every word and sign of `original`, in order, is in `proposed` (white space aside): nothing of it was changed. */
export function keepsAllOf(original: string, proposed: string): boolean {
  const a = tokenize(original).filter((t) => !/^\s+$/.test(t));
  const b = tokenize(proposed).filter((t) => !/^\s+$/.test(t));
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (b[j] === a[i]) i++;
  return i === a.length;
}

/**
 * The borders the client can test, as warnings for the preview: every link,
 * number and #tag of the original still in the result (Shorten, Clean, Merge,
 * own prompt); his own words untouched (Expand); Shorten not longer, Clean not
 * dropping words, an empty or unchanged answer. `original` for several notes
 * is their texts joined. Pass the diff when it is already computed.
 */
export function checkAIResult(action: AIAction, original: string, proposed: string, parts?: readonly DiffPart[]): AIWarning[] {
  const out: AIWarning[] = [];
  if (!proposed.trim()) {
    return [{ kind: "empty", message: "The AI returned an empty text." }];
  }
  const diff = () => parts ?? wordDiff(original, proposed);
  if (action === "expand") {
    if (!keepsAllOf(original, proposed)) {
      const removed = Math.max(1, diffCounts(diff()).removed);
      out.push({ kind: "changed", message: `AI changed your own text (${removed} word${removed === 1 ? "" : "s"} removed or altered). Expand should only add marked blocks.` });
    }
    if (proposed.trim() === original.trim()) out.push({ kind: "nothing", message: "AI found nothing to add." });
    return out;
  }
  // A summary keeps what matters, not everything; its links are still checked.
  const kept = new Set(linksOf(proposed));
  const missingLinks = linksOf(original).filter((u) => !kept.has(u));
  if (missingLinks.length) {
    out.push({ kind: "links", message: `${missingLinks.length} link${missingLinks.length === 1 ? " is" : "s are"} missing: ${quoteList(missingLinks, 3)}`, items: missingLinks });
  }
  if (action !== "summarize" && action !== "together") {
    const have = new Set(numbersOf(proposed));
    const missingNumbers = numbersOf(original).filter((n) => !have.has(n));
    if (missingNumbers.length) {
      out.push({ kind: "numbers", message: `${missingNumbers.length} number${missingNumbers.length === 1 ? " is" : "s are"} missing or changed: ${quoteList(missingNumbers, 6)}`, items: missingNumbers });
    }
    const tagsAfter = new Set(parseInlineTags(proposed));
    const missingTags = parseInlineTags(original).filter((t) => !tagsAfter.has(t));
    if (missingTags.length) {
      out.push({ kind: "tags", message: `#tags removed from the text: ${missingTags.map((t) => `#${t}`).join(" ")}`, items: missingTags });
    }
  }
  if (action === "shorten" && proposed.length >= original.length && original.length > 0) {
    out.push({ kind: "longer", message: "The result is not shorter than the original." });
  }
  if (action === "clean" && !keepsAllOf(original, proposed)) {
    const { removed } = diffCounts(diff());
    const total = countWords(original);
    // Typos change a word here and there; more than that is a rewrite.
    if (removed > Math.max(3, total * 0.15)) {
      out.push({ kind: "removed", message: `${removed} of ${total} words were changed or removed. Clean should only fix typos and spacing.` });
    }
  }
  if (action !== "merge" && action !== "summarize" && action !== "together" && proposed === original) {
    out.push({ kind: "nothing", message: "Nothing changed." });
  }
  return out;
}

/** A warning that something of his would be lost: the preview then defaults to Save as new. */
export function warnsOfLoss(warnings: readonly AIWarning[]): boolean {
  return warnings.some((w) => w.kind === "links" || w.kind === "numbers" || w.kind === "tags" || w.kind === "changed" || w.kind === "removed" || w.kind === "empty");
}

/** Before -> after, as the preview's header states it. */
export function lengthLine(before: string, after: string): string {
  const w0 = countWords(before);
  const w1 = countWords(after);
  const pct = w0 > 0 ? Math.round(((w1 - w0) / w0) * 100) : 0;
  const sign = pct > 0 ? "+" : "";
  return `${w0.toLocaleString("en-US")} → ${w1.toLocaleString("en-US")} words (${sign}${pct}%) · ${before.length.toLocaleString("en-US")} → ${after.length.toLocaleString("en-US")} characters`;
}
