import { describe, expect, it } from "vitest";
import { socialNoteContent, socialVideoUrl } from "@/lib/social-video";

describe("socialVideoUrl", () => {
  it("finds reel and short links in text", () => {
    expect(socialVideoUrl("look https://www.instagram.com/reel/C9xYz12AbCd/?igsh=abc great")).toBe("https://www.instagram.com/reel/C9xYz12AbCd/?igsh=abc");
    expect(socialVideoUrl("https://vm.tiktok.com/ZMabc123/")).toBe("https://vm.tiktok.com/ZMabc123/");
    expect(socialVideoUrl("https://x.com/someone/status/1234567890")).toBe("https://x.com/someone/status/1234567890");
    expect(socialVideoUrl("https://youtube.com/shorts/abcdefghijk")).toBe("https://youtube.com/shorts/abcdefghijk");
  });
  it("ignores other links", () => {
    expect(socialVideoUrl("https://instagram.com/someprofile")).toBeNull();
    expect(socialVideoUrl("https://example.com/reel/1")).toBeNull();
  });
});

describe("socialNoteContent", () => {
  it("lays the note out", () => {
    const c = socialNoteContent({ url: "https://instagram.com/reel/x", platform: "instagram", author: "ann", title: "T", points: ["a", "b"], transcript: "hello", caption: "cap", cover: "https://s/c.jpg" }, "my take");
    expect(c).toBe("my take\n\nhttps://instagram.com/reel/x (ann)\n\n[image] https://s/c.jpg\n\n**Key points**\n- a\n- b\n\n**Transcript**\nhello\n\n**Caption**\ncap");
  });
});
