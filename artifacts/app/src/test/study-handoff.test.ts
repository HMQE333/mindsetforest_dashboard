import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { downloadCoursePack, studyInChatGpt, talkInClaude, type Material, type StudySource } from "../components/archive/lectures/study-actions";
import { copyText } from "../lib/hand-off";
import { BUILTIN_LEARNING, type RecordingInput } from "../lib/lecture-tutor";
import { groupLectures, indexVault } from "../lib/kos-vault";
import { FIXTURE_FILES, FIXTURE_RECORDINGS, FIXTURE_SEGMENTS } from "./lecture-fixtures";

const index = indexVault(FIXTURE_FILES);
const PL = index.lectureByPath.get("lectures/logika/2026-10-11 zdania logiczne i zbiory")!;
const TEXTBOOK = index.textbooks[0];
const rec = FIXTURE_RECORDINGS.find((r) => r.id === "rec-pl")!;
const ROWS: RecordingInput[] = [{ ...rec, segments: FIXTURE_SEGMENTS["rec-pl"] }];
const READY: Material = { state: "ready", rows: ROWS };

function browser(opts: { clipboard?: "ok" | "denied" | "none"; popup?: boolean } = {}) {
  const copied: string[] = [];
  const opened: string[] = [];
  const clipboard =
    opts.clipboard === "none"
      ? undefined
      : { writeText: vi.fn(async (t: string) => (opts.clipboard === "denied" ? Promise.reject(new Error("NotAllowedError")) : void copied.push(t))) };
  vi.stubGlobal("navigator", { clipboard });
  vi.stubGlobal("window", {
    open: vi.fn((url: string) => {
      opened.push(url);
      return opts.popup === false ? null : {};
    }),
  });
  return { copied, opened };
}

const source = (over: Partial<StudySource> = {}): StudySource => ({
  learningMode: "",
  projectUrl: "",
  recordings: vi.fn(async () => ROWS),
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("Ucz się w ChatGPT / Test w ChatGPT", () => {
  it("copies the pack, then opens ChatGPT in a new tab and says to paste it", async () => {
    const b = browser();
    const src = source();
    await studyInChatGpt(src, PL, "explain", READY);
    expect(src.recordings).not.toHaveBeenCalled(); // the reader already holds the transcript
    expect(b.copied).toHaveLength(1);
    expect(b.copied[0].startsWith(`# Jak mnie uczyć\n\n${BUILTIN_LEARNING.pl}`)).toBe(true);
    expect(b.copied[0]).toContain("Z fałszu wynika wszystko");
    expect(b.opened).toEqual(["https://chatgpt.com/"]);
    expect(toast.success).toHaveBeenCalledWith("Skopiowano — wklej w ChatGPT", { description: undefined, action: undefined });
  });

  it("copies inside the click: the copy starts before anything is awaited", () => {
    const b = browser();
    void studyInChatGpt(source(), PL, "explain", READY);
    expect(b.copied).toHaveLength(1);
  });

  it("opens the project when one is set, and the pack leaves the learning mode to it", async () => {
    const b = browser();
    await studyInChatGpt(source({ projectUrl: "https://chatgpt.com/g/g-p-1/project", learningMode: "Tryb nauki: …" }), PL, "test", READY);
    expect(b.opened).toEqual(["https://chatgpt.com/g/g-p-1/project"]);
    expect(b.copied[0].startsWith("Ucz mnie według instrukcji tego projektu (tryb nauki).")).toBe(true);
    expect(b.copied[0]).toMatch(/test: zacznij od pytań A\/B\/C\/D/);
  });

  it("still copies the summary when the transcript will not load, or is still loading, and says so", async () => {
    const b = browser();
    await studyInChatGpt(source(), PL, "explain", { state: "failed" });
    expect(b.copied[0]).not.toContain("Fragmenty zapisu");
    expect(toast.success.mock.calls[0][1].description).toBe("Bez fragmentów zapisu: nie udało się ich wczytać.");
    await studyInChatGpt(source(), PL, "explain", { state: "loading" });
    expect(b.copied[1]).not.toContain("Fragmenty zapisu");
    expect(toast.success.mock.calls[1][1].description).toMatch(/^Bez fragmentów zapisu: jeszcze się wczytują\./);
  });

  it("offers a button, for long enough to tap, when a popup blocker stops the new tab", async () => {
    const b = browser({ popup: false });
    await studyInChatGpt(source(), PL, "explain", READY);
    expect(toast.success.mock.calls[0][1].duration).toBe(20_000);
    const action = toast.success.mock.calls[0][1].action;
    expect(action.label).toBe("Otwórz ChatGPT");
    action.onClick();
    expect(b.opened).toEqual(["https://chatgpt.com/", "https://chatgpt.com/"]);
  });

  it("shows an error and opens nothing when the copy fails", async () => {
    const b = browser({ clipboard: "denied" });
    await studyInChatGpt(source(), PL, "explain", READY);
    expect(b.opened).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Nie udało się skopiować. Pozwól stronie na dostęp do schowka i spróbuj jeszcze raz.");
  });

  it("needs no transcript for a textbook, and says nothing is missing", async () => {
    const b = browser();
    await studyInChatGpt(source(), TEXTBOOK, "explain", { state: "loading" });
    expect(b.copied[0]).toContain("# Materiał: Logika — Podręcznik przedmiotu (2026-10-19)");
    expect(toast.success.mock.calls[0][1].description).toBeUndefined();
  });
});

describe("Przegadaj w Claude", () => {
  it("copies the short instruction and opens nothing", async () => {
    const b = browser();
    await talkInClaude(PL, "Tryb nauki: …");
    expect(b.copied[0]).toMatch(/^Przegadajmy wykład z mojego skarbca Obsidiana „Studia”: Lectures\/Logika\/2026-10-11 Zdania logiczne i zbiory\.md\nNajpierw przeczytaj _SYSTEM\/learning-mode\.md/);
    expect(b.opened).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith("Skopiowano — wklej w Claude Desktop", { description: "Claude sam przeczyta notatkę ze skarbca." });
  });
});

describe("copyText", () => {
  it("uses the Clipboard API, and without it or without permission falls back (none in a page without a document)", async () => {
    const b = browser();
    expect(await copyText("a")).toBe(true);
    expect(b.copied).toEqual(["a"]);
    browser({ clipboard: "none" });
    expect(await copyText("b")).toBe(false);
  });
});

describe("Pakiet przedmiotu", () => {
  it("downloads one Markdown file named after the course", () => {
    const clicks: { href: string; download: string }[] = [];
    const created: Blob[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const a = { href: "", download: "", rel: "", style: {} as Record<string, string>, click: () => clicks.push({ href: a.href, download: a.download }), remove: () => {} };
        return a;
      },
      body: { appendChild: () => {} },
    });
    vi.stubGlobal("URL", { createObjectURL: (b: Blob) => (created.push(b), "blob:pack"), revokeObjectURL: () => {} });
    const logika = groupLectures(index.lectures, "", index.textbooks)[0];
    downloadCoursePack(logika);
    expect(clicks).toEqual([{ href: "blob:pack", download: "Logika – pakiet do nauki.md" }]);
    expect(created[0].type).toBe("text/markdown;charset=utf-8");
    expect(toast.success).toHaveBeenCalledWith("Pobrano „Logika – pakiet do nauki.md”", { description: "Wgraj go do projektu w ChatGPT albo Claude." });
  });
});
