import { describe, it, expect } from "vitest";
import { robotSignal, ROBOT_SEGMENTS } from "../lib/assistant-robot";

const u = (id: string) => ({ id, role: "user" as const });
const a = (id: string, extra: Record<string, unknown> = {}) => ({ id, role: "assistant" as const, ...extra });

describe("robotSignal", () => {
  it("thinks while an answer is on its way, and reacts to nothing yet", () => {
    expect(robotSignal([u("1"), a("2", { error: true })], true)).toEqual({ mood: "thinking", reaction: null });
    expect(robotSignal([], false, true).mood).toBe("thinking");
    expect(robotSignal([], false)).toEqual({ mood: "idle", reaction: null });
  });

  it("raises an alert for changes waiting to be confirmed", () => {
    expect(robotSignal([u("1"), a("2", { actions: [{}] })], false).reaction).toEqual({ kind: "alert", key: "2:pending" });
  });

  it("nods when the changes went through and shakes when they did not", () => {
    expect(robotSignal([a("2", { actions: [{}], actionsResolved: "applied", actionResults: [true] })], false).reaction?.kind).toBe("yes");
    expect(robotSignal([a("2", { actions: [{}, {}], actionsResolved: "applied", actionResults: [true, false] })], false).reaction?.kind).toBe("no");
    expect(robotSignal([a("2", { actions: [{}], actionsResolved: "dismissed" })], false).reaction?.kind).toBe("no");
    expect(robotSignal([a("2", { actions: [{}], actionsResolved: "applied" })], false).reaction?.kind).toBe("yes");
  });

  it("shakes its head at an error and stays quiet after a plain answer", () => {
    expect(robotSignal([u("1"), a("2", { error: true })], false).reaction).toEqual({ kind: "no", key: "2:error" });
    expect(robotSignal([u("1"), a("2")], false).reaction).toBeNull();
  });

  it("gives every state a segment inside the timeline", () => {
    for (const [s, e] of Object.values(ROBOT_SEGMENTS)) expect(0 <= s && s < e && e <= 480).toBe(true);
  });
});
