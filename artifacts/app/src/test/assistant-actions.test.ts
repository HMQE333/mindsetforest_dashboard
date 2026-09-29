import { describe, it, expect } from "vitest";
import { parseActions, describeAction, buildActionInstructions, ACTION_SCOPE } from "../lib/assistant-actions";

const block = (json: unknown) => `Sure.\n\`\`\`action\n${JSON.stringify(json)}\n\`\`\``;

describe("assistant apply_preset action", () => {
  it("parses apply_preset when the dashboard scope is granted", () => {
    const { text, actions } = parseActions(block([{ type: "apply_preset", presetName: "  Monk mode " }]), ["dashboard"]);
    expect(text).toBe("Sure.");
    expect(actions).toEqual([{ type: "apply_preset", presetName: "Monk mode" }]);
  });

  it("drops apply_preset without the dashboard scope or without a name", () => {
    expect(parseActions(block([{ type: "apply_preset", presetName: "Monk mode" }]), ["archive"]).actions).toEqual([]);
    expect(parseActions(block([{ type: "apply_preset", presetName: "" }]), ["dashboard"]).actions).toEqual([]);
    expect(parseActions(block([{ type: "apply_preset" }]), ["dashboard"]).actions).toEqual([]);
  });

  it("caps the preset name and describes the action for the confirm card", () => {
    const { actions } = parseActions(block([{ type: "apply_preset", presetName: "x".repeat(100) }]), ["dashboard"]);
    expect(actions[0].type === "apply_preset" && actions[0].presetName.length).toBe(60);
    expect(describeAction({ type: "apply_preset", presetName: "Lock in" })).toContain('"Lock in"');
    expect(ACTION_SCOPE.apply_preset).toBe("dashboard");
  });

  it("only advertises apply_preset in the dashboard instructions", () => {
    expect(buildActionInstructions(["dashboard"])).toContain("apply_preset");
    expect(buildActionInstructions(["planning"])).not.toContain("apply_preset");
  });
});

describe("assistant navigate and complete_mission actions", () => {
  it("navigate is allowed under any scope and rejects unknown modules", () => {
    expect(parseActions(block([{ type: "navigate", module: "Finance" }]), []).actions).toEqual([{ type: "navigate", module: "finance" }]);
    expect(parseActions(block([{ type: "navigate", module: "mars" }]), ["dashboard"]).actions).toEqual([]);
    expect(ACTION_SCOPE.navigate).toBeNull();
    expect(describeAction({ type: "navigate", module: "tracker" })).toBe("Open Stats");
  });

  it("complete_mission needs the dashboard scope and a title", () => {
    const parsed = parseActions(block([{ type: "complete_mission", title: " 50 pushups ", categoryId: "body" }]), ["dashboard"]);
    expect(parsed.actions).toEqual([{ type: "complete_mission", title: "50 pushups", categoryId: "body" }]);
    expect(parseActions(block([{ type: "complete_mission", title: "x" }]), ["archive"]).actions).toEqual([]);
    expect(parseActions(block([{ type: "complete_mission" }]), ["dashboard"]).actions).toEqual([]);
    expect(describeAction({ type: "complete_mission", title: "Read" })).toContain('"Read"');
  });

  it("always advertises navigate and only advertises complete_mission with the dashboard", () => {
    expect(buildActionInstructions([])).toContain("navigate");
    expect(buildActionInstructions(["archive"])).not.toContain("complete_mission");
    expect(buildActionInstructions(["dashboard"])).toContain("complete_mission");
  });
});

describe("assistant control actions", () => {
  const all = ["dashboard", "tracker", "paths", "planning", "calendar", "finance"] as const;
  const one = (a: unknown) => parseActions(block([a]), [...all]).actions;

  it("parses UI actions under any scope and auto-applies only the harmless ones", async () => {
    const { isAutoApply } = await import("../lib/assistant-actions");
    expect(parseActions(block([{ type: "open_settings", tab: "theme" }]), []).actions).toEqual([{ type: "open_settings", tab: "theme" }]);
    expect(parseActions(block([{ type: "set_theme", theme: "OLED" }]), []).actions).toEqual([{ type: "set_theme", theme: "oled", accent: undefined }]);
    expect(one({ type: "set_theme", theme: "rainbow" })).toEqual([]);
    expect(one({ type: "open_settings", tab: "nope" })).toEqual([]);
    expect(isAutoApply({ type: "set_theme", theme: "oled" })).toBe(true);
    expect(isAutoApply({ type: "toggle_module", module: "finance", enabled: false })).toBe(false);
    expect(one({ type: "toggle_module", module: "dashboard", enabled: false })).toEqual([]);
  });

  it("validates mission edits and needs at least one change", () => {
    expect(one({ type: "edit_mission", title: "Read", xp: "25" })).toEqual([
      { type: "edit_mission", title: "Read", categoryId: undefined, newTitle: undefined, description: undefined, duration: undefined, xp: 25 },
    ]);
    expect(one({ type: "edit_mission", title: "Read" })).toEqual([]);
    expect(one({ type: "uncomplete_mission", title: "Read" })[0]).toMatchObject({ type: "uncomplete_mission", title: "Read" });
    expect(parseActions(block([{ type: "remove_mission", title: "Read" }]), ["archive"]).actions).toEqual([]);
  });

  it("checks numbers, dates and kinds on data entry", () => {
    expect(one({ type: "log_metric", metric: "reading", value: "30" })).toEqual([{ type: "log_metric", metric: "reading", value: 30 }]);
    expect(one({ type: "log_metric", metric: "reading", value: -3 })).toEqual([]);
    expect(one({ type: "add_event", title: "Dentist", date: "2026-10-02", time: "9:30" })[0]).toMatchObject({ date: "2026-10-02", time: "9:30" });
    expect(one({ type: "add_event", title: "Dentist", date: "jutro" })).toEqual([]);
    expect(one({ type: "add_transaction", kind: "expense", amount: 42.5, title: "Groceries" })[0]).toMatchObject({ kind: "expense", amount: 42.5 });
    expect(one({ type: "add_transaction", kind: "gift", amount: 5, title: "x" })).toEqual([]);
  });

  it("builds a new path with clamped steps and shows them on the confirm card", async () => {
    const { mindmapPreview } = await import("../lib/assistant-actions");
    const [a] = one({ type: "create_path", name: "Run a 10k", diagnosis: "No base", steps: [{ title: "Run 3x a week", days: 12 }, { title: "Race" }, { nope: 1 }] });
    expect(a).toMatchObject({ type: "create_path", name: "Run a 10k", diagnosis: "No base" });
    expect(a.type === "create_path" && a.steps).toEqual([
      { title: "Run 3x a week", stage: null, days: 12, xp: undefined },
      { title: "Race", stage: null, days: 1, xp: undefined },
    ]);
    expect(mindmapPreview(a)).toContain("x12 days");
    expect(describeAction(a)).toContain("2 steps");
  });

  it("only offers each action with its section", () => {
    expect(buildActionInstructions(["tracker"])).toContain("log_metric");
    expect(buildActionInstructions(["tracker"])).not.toContain("add_transaction");
    expect(buildActionInstructions(["finance"])).toContain("add_transaction");
    expect(buildActionInstructions([])).toContain("open_settings");
    expect(buildActionInstructions(["paths"])).toContain("create_path");
  });
});

