import { describe, expect, it } from "vitest";
import { worthReviewing } from "@/lib/digest-worth";

describe("worthReviewing", () => {
  it("skips a note that is only a link", () => {
    expect(worthReviewing("https://www.facebook.com/share/v/1E1cLGRLTs/", "https://www.facebook.com/share/v/1E1cLGRLTs/")).toBe(false);
  });
  it("skips a picture with no words", () => expect(worthReviewing("Image", "[image] https://x.supabase.co/a.png")).toBe(false));
  it("keeps a link with a summary", () => {
    expect(worthReviewing("Reel", "https://instagram.com/reel/x\n\nZasada 2 minut: jeśli coś zajmuje mniej niż dwie minuty, zrób to od razu.")).toBe(true);
  });
  it("keeps a plain written note", () => expect(worthReviewing("Idea", "Spaced repetition works best with one fact per card.")).toBe(true));
});
