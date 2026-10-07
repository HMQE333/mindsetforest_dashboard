import { describe, it, expect } from "vitest";
import { annotateHistory, keywordScopes } from "../lib/scope-hints";

describe("keywordScopes", () => {
  it("maps plain mentions and write intents to sections in Polish and English", () => {
    expect(keywordScopes("chciałbym żebyś dodał notatkę że czytałem Man's Search for Meaning")).toEqual(["archive", "library"]);
    expect(keywordScopes("save a note about the meeting")).toEqual(["archive", "calendar"]);
    // Could be a mission or a Stats entry: both sections, so both actions are offered.
    expect(keywordScopes("zrobiłem pompki")).toEqual(["dashboard", "tracker"]);
    expect(keywordScopes("włącz preset monk mode")).toEqual(["dashboard"]);
    expect(keywordScopes("Przejdź na kalendarz")).toEqual(["calendar"]);
    expect(keywordScopes("Umów wizytę u dentysty na piątek 10:00")).toEqual(["calendar"]);
    expect(keywordScopes("jestem umówiony z Kasią w środę")).toEqual(["calendar"]);
    expect(keywordScopes("schedule a call with the bank")).toEqual(["calendar"]);
    expect(keywordScopes("podpisałem umowę najmu")).toEqual([]);
    expect(keywordScopes("what's up")).toEqual([]);
  });

  it("matches words that start or end with a Polish diacritic", () => {
    expect(keywordScopes("ścieżka")).toEqual(["paths"]);
    expect(keywordScopes("Pokaż moją Ścieżkę do 10k")).toEqual(["paths"]);
    expect(keywordScopes("ile mam kroków")).toContain("tracker");
    // Still whole words only: "sen" (sleep) is not found inside "sensowny".
    expect(keywordScopes("to jest sensowny pomysł")).toEqual([]);
    expect(keywordScopes("zdrowiu szkodzi sen")).toEqual(["health"]);
  });
});

describe("annotateHistory", () => {
  it("marks applied, declined and pending actions and drops error turns", () => {
    const out = annotateHistory([
      { role: "user", content: "save a note" },
      { role: "assistant", content: "Saving it.", actions: [{ type: "add_note", title: "T", content: "C", pillars: ["mind"], tags: [] }], actionsResolved: "applied" },
      { role: "assistant", content: "Oops", error: true },
      { role: "assistant", content: "Open finance?", actions: [{ type: "navigate", module: "finance" }], actionsResolved: "dismissed" },
      { role: "assistant", content: "Tick it?", actions: [{ type: "complete_mission", title: "Read" }] },
    ]);
    expect(out).toHaveLength(4);
    expect(out[1].content).toContain("[Applied by the user, these happened: Save note to Mind: \"T\" #ainote]");
    expect(out[2].content).toContain("declined");
    expect(out[3].content).toContain("not yet confirmed");
  });

  it("records only the actions that went through as done when a batch partly failed", () => {
    const [out] = annotateHistory([
      {
        role: "assistant",
        content: "Both?",
        actions: [{ type: "complete_mission", title: "Read" }, { type: "remove_mission", title: "Walk" }],
        actionsResolved: "applied",
        actionResults: [true, false],
      },
    ]);
    expect(out.content).toContain('[Applied by the user, these happened: Mark mission done: "Read"]');
    expect(out.content).toContain('FAILED and did not happen: Remove mission: "Walk"]');
    expect(out.content).not.toMatch(/happened:[^\]]*Walk/);

    const [none] = annotateHistory([
      { role: "assistant", content: "x", actions: [{ type: "remove_mission", title: "Walk" }], actionsResolved: "applied", actionResults: [false] },
    ]);
    expect(none.content).not.toContain("these happened");
    expect(none.content).toContain("FAILED");
  });
});
