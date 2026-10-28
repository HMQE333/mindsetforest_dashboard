import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } },
}));
const toasts = vi.hoisted(() => ({ calls: [] as { title: string; opts: any }[], dismissed: [] as unknown[] }));
vi.mock("sonner", () => {
  const toast = Object.assign(
    (title: string, opts: any) => {
      toasts.calls.push({ title, opts });
      return opts?.id ?? toasts.calls.length;
    },
    { dismiss: (id: unknown) => toasts.dismissed.push(id), error: vi.fn(), success: vi.fn() },
  );
  return { toast };
});

import {
  addToFolder,
  deleteFolder,
  folderLabel,
  folderNameProblem,
  folderReach,
  moveToFolder,
  removeFromFolder,
  renameFolder,
  withoutFolders,
} from "../components/archive/folder-ops";
import {
  UNTAGGED,
  filterLibrary,
  filterRanked,
  inFolderFilter,
  isUntagged,
  noteTags,
  tagStats,
} from "../components/archive/archive-index";
import { deleteWithUndo, flushPendingDeletes, pendingDeletes, resetPendingDeletes, UNDO_MS } from "../components/archive/pending-deletes";
import { tagTree } from "../lib/archive-tags";
import type { ArchiveBlock } from "../lib/archive-data";

let n = 0;
function block(over: Partial<ArchiveBlock> = {}): ArchiveBlock {
  n++;
  return {
    id: `b${n}`,
    user_id: "u",
    title: `Note ${n}`,
    content: `text ${n}`,
    pillars: [],
    directions: [],
    tags: [],
    source_url: null,
    is_pinned: false,
    is_starred: false,
    created_at: new Date(Date.UTC(2026, 9, 1, 12, n)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 9, 1, 12, n)).toISOString(),
    from_seed_id: null,
    ...over,
  } as ArchiveBlock;
}
const note = (id: string, tags: string[]) => ({ id, tags });

describe("folder actions on a note's tags", () => {
  it("adds a folder and keeps the other tags and the type", () => {
    expect(addToFolder([note("a", ["insight", "nauka"])], "Projekty/RybiaPaka")).toEqual([
      { id: "a", before: ["insight", "nauka"], after: ["insight", "nauka", "projekty/rybiapaka"] },
    ]);
    // Already there: nothing to write.
    expect(addToFolder([note("a", ["nauka"])], "nauka")).toEqual([]);
    // A type is not a folder, and a name without a letter is not a tag.
    expect(addToFolder([note("a", [])], "quote")).toEqual([]);
    expect(addToFolder([note("a", [])], "#2")).toEqual([]);
  });

  it("moves out of the folder being viewed (and what is below it) into another", () => {
    const list = moveToFolder([note("a", ["task", "projekty", "projekty/x", "nauka"])], "inne", "projekty");
    expect(list[0].after).toEqual(["task", "nauka", "inne"]);
    // With no folder viewed, Move takes it out of every folder; the type and number "tags" stay.
    expect(moveToFolder([note("a", ["source", "a", "b/c", "2"])], "z", null)[0].after).toEqual(["source", "2", "z"]);
    // Into a sub-folder of the one viewed.
    expect(moveToFolder([note("a", ["projekty"])], "projekty/a", "projekty")[0].after).toEqual(["projekty/a"]);
  });

  it("takes a note out of a folder (dropping it on Untagged) and deletes a folder with its sub-folders", () => {
    expect(removeFromFolder([note("a", ["x", "x/y", "xy", "quote"])], "x")[0].after).toEqual(["xy", "quote"]);
    expect(deleteFolder([note("a", ["k"]), note("b", ["k/l"]), note("c", ["m"])], "k").map((c) => c.id)).toEqual(["a", "b"]);
    expect(withoutFolders(["insight", "a", "13"])).toEqual(["insight", "13"]);
  });

  it("renames a folder on every note, sub-folders with it, never a type, keeping one copy of a merged tag", () => {
    const list = renameFolder([note("a", ["prj", "prj/rybia", "inne"]), note("b", ["prjx"]), note("c", ["prj", "nowe"])], "prj", "Nowe");
    expect(list).toEqual([
      { id: "a", before: ["prj", "prj/rybia", "inne"], after: ["nowe", "nowe/rybia", "inne"] },
      { id: "c", before: ["prj", "nowe"], after: ["nowe"] },
    ]);
    expect(renameFolder([note("a", ["x"])], "x", "insight")).toEqual([]);
  });

  it("counts what a rename or delete reaches, and checks folder names", () => {
    expect(folderReach([note("a", ["k", "k/l/m"]), note("b", ["k/l"]), note("c", ["kk"])], "k")).toEqual({ notes: 2, subfolders: 2 });
    const have = new Set(["nauka", "projekty"]);
    expect(folderNameProblem("", have)).toBe("Type a name");
    expect(folderNameProblem("123", have)).toMatch(/letter/);
    expect(folderNameProblem("Quote", have)).toMatch(/type/);
    expect(folderNameProblem("Nauka", have)).toMatch(/exists/);
    expect(folderNameProblem("książki", have)).toBeNull();
    // A rename may land on an existing folder (the notes join it), not on itself or inside itself.
    expect(folderNameProblem("nauka", have, "projekty")).toBeNull();
    expect(folderNameProblem("projekty", have, "projekty")).toMatch(/already/);
    expect(folderNameProblem("projekty/a", have, "projekty")).toMatch(/inside itself/);
    expect(folderLabel("a".repeat(60), 10)).toBe("#aaaaaaaa…");
  });
});

