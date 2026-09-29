import { describe, it, expect } from "vitest";
import { cleanForSpeech, detectLang, isStopPhrase, parseYesNo, pickVoice, defaultVoiceLang } from "../lib/voice-mode";
import { prettyModelName } from "../lib/model-names";

describe("voice mode helpers", () => {
  it("strips action blocks, markdown, urls and emoji before speaking", () => {
    const text = 'Zrobione ✅.\n- **Read** 20 pages\nSee https://example.com/x\n```action\n[{"type":"navigate","module":"paths"}]\n```';
    const clean = cleanForSpeech(text);
    expect(clean).not.toContain("action");
    expect(clean).not.toContain("http");
    expect(clean).not.toContain("**");
    expect(clean).not.toContain("✅");
    expect(clean).toContain("Read 20 pages");
  });

  it("detects Polish from diacritics or common words, else falls back", () => {
    expect(detectLang("Masz dziś trzy misje")).toBe("pl-PL");
    expect(detectLang("You have three missions today")).toBe("en-US");
    expect(detectLang("42", "pl-PL")).toBe("pl-PL");
  });

  it("parses spoken yes / no in both languages", () => {
    expect(parseYesNo("Tak, zrób to")).toBe("yes");
    expect(parseYesNo("no thanks")).toBe("no");
    expect(parseYesNo("Nie, anuluj")).toBe("no");
    expect(parseYesNo("okej")).toBe("yes");
    expect(parseYesNo("hmm")).toBeNull();
    expect(parseYesNo("tak nie wiem")).toBe("no");
  });

  it("recognises stop phrases", () => {
    expect(isStopPhrase("koniec")).toBe(true);
    expect(isStopPhrase("Bye!")).toBe(true);
    expect(isStopPhrase("koniec tygodnia był ciężki")).toBe(false);
  });

  it("prefers natural voices in the requested language", () => {
    const voices = [
      { lang: "en-US", name: "Alex", localService: true },
      { lang: "pl-PL", name: "Google polski", localService: false },
      { lang: "pl_PL", name: "Microsoft Zofia Online (Natural)", localService: false },
    ];
    expect(pickVoice(voices, "pl-PL")?.name).toBe("Microsoft Zofia Online (Natural)");
    expect(pickVoice(voices, "en-US")?.name).toBe("Alex");
    expect(pickVoice([{ lang: "de-DE", name: "Anna" }], "pl-PL")).toBeNull();
    expect(defaultVoiceLang("pl")).toBe("pl-PL");
    expect(defaultVoiceLang("en-GB")).toBe("en-US");
  });

  it("pretty-prints OpenRouter model slugs", () => {
    expect(prettyModelName("anthropic/claude-sonnet-5.5")).toBe("Claude Sonnet 5.5");
    expect(prettyModelName("google/gemini-2.5-flash:nitro")).toBe("Gemini 2.5 Flash");
  });
});

describe("Polish agreements that contain no / nie", () => {
  it("reads whole-phrase agreements as yes, whatever the language setting", () => {
    for (const lang of [undefined, "pl-PL", "en-US"] as const) {
      expect(parseYesNo("No dobra", lang)).toBe("yes");
      expect(parseYesNo("no tak, zrób to", lang)).toBe("yes");
      expect(parseYesNo("Nie ma sprawy!", lang)).toBe("yes");
      expect(parseYesNo("czemu nie", lang)).toBe("yes");
    }
  });

  it("does not treat a bare Polish 'no' as a refusal, but keeps 'nie' and English 'no'", () => {
    expect(parseYesNo("no", "pl-PL")).toBeNull();
    expect(parseYesNo("no, nie", "pl-PL")).toBe("no");
    expect(parseYesNo("nie", "pl-PL")).toBe("no");
    expect(parseYesNo("no", "en-US")).toBe("no");
    expect(parseYesNo("no thanks")).toBe("no");
  });
});

describe("voice confirm precedence", () => {
  it("stop phrases are not read as a yes or no", () => {
    expect(isStopPhrase("koniec")).toBe(true);
    expect(parseYesNo("koniec")).toBeNull();
    expect(isStopPhrase("stop")).toBe(true);
  });
});

describe("speech never reads action JSON", () => {
  it("drops a cut-off action block", () => {
    expect(cleanForSpeech('Przygotowuję zestaw.\n```action\n[{"type":"remove_mission"')).toBe("Przygotowuję zestaw.");
  });
});
