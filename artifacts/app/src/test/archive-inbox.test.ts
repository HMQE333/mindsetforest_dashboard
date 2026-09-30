import { describe, it, expect } from "vitest";
import { chunkForInsert, HASHTAG_REGEX, removeUrl, removeUrls, splitInboxItems } from "../lib/archive-data";

describe("splitInboxItems", () => {
  it("splits on a line holding only ---", () => {
    expect(splitInboxItems("one\n---\ntwo\r\n  ---  \r\nthree")).toEqual(["one", "two", "three"]);
  });

  it("keeps --- inside a line, as in a URL slug", () => {
    const url = "https://www.temu.com/pl-en/scraper-for-stainless-steel---si";
    expect(splitInboxItems(`${url}\nhttps://a.com`)).toEqual([`${url}\nhttps://a.com`]);
  });

  it("returns nothing for blank text", () => {
    expect(splitInboxItems("  \n---\n ")).toEqual([]);
  });
});

describe("HASHTAG_REGEX", () => {
  const tags = (s: string) => Array.from(s.matchAll(new RegExp(HASHTAG_REGEX.source, "g")), (m) => m[2]);
  it("finds standalone tags but not URL fragments", () => {
    expect(tags("#idea read this https://x.com/page#section and #todo")).toEqual(["idea", "todo"]);
  });
});

describe("chunkForInsert", () => {
  it("caps rows per request and keeps order", () => {
    const items = Array.from({ length: 250 }, (_, i) => ({ i }));
    const chunks = chunkForInsert(items);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(items);
  });

  it("caps bytes per request, and a single oversized item goes alone", () => {
    const big = { content: "x".repeat(600_000) };
    const chunks = chunkForInsert([big, big, { content: "small" }, big]);
    expect(chunks.map((c) => c.length)).toEqual([1, 2, 1]);
  });
});

describe("removeUrl", () => {
  it("drops the link's line and one blank line around it", () => {
    expect(removeUrl("a\n\nhttps://x.com/1\n\nb", "https://x.com/1")).toBe("a\n\nb");
    expect(removeUrl("https://x.com/1\n\nb", "https://x.com/1")).toBe("b");
    expect(removeUrl("a\n\nhttps://x.com/1", "https://x.com/1")).toBe("a");
    expect(removeUrl("a\nhttps://x.com/1\nb", "https://x.com/1")).toBe("a\nb");
  });

  it("never cuts a longer link that starts with it", () => {
    const content = "https://yt.com/watch?v=abcdef\n\nhttps://yt.com/watch?v=abc";
    expect(removeUrl(content, "https://yt.com/watch?v=abc")).toBe("https://yt.com/watch?v=abcdef");
  });

  it("removes every occurrence, keeps the text around it", () => {
    expect(removeUrl("see https://x.com here\nand https://x.com", "https://x.com")).toBe("see here\nand");
    // As the Links view reads it, "https://x.com." is a different link.
    expect(removeUrl("https://x.com.", "https://x.com")).toBe("https://x.com.");
  });

  it("takes an [image] tag with it, and leaves nothing when the note was only the link", () => {
    expect(removeUrl("[image] https://x.com/a.png\nnice", "https://x.com/a.png")).toBe("nice");
    expect(removeUrl("\nhttps://x.com\n", "https://x.com")).toBe("");
  });

  it("leaves a note without the link as it was", () => {
    expect(removeUrl("a\n\n\nb  c", "https://x.com")).toBe("a\n\n\nb  c");
  });

  it("handles links with regex characters", () => {
    expect(removeUrl("https://x.com/a?b=(1)+c\nhttps://x.com/a?b=(1)+\nok", "https://x.com/a?b=(1)+")).toBe("https://x.com/a?b=(1)+c\nok");
  });
});

describe("removeUrls", () => {
  it("takes several links out in one pass", () => {
    const content = "a https://x.com/1\n\nhttps://x.com/2\n\nhttps://y.com\n\nhttps://x.com/1";
    expect(removeUrls(content, ["https://x.com/1", "https://x.com/2"])).toBe("a\n\nhttps://y.com");
  });

  it("works on links as the Links view reads them, so a link inside another is not cut", () => {
    expect(removeUrls("https://a.com/?u=https://b.com", ["https://b.com"])).toBe("https://a.com/?u=https://b.com");
  });

  it("clears thousands of links from a big pasted list quickly", () => {
    const urls = Array.from({ length: 9830 }, (_, i) => (i % 5 < 3 ? `https://www.youtube.com/watch?v=${i}` : `https://site${i}.com/p`));
    const drop = urls.filter((u) => u.includes("youtube"));
    const started = Date.now();
    const left = removeUrls(urls.join("\n\n"), drop);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(left.split("\n\n")).toEqual(urls.filter((u) => !u.includes("youtube")));
  });
});