describe("the Library's tag index", () => {
  it("reads a note's tags once per version: the type first, numbers left out", () => {
    const b = block({ tags: ["nauka", "2", "quote", "projekty/x", "nauka"] });
    const t = noteTags(b);
    expect(t).toEqual({ shown: ["quote", "nauka", "projekty/x"], type: "quote", folders: ["nauka", "projekty/x"] });
    expect(noteTags(b)).toBe(t);
    expect(noteTags(block({ tags: ["13"] })).shown).toEqual([]);
    expect(isUntagged(block({ tags: ["insight"] }))).toBe(true);
    expect(isUntagged(block({ tags: null as unknown as string[] }))).toBe(true);
  });

  it("filters by folder (and below), Untagged and type, and counts it all in one pass", () => {
    const a = block({ tags: ["projekty/rybiapaka", "task"] });
    const b2 = block({ tags: ["projekty"] });
    const c = block({ tags: ["nauka", "insight"] });
    const d = block({ tags: ["2"] });
    const all = [a, b2, c, d];
    expect(inFolderFilter(a, "projekty")).toBe(true);
    expect(inFolderFilter(a, "projekty/rybia")).toBe(false);
    const base = { search: "", includeTags: false, pillar: null, hideLinks: false, sort: "oldest" as const };
    expect(filterLibrary(all, { ...base, folder: "projekty" }).map((x) => x.id)).toEqual([a.id, b2.id]);
    expect(filterLibrary(all, { ...base, folder: UNTAGGED }).map((x) => x.id)).toEqual([d.id]);
    expect(filterLibrary(all, { ...base, type: "insight" }).map((x) => x.id)).toEqual([c.id]);
    expect(filterLibrary(all, { ...base, type: "none" }).map((x) => x.id)).toEqual([b2.id, d.id]);
    expect(filterRanked([c, a], all, { pillar: null, hideLinks: false, folder: "projekty" }).map((x) => x.id)).toEqual([a.id]);
    expect(filterRanked([c, a], all, { pillar: null, hideLinks: false }, new Set([c.id])).map((x) => x.id)).toEqual([a.id]);

    const s = tagStats(all);
    expect(s.untagged).toBe(1);
    expect(s.untyped).toBe(2);
    expect(s.types.get("task")).toBe(1);
    expect([...s.counts]).toEqual([["projekty/rybiapaka", 1], ["projekty", 1], ["nauka", 1]]);
    expect(s.folderCounts.get("projekty")).toBe(2);
    // The tree from the counts, with an empty saved folder.
    const tree = tagTree([...s.counts, ["książki", 0] as const], { noteCounts: s.folderCounts });
    expect(tree.map((t) => [t.path, t.count])).toEqual([["książki", 0], ["nauka", 1], ["projekty", 2]]);
    expect(tree[2].children.map((t) => t.path)).toEqual(["projekty/rybiapaka"]);
  });
});

describe("deleting with Undo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPendingDeletes();
    toasts.calls.length = 0;
  });
  afterEach(() => {
    resetPendingDeletes();
    vi.useRealTimers();
  });

  it("hides the note at once and sends the delete only when the toast ends", async () => {
    const del = vi.fn(async () => true);
    deleteWithUndo(["x"], del, { label: "https://example.com/a-very-long-url-without-any-spaces-at-all-in-it" });
    expect(pendingDeletes().has("x")).toBe(true);
    expect(del).not.toHaveBeenCalled();
    expect(toasts.calls[0].title).toMatch(/^Moved to Trash: "https:\/\/example.com\/.{20,}…"$/);
    expect(toasts.calls[0].opts.action.label).toBe("Undo");
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1);
    expect(del).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(del).toHaveBeenCalledWith("x");
    expect(pendingDeletes().has("x")).toBe(false);
  });

  it("Undo shows the note again and nothing is sent", async () => {
    const del = vi.fn(async () => true);
    deleteWithUndo(["x", "y"], del);
    expect(toasts.calls[0].title).toBe("2 notes moved to Trash");
    toasts.calls[0].opts.action.onClick();
    expect(pendingDeletes().size).toBe(0);
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(del).not.toHaveBeenCalled();
  });

  it("sends everything waiting when the page goes away, and a failed delete comes back", async () => {
    const del = vi.fn(async (id: string) => id !== "bad");
    deleteWithUndo(["ok"], del);
    deleteWithUndo(["bad"], del);
    // The same note twice is one delete.
    deleteWithUndo(["ok"], del);
    flushPendingDeletes();
    await vi.advanceTimersByTimeAsync(0);
    expect(del.mock.calls.map((c) => c[0])).toEqual(["ok", "bad"]);
    expect(pendingDeletes().size).toBe(0);
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(del).toHaveBeenCalledTimes(2);
  });
});
