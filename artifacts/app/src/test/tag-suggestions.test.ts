import { beforeEach, describe, expect, it, vi } from "vitest";

// The hook is called as a plain function: state setters are no-ops, callbacks are the functions.
vi.mock("react", () => ({
  useState: (v: unknown) => [typeof v === "function" ? (v as () => unknown)() : v, () => {}],
  useCallback: (f: unknown) => f,
  useRef: (v: unknown) => ({ current: v }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  tags: new Map<string, string[]>(),
  inserts: [] as unknown[][],
  insertError: null as null | { message: string },
  updateBlock: vi.fn(),
}));

vi.mock("@/hooks/useArchiveState", () => ({ useArchiveState: () => ({ updateBlock: h.updateBlock }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: h.invoke },
    from: (table: string) => {
      if (table === "archive_tag_feedback") {
        return { insert: async (rows: unknown[]) => { h.inserts.push(rows); return { error: h.insertError }; } };
      }
      if (table === "archive_blocks") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => (h.tags.has(id) ? { data: { tags: h.tags.get(id) }, error: null } : { data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { SUGGEST_BATCH, useTagSuggestions } from "../hooks/useTagSuggestions";
import type { TagSuggestion } from "../lib/archive-tags";

const chip = (tag: string, kind: "type" | "tag", source: TagSuggestion["source"] = "neighbours"): TagSuggestion => ({ tag, kind, source, reason: "r", score: 1 });
let seq = 0;
const freshId = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, "0")}`;

/** The function answering every asked id with `make(id)`. */
function answerWith(make: (id: string) => TagSuggestion[], extra: Record<string, unknown> = {}) {
  h.invoke.mockImplementation(async (_name: string, { body }: { body: { blockIds: string[] } }) => ({
    data: { suggestions: Object.fromEntries(body.blockIds.map((id) => [id, make(id)])), ai: "used", ...extra },
    error: null,
  }));
}

beforeEach(() => {
  h.invoke.mockReset();
  h.updateBlock.mockReset();
  h.updateBlock.mockResolvedValue(true);
  h.tags.clear();
  h.inserts.length = 0;
  h.insertError = null;
});

describe("useTagSuggestions.suggest", () => {
  it("asks in batches of 20, one batch at a time, in mode learn", async () => {
    const ids = Array.from({ length: 45 }, freshId);
    let running = 0;
    let most = 0;
    h.invoke.mockImplementation(async (name: string, { body }: { body: { mode: string; blockIds: string[] } }) => {
      expect(name).toBe("ai-suggest-tags");
      expect(body.mode).toBe("learn");
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { data: { suggestions: Object.fromEntries(body.blockIds.map((id) => [id, [chip("x", "tag")]])), ai: "used" }, error: null };
    });
    const out = await useTagSuggestions().suggest(ids);
    expect(h.invoke.mock.calls.map((c) => c[1].body.blockIds.length)).toEqual([SUGGEST_BATCH, SUGGEST_BATCH, 5]);
    expect(most).toBe(1);
    expect(out.size).toBe(45);
    expect(out.get(ids[44])).toEqual([chip("x", "tag")]);
  });

  it("keeps answers for the session and shares a question already in flight", async () => {
    const a = freshId();
    const b = freshId();
    answerWith((id) => [chip(id === a ? "rybiapaka" : "biznes", "tag")]);
    const hook = useTagSuggestions();
    const [first, second] = await Promise.all([hook.suggest([a]), useTagSuggestions().suggest([a, b])]);
    expect(first.get(a)?.[0].tag).toBe("rybiapaka");
    expect(second.get(a)?.[0].tag).toBe("rybiapaka");
    expect(second.get(b)?.[0].tag).toBe("biznes");
    const asked = h.invoke.mock.calls.flatMap((c) => c[1].body.blockIds);
    expect(asked.filter((id: string) => id === a)).toHaveLength(1);
    h.invoke.mockClear();
    expect((await hook.suggest([a, b])).get(b)?.[0].tag).toBe("biznes");
    expect(h.invoke).not.toHaveBeenCalled();
    expect(hook.peek(a)?.[0].tag).toBe("rybiapaka");
    await hook.suggest([a], { fresh: true });
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("a note the function did not answer for gets no chips", async () => {
    const a = freshId();
    h.invoke.mockResolvedValue({ data: { suggestions: {}, ai: "not-asked" }, error: null });
    expect((await useTagSuggestions().suggest([a])).get(a)).toEqual([]);
  });

  it("fails with the function's own message, not the generic one", async () => {
    const a = freshId();
    h.invoke.mockResolvedValue({
      data: null,
      error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Miesięczny limit AI dla tagów jest wyczerpany" }) } },
    });
    await expect(useTagSuggestions().suggest([a])).rejects.toThrow("Miesięczny limit AI dla tagów jest wyczerpany");
    // Not held: asked again next time.
    answerWith(() => [chip("x", "tag")]);
    expect((await useTagSuggestions().suggest([a])).get(a)).toEqual([chip("x", "tag")]);
  });
});

describe("useTagSuggestions.accept / reject / forget", () => {
  it("replaces the type, adds the rest, and records accepted and left-out chips", async () => {
    const a = freshId();
    h.tags.set(a, ["insight", "stary"]);
    answerWith(() => [chip("framework", "type", "type-rule"), chip("rybiapaka", "tag"), chip("marketing", "tag", "ai")]);
    const hook = useTagSuggestions();
    await hook.suggest([a]);
    const res = await hook.accept(a, ["framework", "rybiapaka", "#Ręcznie"]);
    expect(res).toEqual({ before: ["insight", "stary"], after: ["stary", "framework", "rybiapaka", "ręcznie"] });
    expect(h.updateBlock).toHaveBeenCalledWith(a, { tags: ["stary", "framework", "rybiapaka", "ręcznie"] });
    const rows = h.inserts.flat() as { tag: string; accepted: boolean; source: string; user_id: string; block_id: string }[];
    expect(rows.map((r) => [r.tag, r.accepted, r.source])).toEqual([
      ["framework", true, "type-rule"],
      ["rybiapaka", true, "neighbours"],
      ["ręcznie", true, "manual"],
      ["marketing", false, "ai"],
    ]);
    expect(rows.every((r) => r.user_id === "u1" && r.block_id === a)).toBe(true);
    expect(hook.peek(a)).toBeUndefined();
  });

  it("writes nothing to the note when the tags are already there, and does not log those as accepted", async () => {
    const a = freshId();
    h.tags.set(a, ["rybiapaka"]);
    const res = await useTagSuggestions().accept(a, ["rybiapaka"]);
    expect(res).toEqual({ before: ["rybiapaka"], after: ["rybiapaka"] });
    expect(h.updateBlock).not.toHaveBeenCalled();
    expect(h.inserts.flat()).toEqual([]);
  });

  it("returns null and records nothing when the save fails", async () => {
    const a = freshId();
    h.tags.set(a, []);
    h.updateBlock.mockResolvedValue(false);
    expect(await useTagSuggestions().accept(a, ["x"])).toBeNull();
    expect(h.inserts).toHaveLength(0);
  });

  it("a missing feedback table does not fail the accept", async () => {
    const a = freshId();
    h.tags.set(a, []);
    h.insertError = { message: 'relation "archive_tag_feedback" does not exist' };
    expect(await useTagSuggestions().accept(a, ["x"])).toEqual({ before: [], after: ["x"] });
  });

  it("reject records one chip with its source and stops offering it", async () => {
    const a = freshId();
    answerWith(() => [chip("insight", "type", "ai"), chip("biznes", "tag")]);
    const hook = useTagSuggestions();
    await hook.suggest([a]);
    await hook.reject(a, "biznes");
    expect(h.inserts.flat()).toEqual([{ user_id: "u1", block_id: a, tag: "biznes", accepted: false, source: "neighbours" }]);
    expect(hook.peek(a)?.map((s) => s.tag)).toEqual(["insight"]);
  });

  it("forget drops the chips without recording anything", async () => {
    const a = freshId();
    answerWith(() => [chip("biznes", "tag")]);
    const hook = useTagSuggestions();
    await hook.suggest([a]);
    hook.forget(a);
    expect(hook.peek(a)).toBeUndefined();
    expect(h.inserts).toHaveLength(0);
  });
});
