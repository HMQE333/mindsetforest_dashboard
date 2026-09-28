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