describe("action blocks in replies", () => {
  it("hides the action block while streaming, including a half-typed fence", async () => {
    const { visibleReplyText } = await import("../lib/assistant-actions");
    expect(visibleReplyText('Robię to.\n```action\n[{"type":"navigate"')).toBe("Robię to.");
    expect(visibleReplyText("Robię to.\n``")).toBe("Robię to.");
    expect(visibleReplyText("Robię to.\n```act")).toBe("Robię to.");
    expect(visibleReplyText("Zwykła odpowiedź")).toBe("Zwykła odpowiedź");
  });

  it("strips a cut-off block instead of showing JSON and flags it", () => {
    const r = parseActions('Przygotowuję zestaw.\n```action\n[{"type":"remove_mission","title":"Read 20', ["dashboard"]);
    expect(r.text).toBe("Przygotowuję zestaw.");
    expect(r.actions).toEqual([]);
    expect(r.broken).toBe(true);
  });

  it("keeps prose after a closed block", () => {
    const r = parseActions('Jasne.\n```action\n[{"type":"navigate","module":"paths"}]\n```\nGotowe?', []);
    expect(r.text).toBe("Jasne.\n\nGotowe?");
    expect(r.actions).toEqual([{ type: "navigate", module: "paths" }]);
    expect(r.broken).toBeUndefined();
  });

  it("parses create_preset, drops unknown categories and previews it per pillar", async () => {
    const { mindmapPreview } = await import("../lib/assistant-actions");
    const [a] = parseActions(block([{
      type: "create_preset",
      name: "Balanced day",
      emoji: "⚖️",
      missions: { mind: [{ title: "Read 20 pages", xp: 15 }], body: [{ title: "Walk", xp: "10", duration: "30 min" }], mars: [{ title: "x" }] },
      apply: true,
    }]), ["dashboard"]).actions;
    expect(a).toMatchObject({ type: "create_preset", name: "Balanced day", apply: true });
    expect(a.type === "create_preset" && Object.keys(a.missions)).toEqual(["mind", "body"]);
    expect(describeAction(a)).toContain("2 missions");
    expect(mindmapPreview(a)).toContain("Read 20 pages (+15)");
    expect(parseActions(block([{ type: "create_preset", name: "Empty", missions: {} }]), ["dashboard"]).actions).toEqual([]);
  });
});

describe("assistant add_book action", () => {
  it("adds books with no scope granted, cleaning each entry", () => {
    const { actions } = parseActions(block([{
      type: "add_book",
      books: [
        { title: " Storyworthy ", author: "Matthew Dicks", status: "reading", totalPages: "304", tags: ["Story", " "] },
        { title: "" },
        { title: "Deep Work", status: "someday" },
      ],
    }]), []);
    expect(actions).toEqual([{
      type: "add_book",
      books: [
        { title: "Storyworthy", author: "Matthew Dicks", status: "reading", totalPages: 304, tags: ["story"], notes: undefined },
        { title: "Deep Work", author: undefined, status: "to-read", totalPages: undefined, tags: undefined, notes: undefined },
      ],
    }]);
  });

  it("accepts a single book at the top level and says what it will add", () => {
    const { actions } = parseActions(block([{ type: "add_book", title: "Traction", author: "Gabriel Weinberg" }]), []);
    expect(describeAction(actions[0])).toBe('Add book "Traction" (Gabriel Weinberg)');
    const many = parseActions(block([{ type: "add_book", books: ["A", "B", "C", "D"].map((title) => ({ title })) }]), []).actions[0];
    expect(describeAction(many)).toBe('Add 4 books: "A", "B", "C" +1 more');
    expect(ACTION_SCOPE.add_book).toBeNull();
    expect(buildActionInstructions([])).toContain("- add_book:");
  });

  it("drops an add_book with no usable title", () => {
    expect(parseActions(block([{ type: "add_book", books: [{ author: "Nobody" }] }]), []).actions).toEqual([]);
  });
});
