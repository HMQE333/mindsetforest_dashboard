import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: Object.assign(() => 0, { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { keyedPillars, pillarDigit, isPillarChip, pillarIdOf } from "../components/archive/TagChips";
import { acceptChips } from "../components/archive/note-suggestions";
import { looksLikeCredential } from "../lib/credential-check";
import { parseMarkdown } from "../lib/obsidian-import";
import type { TagSuggestion } from "../lib/archive-tags";
import type { ArchiveBlock } from "../lib/archive-data";

const SRC = new URL("..", import.meta.url).pathname;
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(SRC, dir))) {
    const rel = join(dir, name);
    if (statSync(join(SRC, rel)).isDirectory()) out.push(...sources(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const PILLARS = [
  { id: "uncategorized", name: "Uncategorized" },
  { id: "mind", name: "Mind" },
  { id: "body", name: "Body" },
  { id: "expression", name: "Expression" },
  { id: "exploration", name: "Exploration" },
  { id: "people", name: "People" },
  { id: "money", name: "Money" },
  { id: "spirit", name: "Spirit" },
  { id: "order", name: "Order" },
];

describe("pillar keys (section 10)", () => {
  it("1-8 are his eight life areas; the catch-all has no key, so Order has one", () => {
    expect(keyedPillars(PILLARS).map((p) => p.id)).toEqual(["mind", "body", "expression", "exploration", "people", "money", "spirit", "order"]);
    expect(pillarDigit(PILLARS, "mind")).toBe(1);
    expect(pillarDigit(PILLARS, "order")).toBe(8);
    expect(pillarDigit(PILLARS, "uncategorized")).toBeNull();
  });

  it("the peek, the edit dialog and the pillar row all number by keyedPillars", () => {
    expect(read("components/archive/ArchiveLibrary.tsx")).toContain("keyedPillars(s.pillars)[Number(e.key) - 1]");
    expect(read("components/archive/ArchiveEditModal.tsx")).toContain("keyedPillars(allPillars)");
    expect(read("components/archive/TagChips.tsx")).toMatch(/const keyed = numbered \? keyedPillars\(pillars\) : \[\]/);
  });
});

describe("accepting suggestion chips", () => {
  const block = { id: "n1", title: "t", content: "c", tags: ["a"], pillars: ["body"] } as unknown as ArchiveBlock;
  const chip = (tag: string, kind: TagSuggestion["kind"]): TagSuggestion => ({ tag, kind, source: "neighbours", reason: "r", score: 1 });

  it("sends tags, the type and pillar chips (as pillar:<id>) to the hook in one accept", async () => {
    const accept = vi.fn(async () => ({ before: ["a"], after: ["a", "insight", "x"], pillarsBefore: ["body"], pillarsAfter: ["body", "money"] }));
    const api = { accept } as unknown as Parameters<typeof acceptChips>[0];
    const res = await acceptChips(api, block, [chip("insight", "type"), chip("x", "tag"), chip("pillar:money", "pillar")]);
    expect(accept).toHaveBeenCalledWith("n1", ["insight", "x", "pillar:money"]);
    expect(res).toEqual({ before: { tags: ["a"], pillars: ["body"] }, after: { tags: ["a", "insight", "x"], pillars: ["body", "money"] } });
  });

  it("nothing saved: null", async () => {
    const api = { accept: vi.fn(async () => null) } as unknown as Parameters<typeof acceptChips>[0];
    expect(await acceptChips(api, block, [chip("pillar:money", "pillar")])).toBeNull();
  });

  it("a pillar chip is known by its kind or its tag", () => {
    expect(isPillarChip(chip("pillar:money", "pillar"))).toBe(true);
    expect(isPillarChip({ kind: "tag", tag: "pillar:mind" })).toBe(true);
    expect(isPillarChip(chip("money", "tag"))).toBe(false);
    expect(pillarIdOf({ tag: "pillar:money" })).toBe("money");
  });
});

describe("no old path left (round 2)", () => {
  const app = sources("components").concat(sources("lib"), sources("hooks"), sources("pages"));

  it("no code strips #tags out of a note's text any more", () => {
    for (const f of app) {
      const src = read(f);
      expect(src, f).not.toMatch(/HASHTAG_REGEX/);
      expect(src, f).not.toMatch(/\.replace\(\s*\/[^/\n]*#\[[^/\n]*\/g[a-z]*\s*,\s*["'`]{2}\s*\)/);
    }
  });

  it("nothing writes pillars from a model's answer (Organize is gone; the Obsidian import keeps them his)", () => {
    for (const f of app) {
      const src = read(f);
      expect(src, f).not.toMatch(/action:\s*["']organize["']/);
      expect(src, f).not.toMatch(/pillars:\s*Array\.isArray\(ai\?\.pillars\)/);
    }
    expect(read("components/archive/ObsidianImportModal.tsx")).toMatch(/pillars: \[\],\s*directions: \[\],\s*tags: Array\.from\(new Set\(\[\.\.\.n\.tags, \.\.\.aiTags\]\)\)/);
  });

  it("the note AI functions are called only from the preview's runner (and the peek's fallback, also through the preview)", () => {
    const callers = app.filter((f) => /["']ai-archive-(expand|multi)["']/.test(read(f))).sort();
    expect(callers).toEqual(["components/archive/ArchiveAIProvider.tsx", "components/archive/ArchivePeek.tsx"]);
    // ai-archive-clean also serves the Obsidian import's keep/skip classifier (it saves no text from it).
    const clean = app.filter((f) => /["']ai-archive-clean["']/.test(read(f))).sort();
    expect(clean).toEqual(["components/archive/ArchiveAIProvider.tsx", "components/archive/ArchivePeek.tsx", "components/archive/ObsidianImportModal.tsx"]);
  });
});

describe("one credential rule for the app and the edge function", () => {
  it("is the shared function", () => {
    expect(looksLikeCredential("login: jan\nhasło: Kot!2024x")).toBe(true);
    expect(looksLikeCredential("Hasło dnia: konsekwencja")).toBe(false);
  });

  it("the embedding function skips such a note", () => {
    const fn = readFileSync(new URL("../../../../supabase/functions/ai-embed-block/index.ts", import.meta.url), "utf8");
    expect(fn).toContain('import { looksLikeCredential } from "../_shared/archive-tags.ts";');
    expect(fn.match(/if \(looksLikeCredential\(text\.slice\(0, SECRET_SCAN_CHARS\)\)\)/g)).toHaveLength(2);
    expect(fn.indexOf("looksLikeCredential(text")).toBeLessThan(fn.indexOf("await getEmbedding(text)"));
  });

  it("guards every AI action before a note leaves", () => {
    const provider = read("components/archive/ArchiveAIProvider.tsx");
    expect(provider).toMatch(/holdsSecret\(b\) \? CREDENTIAL_MESSAGE/);
    expect(provider).toMatch(/const secret = notes\.find\(holdsSecret\)/);
    expect(read("components/archive/ArchiveInbox.tsx")).toContain("if (looksLikeCredential(target.slice(0, 10_000))) { toast.error(CREDENTIAL_MESSAGE); return; }");
  });
});

describe("Obsidian import reads tags by the tag rules", () => {
  it("keeps Polish letters, folders and the text; '#2' is not a tag", () => {
    const n = parseMarkdown("a.md", "---\ntags: [Książki, '#Projekty/Blog']\n---\n# Tytuł\nCzytam #książki i #nauka/rust, krok #2.");
    expect(n.tags).toEqual(["książki", "projekty/blog", "nauka/rust"]);
    expect(n.content).toContain("#książki i #nauka/rust, krok #2.");
  });
});
