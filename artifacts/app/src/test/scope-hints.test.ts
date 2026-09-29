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
    expect(keywordScopes("what's up")).toEqual([]);
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
});
