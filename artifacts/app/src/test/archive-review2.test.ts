import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Round 2 review: the rules it found wrong, each pinned by the case that
 * showed it (credentials past 10k, colours and anchors read as tags, a
 * rejection outliving a hand-filed tag, a link lost behind a longer one,
 * Undo over a later change, two types on a saved note).
 */

// folder-store reads and writes through supabase; the hook runs as a plain function.
const h = vi.hoisted(() => ({
  tags: new Map<string, string[]>(),
  pillars: new Map<string, string[]>(),
  saved: [] as { tag: string; module: string }[],
  ops: [] as string[],
  failDelete: false,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useCallback: (f: unknown) => f,
  useEffect: (f: () => void) => void f(),
  useSyncExternalStore: (_s: unknown, snap: () => unknown) => snap(),
}));
vi.mock("sonner", () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), info: vi.fn() });
  return { toast };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const savedTags = () => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain,
      eq: chain,
      in: (_col: string, vals: string[]) => {
        if (q.__delete) {
          h.ops.push(`delete ${vals.join(",")}`);
          if (h.failDelete) return Promise.resolve({ error: { message: "offline" } });
          h.saved = h.saved.filter((r) => !vals.includes(r.tag));
          return Promise.resolve({ error: null });
        }
        return Promise.resolve({ data: h.saved.map((r) => ({ ...r })), error: null });
      },
      delete: () => ((q.__delete = true), q),
      upsert: (rows: { tag: string; module: string }[]) => {
        h.ops.push(`upsert ${rows.map((r) => r.tag).join(",")}`);
        for (const r of rows) if (!h.saved.some((s) => s.tag === r.tag && s.module === r.module)) h.saved.push({ tag: r.tag, module: r.module });
        return Promise.resolve({ error: null });
      },
      insert: (row: { tag: string; module: string }) => {
        h.saved.push({ tag: row.tag, module: row.module });
        return Promise.resolve({ error: null });
      },
    });
    return q;
  };
  return {
    supabase: {
      auth: { getSession: async () => ({ data: { session: null } }) },
      from: (table: string) => {
        if (table === "user_saved_tags") return savedTags();
        if (table === "archive_blocks") {
          return {
            select: (cols: string) => ({
              in: async (_c: string, ids: string[]) => ({
                data: ids
                  .filter((id) => h.tags.has(id) || h.pillars.has(id))
                  .map((id) => (cols.includes("pillars") ? { id, pillars: h.pillars.get(id) ?? [] } : { id, tags: h.tags.get(id) ?? [] })),
                error: null,
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
});

import { toast } from "sonner";
import { checkAIResult } from "../lib/archive-ai-check";
import { embeddingsInFlight, embeddingsWritten, trackEmbedding } from "../lib/archive-embeddings";
import { looksLikeCredential } from "../lib/credential-check";
import { isTypeTag, mergeTags, normaliseTag, parseInlineTags, typeOf } from "../lib/archive-tags";
import { parseMarkdown } from "../lib/obsidian-import";
import { undoOnto, type TagChange } from "../components/archive/folder-ops";
import { applyWithUndo, useSavedFolders } from "../components/archive/folder-store";
import { keepFocus } from "../components/archive/keyboard";
import * as server from "../../../../supabase/functions/_shared/archive-tags";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

describe("credentials: all of what would be sent is read (review 2)", () => {
  /** An 11,215-character note with the password at its end, as the review built it. */
  const longNote = () => `${"Krok po kroku: konfiguracja serwera i kopii zapasowych. ".repeat(200)}\nhasło: Kot123!`.slice(-11_215);

  it("finds a password past the first 10k characters", () => {
    const note = longNote();
    expect(note.length).toBe(11_215);
    expect(looksLikeCredential(note.slice(0, 10_000))).toBe(false);
    expect(looksLikeCredential(note)).toBe(true);
    expect(looksLikeCredential(`${"Zwykła notatka o pracy. ".repeat(600)}\nlogin: jan@x.pl / Haslo2024!`)).toBe(true);
  });

  it("reads 60k characters in a few milliseconds, whatever their shape (the old rules took seconds)", () => {
    const shapes = {
      aaaa: "a".repeat(60_000),
      dots: "abc.".repeat(15_000),
      plus: "a+".repeat(30_000),
      equals: "a=".repeat(30_000),
      dashes: "a-".repeat(30_000),
      dataUri: ("data:image/png;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg".repeat(600)).slice(0, 60_000),
      schemes: "a.b.c://".repeat(7_500),
    };
    for (const [name, text] of Object.entries(shapes)) {
      const t0 = performance.now();
      looksLikeCredential(text);
      expect(performance.now() - t0, name).toBeLessThan(150);
    }
  });

  it("the long-run rule finds exactly what its old regex found", () => {
    const OLD = /(?<![\w/.-])(?=[A-Za-z0-9_+/=-]*\d)(?=[A-Za-z0-9_+/=-]*[A-Za-z])[A-Za-z0-9_+/=-]{32,}(?![\w/.-])/;
    const OLD_SCHEME = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i;
    const NEW_SCHEME = /:\/\/(?<=\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/i;
    const OLD_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*(?:[:|/;,]|\s)\s*(?=\S*\d)(?=\S*\p{L})\S{6,}/u;
    const NEW_EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+\s*(?:[:|/;,]|\s)\s*(?=\S*\d)(?=\S*\p{L})\S{6,}/u;
    const alphabet = ["a", "B", "1", "+", "=", "-", "/", ".", "_", " ", "\n", ":", "@", "9", "ą", "x.pl", "://", "ftp"];
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let positives = 0;
    for (let i = 0; i < 20_000; i++) {
      let s = "";
      const len = 10 + Math.floor(rnd() * 70);
      const narrow = rnd() < 0.7;
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rnd() * (narrow ? 9 : alphabet.length))];
      const old = OLD.test(s);
      positives += +old;
      expect(server.hasLongRun(s), JSON.stringify(s)).toBe(old);
      expect(NEW_SCHEME.test(s), JSON.stringify(s)).toBe(OLD_SCHEME.test(s));
      expect(NEW_EMAIL.test(s), JSON.stringify(s)).toBe(OLD_EMAIL.test(s));
    }
    expect(positives).toBeGreaterThan(100);
    const src = read("../../../../supabase/functions/_shared/archive-tags.ts");
    expect(src).toContain(NEW_SCHEME.source);
    expect(src).toContain(NEW_EMAIL.source);
  });

  it("ai-archive-clean, -expand and -multi refuse such a text (422) before the model", () => {
    for (const fn of ["ai-archive-clean", "ai-archive-expand", "ai-archive-multi"]) {
      const src = read(`../../../../supabase/functions/${fn}/index.ts`);
      expect(src, fn).toContain('import { looksLikeCredential } from "../_shared/archive-tags.ts";');
      const check = src.indexOf("looksLikeCredential(");
      expect(check, fn).toBeGreaterThan(0);
      expect(src.slice(check, check + 400), fn).toMatch(/CREDENTIAL_REFUSAL[^]*?422/);
      expect(check, fn).toBeLessThan(src.indexOf("https://openrouter.ai/api/v1/chat/completions"));
      expect(src.slice(check, check + 120), fn).not.toContain(".slice(");
    }
    // The app says the same words.
    expect(read("../lib/credential-check.ts")).toContain("CREDENTIAL_REFUSAL as CREDENTIAL_MESSAGE");
  });
});

describe("inline #tags are labels, not code, anchors or colours (review 2)", () => {
  it("skips Markdown anchors, Obsidian heading links and {#ids}", () => {
    expect(parseInlineTags("- [Intro](#intro)\n- [Setup](#setup-guide)")).toEqual([]);
    expect(parseInlineTags("[[#Heading]] and [[Note#Part]]")).toEqual([]);
    expect(parseInlineTags("## Title {#ref}")).toEqual([]);
    // A tag in brackets of his own is still a tag.
    expect(parseInlineTags("(#nauka) [#książki] i #projekty/RybiaPaka/")).toEqual(["nauka", "książki", "projekty/rybiapaka"]);
  });

  it("skips fenced code and inline code", () => {
    expect(parseInlineTags("```c\n#include <stdio.h>\n#define MAX 10\n```\n#real")).toEqual(["real"]);
    expect(parseInlineTags("~~~\n#x\n~~~\nuse `#notatag` and #tak")).toEqual(["tak"]);
    expect(parseInlineTags("````\n```\n#inner\n````\n#after")).toEqual(["after"]);
  });

  it("skips colours (six or eight hex digits with a digit), keeps word-like tags", () => {
    expect(parseInlineTags("Kolory: #FF5733, #1e1e1e80 i #fff")).toEqual(["fff"]);
    expect(parseInlineTags("#cafe #deadbeef #2fa #b2b")).toEqual(["cafe", "deadbeef", "2fa", "b2b"]);
  });

  it("keeps C# and C++ apart instead of both becoming 'c'", () => {
    expect(normaliseTag("C#")).toBe("csharp");
    expect(normaliseTag("C++")).toBe("cpp");
    expect(normaliseTag("F#")).toBe("fsharp");
    expect(normaliseTag("C# basics")).toBe("csharp-basics");
    expect(normaliseTag("projekty/c#")).toBe("projekty/csharp");
    expect(normaliseTag("a#b")).toBe("ab");
    expect(parseInlineTags("Uczę się #C# i #C++, potem #c#x")).toEqual(["csharp", "cpp", "c"]);
    expect(server.normaliseTag("C++")).toBe("cpp");
  });
});

describe("a note carries one type, on every save path (review 2)", () => {
  it("two #types written: the last one wins", () => {
    const tags = mergeTags([], parseInlineTags("Zadzwonić do Ani w sprawie oferty? #task #question"));
    expect(tags).toEqual(["question"]);
    expect(mergeTags(["quick-capture"], parseInlineTags("Kupić #task #capture #dom"))).toEqual(["quick-capture", "capture", "dom"]);
  });

  it("the Obsidian import keeps one type (frontmatter, then the text)", () => {
    const n = parseMarkdown("a.md", "---\ntags: [task, nauka]\n---\nCzy to działa? #question #rust");
    expect(n.tags.filter(isTypeTag)).toEqual(["question"]);
    expect(n.tags).toEqual(["nauka", "question", "rust"]);
    expect(typeOf(n.tags)).toBe("question");
  });

  it("every save path goes through the rule; AI Tag appends no type", () => {
    expect(read("../components/archive/ArchiveInbox.tsx")).toContain("tags: mergeTags([], parseInlineTags(content)),");
    expect(read("../components/archive/ArchiveInbox.tsx")).toMatch(/\.filter\(\(t, idx, arr\) => t && !isTypeTag\(t\) && !already\.has\(t\)/);
    expect(read("../components/archive/QuickCaptureModal.tsx")).toContain('tags: mergeTags(["quick-capture"], parseInlineTags(`${title}\\n${content}`)),');
    expect(read("../lib/obsidian-import.ts")).toContain("const tags = mergeTags([], [...tagsFromFrontmatter(fm), ...inlineTags(body)]);");
  });
});

describe("learning: an answer counts only while the note agrees with it (review 2)", () => {
  const n = (id: string, similarity: number, tags: string[], pillars: string[] = []) => ({ id, similarity, tags, pillars });

  it("a rejection on a note he later filed there by hand no longer counts against the tag", () => {
    const feedback = server.latestFeedback([
      { block_id: "x", tag: "książki", accepted: false, created_at: "2026-10-01" },
      { block_id: "z", tag: "książki", accepted: false, created_at: "2026-10-01" },
    ]);
    const ev = server.scoreNeighbours([n("x", 0.8, ["książki"]), n("z", 0.75, ["książki"])], feedback);
    expect(ev.tags.get("książki")!.score).toBeCloseTo(1.55);
    const out = server.combineSuggestions({
      current: [],
      ruleType: null,
      evidence: ev,
      rejectedHere: new Set<string>(),
      ai: { type: "insight", tags: ["książki"] },
      vocabulary: new Map([["książki", 2]]),
    });
    expect(out.map((s) => s.tag)).toContain("książki");
  });

  it("a rejection on a note without the tag still holds it back; a yes to a tag since removed adds nothing", () => {
    const feedback = server.latestFeedback([
      { block_id: "a", tag: "marketing", accepted: false, created_at: "2026-10-01" },
      { block_id: "a", tag: "stare", accepted: true, created_at: "2026-10-01" },
      { block_id: "a", tag: "rybiapaka", accepted: true, created_at: "2026-10-01" },
    ]);
    const ev = server.scoreNeighbours([n("a", 0.8, ["rybiapaka"])], feedback);
    expect(ev.tags.get("marketing")!.score).toBeCloseTo(-server.REJECT_PENALTY * 0.8);
    expect(ev.tags.has("stare")).toBe(false);
    expect(ev.tags.get("rybiapaka")!.score).toBeCloseTo(0.8 * (1 + server.ACCEPT_BOOST));
  });

  it("pillars follow the same check", () => {
    const feedback = server.latestFeedback([
      { block_id: "a", tag: "pillar:mind", accepted: false, created_at: "2026-10-01" },
      { block_id: "a", tag: "pillar:money", accepted: false, created_at: "2026-10-01" },
    ]);
    const ev = server.scoreNeighbours([n("a", 0.8, [], ["mind"])], feedback);
    expect(ev.pillars!.get("mind")!.score).toBeCloseTo(0.8);
    expect(ev.pillars!.get("money")!.score).toBeCloseTo(-server.REJECT_PENALTY * 0.8);
  });
});

describe("the preview's link check compares whole links (review 2)", () => {
  it("reports a link dropped while a longer one starting with it stays", () => {
    const w = checkAIResult("shorten", "Strona: https://rybiapaka.pl, cennik: https://rybiapaka.pl/cennik 120 zł", "Cennik: https://rybiapaka.pl/cennik 120 zł");
    expect(w).toEqual([expect.objectContaining({ kind: "links", items: ["https://rybiapaka.pl"] })]);
    expect(checkAIResult("shorten", "see https://x.com and https://x.com/page 12", "see https://x.com/page 12").map((x) => x.kind)).toEqual(["links"]);
  });

  it("a link kept inside Markdown or after a full stop is kept", () => {
    expect(checkAIResult("shorten", "see https://x.com. And more words here, 12", "**https://x.com** 12")).toEqual([]);
    expect(checkAIResult("shorten", "see [x](https://x.com) and more words here 12", "see https://x.com, 12")).toEqual([]);
  });
});

describe("Undo takes the change back, not the snapshot (review 2)", () => {
  it("undoOnto: unchanged since, the old list exactly; changed since, the later change stays", () => {
    const c = { before: ["projekty"], after: ["projekty", "nauka"] };
    expect(undoOnto(["projekty", "nauka"], c)).toEqual(["projekty"]);
    expect(undoOnto(["projekty", "nauka", "insight", "książki"], c)).toEqual(["projekty", "insight", "książki"]);
    // A move: out of a, into b; Undo puts a back and takes b off, a tag added since stays.
    expect(undoOnto(["b", "x"], { before: ["a"], after: ["b"] })).toEqual(["x", "a"]);
    // A rename that merged two tags into one.
    expect(undoOnto(["b/x"], { before: ["a/x", "b/x"], after: ["b/x"] })).toEqual(["a/x", "b/x"]);
  });

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
    h.tags.clear();
    h.ops.length = 0;
    h.failDelete = false;
  });

  /** The Undo of the last success toast. */
  const lastUndo = () => (vi.mocked(toast.success).mock.calls.at(-1)?.[1] as { action: { onClick: () => void } }).action.onClick;

  it("a drop's Undo keeps a suggestion accepted on the note meanwhile", async () => {
    const list: TagChange[] = [{ id: "n1", before: [], after: ["nauka"] }];
    const updateBlock = vi.fn(async (id: string, u: { tags?: string[] }) => {
      if (u.tags) h.tags.set(id, u.tags);
      return true;
    });
    expect(await applyWithUndo(list, updateBlock, (k) => `Added ${k}`)).toBe(1);
    h.tags.set("n1", ["nauka", "insight", "książki"]); // accepted in the peek after the drop
    lastUndo()();
    await vi.waitFor(() => expect(h.tags.get("n1")).toEqual(["insight", "książki"]));
  });

  it("when no note could be saved: one error, nothing else changes (no rename of the saved folder)", async () => {
    const updateBlock = vi.fn(async (_id: string, _u: unknown, opts?: { quiet?: boolean }) => {
      expect(opts?.quiet).toBe(true);
      return false;
    });
    const follow = vi.fn(async () => undefined);
    const list: TagChange[] = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, before: ["nauka"], after: ["studia"] }));
    expect(await applyWithUndo(list, updateBlock, (k) => `Renamed on ${k}`, follow)).toBe(0);
    expect(follow).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0][0]).toBe("None of the 40 notes could be saved");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("a rename into an existing folder: Undo moves back only the rows it moved", async () => {
    h.saved = [
      { tag: "a", module: "archive" },
      { tag: "a/x", module: "archive" },
      { tag: "b", module: "archive" },
    ];
    const saved = useSavedFolders();
    await vi.waitFor(() => expect(useSavedFolders().folders).toEqual(["a", "a/x", "b"]));
    const move = await saved.rename("a", "b");
    expect(move).not.toBeNull();
    expect(useSavedFolders().folders).toEqual(["b", "b/x"]);
    expect(move!.added.map((r) => r.tag)).toEqual(["b/x"]); // "b" was there already
    await saved.restore(move);
    expect(useSavedFolders().folders).toEqual(["a", "a/x", "b"]);
    expect(h.saved.map((r) => r.tag).sort()).toEqual(["a", "a/x", "b"]);
  });
});

describe("small seams of the review's UX fixes", () => {
  it("keepFocus stops a primary-button press from moving the focus, nothing else", () => {
    const e = { button: 0, preventDefault: vi.fn() };
    keepFocus(e);
    expect(e.preventDefault).toHaveBeenCalled();
    const right = { button: 2, preventDefault: vi.fn() };
    keepFocus(right);
    expect(right.preventDefault).not.toHaveBeenCalled();
  });

  it("a suggestion request waits for the page's own embedding of a just-saved note, at most a while", async () => {
    vi.useFakeTimers();
    try {
      let written!: () => void;
      trackEmbedding("n1", new Promise<void>((r) => (written = r)));
      let done = false;
      void embeddingsWritten(["n1", "n2"]).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(100);
      expect(done).toBe(false);
      written();
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(true);
      expect(embeddingsInFlight()).toBe(0);
      // One that never ends does not hold the chips back for ever.
      trackEmbedding("n3", new Promise(() => {}));
      let late = false;
      void embeddingsWritten(["n3"], 500).then(() => (late = true));
      await vi.advanceTimersByTimeAsync(510);
      expect(late).toBe(true);
    } finally {
      vi.useRealTimers();
    }
    expect(read("../hooks/useTagSuggestions.ts")).toMatch(/await embeddingsWritten\(ids\);\s*const \{ data, error \} = await supabase\.functions\.invoke\("ai-suggest-tags"/);
  });

  it("the tag queue: Enter never skips a note, the first note is asked alone, Back and Skip sit in the header", () => {
    const q = read("../components/archive/ArchiveTagQueue.tsx");
    expect(q).toContain("if (!block || saving || !shown) return;");
    expect(q).toContain("if (picked.length === 0) return;");
    expect(q).toContain("asked.current + (asked.current === 0 ? 1 : SUGGEST_BATCH)");
    const header = q.slice(q.indexOf('className="sticky top-0'), q.indexOf("</DialogPrimitive.Close>"));
    expect(header).toContain("Skip <ArrowRight");
    expect(header).toContain("onMouseDown={keepFocus}");
    expect(q).toMatch(/aria-live="polite">\s*\{finished \|\| !block \? "That was the last one\." : `Note \$\{at \+ 1\} of \$\{order\.length\}: \$\{headingTitle\}`\}/);
  });
});
