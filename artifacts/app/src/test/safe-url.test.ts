import { describe, it, expect } from "vitest";
import { safeUrl } from "../lib/safe-url";

describe("safeUrl", () => {
  it("keeps web and mail links", () => {
    expect(safeUrl(" https://example.com/a?b=1 ")).toBe("https://example.com/a?b=1");
    expect(safeUrl("HTTP://x.org")).toBe("HTTP://x.org");
    expect(safeUrl("mailto:me@x.org")).toBe("mailto:me@x.org");
    expect(safeUrl("//cdn.x.org/a")).toBe("https://cdn.x.org/a");
  });

  it("adds https to a bare domain", () => {
    expect(safeUrl("goodreads.com/book/1")).toBe("https://goodreads.com/book/1");
  });

  it("refuses script and other schemes, and non-links", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("  JavaScript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<script>1</script>")).toBeNull();
    expect(safeUrl("vbscript:x")).toBeNull();
    expect(safeUrl("not a link")).toBeNull();
    expect(safeUrl("")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});
