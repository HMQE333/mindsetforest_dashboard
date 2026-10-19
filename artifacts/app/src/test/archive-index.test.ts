import { describe, it, expect } from "vitest";
import {
  blockImages,
  blockLinks,
  blockUrls,
  cardView,
  classifyUrl,
  countImages,
  countLinks,
  filterLibrary,
  filterRanked,
  matchesQuery,
  noteWithoutLinks,
  previewText,
  PREVIEW_CHARS,
  LINK_NOTE_CHARS,
} from "../components/archive/archive-index";
import { archiveFingerprint, type ArchiveBlock } from "../lib/archive-data";

let n = 0;
function block(over: Partial<ArchiveBlock> = {}): ArchiveBlock {
  n++;
  return {
    id: `b${n}`,
    user_id: "u",
    title: `Note ${n}`,
    content: "",
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

describe("classifyUrl", () => {
  it("reads kind and host from one parse", () => {
    expect(classifyUrl("https://www.youtube.com/watch?v=abc")).toEqual({ type: "video", host: "youtube.com" });
    expect(classifyUrl("https://i.imgur.com/x.PNG")).toEqual({ type: "image", host: "i.imgur.com" });
    expect(classifyUrl("https://github.com/a/b")).toEqual({ type: "link", host: "github.com" });
  });

  it("treats a URL that does not parse as a plain link without a host", () => {
    expect(classifyUrl("https://")).toEqual({ type: "link", host: "" });
  });
});

describe("blockUrls / blockLinks", () => {
  it("lists each link once, in order, with source_url last", () => {
    const b = block({ content: "see https://a.com/1 and https://b.com/2 then https://a.com/1 again", source_url: "https://src.example/x" });
    expect(blockUrls(b)).toEqual(["https://a.com/1", "https://b.com/2", "https://src.example/x"]);
  });

  it("parses a note once per version: the same object comes back until the note changes", () => {
    const b = block({ content: "https://a.com https://b.com" });
    const first = blockLinks(b);
    expect(blockLinks(b)).toBe(first);
    expect(blockUrls(b)).toBe(blockUrls(b));
    // An edit makes a new note object (as setBlocks / React Query do), which is read afresh.
    const edited = { ...b, content: "https://c.com" };
    expect(blockLinks(edited)).not.toBe(first);
    expect(blockLinks(edited).links.map((l) => l.url)).toEqual(["https://c.com"]);
  });

  it("keeps the note text short and the same for every link of a note", () => {
    const text = "word ".repeat(200);
    const b = block({ content: `${text}\nhttps://a.com\n\n\nhttps://b.com` });
    const { links, note } = blockLinks(b);
    expect(links).toHaveLength(2);
    expect(note.length).toBeLessThanOrEqual(LINK_NOTE_CHARS);
    expect(note).not.toContain("https://");
    expect(links[0].lower).toBe("https://a.com");
  });

  it("gives a note without links no note text", () => {
    expect(blockLinks(block({ content: "just words" }))).toEqual({ links: [], note: "" });
  });

  it("handles a note with ten thousand links without re-reading it", () => {
    const urls = Array.from({ length: 10_000 }, (_, i) => `https://www.youtube.com/watch?v=${i.toString(36)}`);
    const giant = block({ content: urls.join("\n") });
    const t0 = performance.now();
    const first = blockLinks(giant);
    const parse = performance.now() - t0;
    expect(first.links).toHaveLength(10_000);
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) blockLinks(giant);
    const cached = performance.now() - t1;
    expect(cached).toBeLessThan(Math.max(5, parse));
  });
});

describe("noteWithoutLinks", () => {
  it("drops links, folds blank runs and cuts to the limit", () => {
    expect(noteWithoutLinks("a https://x.y b\n\n\nc", 100)).toBe("a  b\nc");
    expect(noteWithoutLinks("abcdef", 3)).toBe("abc");
  });
});

describe("blockImages and cardView", () => {
  it("finds tagged and bare image links, each once", () => {
    const b = block({ content: "[image] https://cdn.x/a.png\nhttps://cdn.x/a.png https://cdn.x/b.jpg https://cdn.x/page" });
    expect(blockImages(b)).toEqual(["https://cdn.x/a.png", "https://cdn.x/b.jpg"]);
  });

  it("builds the card from the start of the note only", () => {
    const b = block({ title: "[image] https://cdn.x/a.png", content: `[image] https://cdn.x/a.png\n${"x".repeat(500_000)}` });
    const view = cardView(b);
    expect(view.title).toBe("Image block");
    expect(view.preview.length).toBeLessThanOrEqual(PREVIEW_CHARS);
    expect(view.preview.startsWith("x")).toBe(true);
    expect(view.images).toEqual(["https://cdn.x/a.png"]);
    expect(cardView(b)).toBe(view);
  });

  it("previews an image-only note as an image block", () => {
    expect(cardView(block({ content: "[image] https://cdn.x/a.png" })).preview).toBe("Image block");
    expect(previewText("[image] https://cdn.x/a.png hello")).toBe("hello");
  });

  it("caps thumbnails at four but counts them all", () => {
    const content = Array.from({ length: 6 }, (_, i) => `https://cdn.x/${i}.png`).join(" ");
    const view = cardView(block({ content }));
    expect(view.images).toHaveLength(4);
    expect(view.imageCount).toBe(6);
  });
});

describe("counts", () => {
  it("counts distinct links and images across notes", () => {
    const a = block({ content: "https://a.com https://cdn.x/1.png" });
    const b = block({ content: "https://a.com https://b.com", source_url: "https://c.com" });
    expect(countLinks([a, b])).toBe(4);
    expect(countImages([a, b])).toBe(1);
  });
});

describe("matchesQuery / filterLibrary", () => {
  const pinned = block({ title: "Pinned spec", content: "Weekly Review ritual", is_pinned: true });
  const tagged = block({ title: "Other", content: "nothing here", tags: ["Ritual"] });
  const linky = block({ title: "Links", content: "see https://example.com ritual" });
  const old = block({ title: "Alpha", content: "ritual", created_at: "2026-01-01T00:00:00.000Z" });
  const all = [linky, tagged, old, pinned];

  it("matches title and text case-insensitively, tags only when asked", () => {
    expect(matchesQuery(pinned, "weekly")).toBe(true);
    expect(matchesQuery(tagged, "ritual")).toBe(false);
    expect(matchesQuery(tagged, "ritual", true)).toBe(true);
    expect(matchesQuery(tagged, "")).toBe(true);
  });

  it("puts pinned notes first, then sorts", () => {
    const newest = filterLibrary(all, { search: "", includeTags: false, pillar: null, hideLinks: false, sort: "newest" });
    expect(newest[0]).toBe(pinned);
    expect(newest[newest.length - 1]).toBe(old);
    const oldest = filterLibrary(all, { search: "", includeTags: false, pillar: null, hideLinks: false, sort: "oldest" });
    expect(oldest.slice(0, 2)).toEqual([pinned, old]);
    const az = filterLibrary(all, { search: "", includeTags: false, pillar: null, hideLinks: false, sort: "az" });
    expect(az.map((b) => b.title)).toEqual(["Pinned spec", "Alpha", "Links", "Other"]);
  });

  it("applies the search (trimmed, any case), the link filter and the pillar", () => {
    const f = { includeTags: false, pillar: null, hideLinks: false, sort: "newest" as const };
    expect(filterLibrary(all, { ...f, search: "  RITUAL " })).toEqual([pinned, linky, old]);
    expect(filterLibrary(all, { ...f, search: "ritual", hideLinks: true })).toEqual([pinned, old]);
    const withPillar = block({ pillars: ["mind"] });
    expect(filterLibrary([...all, withPillar], { ...f, search: "", pillar: "mind" })).toEqual([withPillar]);
  });

  it("keeps a smart search's order but shows the live note (current pin)", () => {
    const stale = { ...linky, is_pinned: false };
    const livePinned = { ...linky, is_pinned: true };
    const ranked = filterRanked([old, stale], [old, livePinned], { pillar: null, hideLinks: false });
    expect(ranked).toEqual([livePinned, old]);
  });
});

describe("archiveFingerprint", () => {
  it("is the count and the newest change, in the server's own format", () => {
    const a = block({ updated_at: "2026-10-18T10:00:00.123456+00:00" });
    const b = block({ updated_at: "2026-10-18T11:00:00.5+00:00" });
    expect(archiveFingerprint([a, b])).toBe("2:2026-10-18T11:00:00.5+00:00");
    expect(archiveFingerprint([])).toBe("0:");
  });
});
