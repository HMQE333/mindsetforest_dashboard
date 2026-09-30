import { describe, it, expect } from "vitest";
import { chunkForInsert, HASHTAG_REGEX, splitInboxItems } from "../lib/archive-data";

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
