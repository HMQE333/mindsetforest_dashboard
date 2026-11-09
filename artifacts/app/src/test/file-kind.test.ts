import { describe, expect, it } from "vitest";
import { fileKind, fileNoteContent } from "@/lib/file-kind";

describe("fileKind", () => {
  it("reads MIME types and extensions", () => {
    expect(fileKind("a.mp3", "audio/mpeg")).toBe("audio");
    expect(fileKind("song.MP3")).toBe("audio");
    expect(fileKind("x.html")).toBe("html");
    expect(fileKind("notes.md")).toBe("markdown");
    expect(fileKind("a.zip", "application/zip")).toBe("zip");
    expect(fileKind("doc.pdf")).toBe("pdf");
    expect(fileKind("data.json")).toBe("text");
    expect(fileKind("photo", "image/png")).toBe("image");
    expect(fileKind("thing.bin", "application/octet-stream")).toBe("other");
  });
  it("makes a note for a kept file", () => {
    expect(fileNoteContent("a.png", "https://x/a.png", "image/png")).toBe("[image] https://x/a.png");
    expect(fileNoteContent("a.mp3", "https://x/a.mp3")).toBe("📎 a.mp3\nhttps://x/a.mp3");
  });
});

describe("noteFile", () => {
  it("finds the kept file in a note", async () => {
    const { noteFile } = await import("@/lib/file-kind");
    expect(noteFile("📎 a.mp3\nhttps://x/a.mp3")).toEqual({ name: "a.mp3", url: "https://x/a.mp3" });
    expect(noteFile("just text")).toBeNull();
  });
});
