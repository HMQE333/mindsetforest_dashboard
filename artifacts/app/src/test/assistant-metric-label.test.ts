import { describe, expect, it } from "vitest";
import { describeAction } from "@/lib/assistant-actions";

describe("log_metric confirm line", () => {
  it("names the metric and unit instead of its id", () => {
    const names = { metric: (ref: string) => (ref === "76e9" ? { label: "Deep work", unit: "h", icon: "🧠" } : undefined) };
    expect(describeAction({ type: "log_metric", metric: "76e9", value: 0.5 }, names)).toBe("Stats · 🧠 Deep work: +0.5 h today");
  });
  it("still reads without names", () => {
    expect(describeAction({ type: "log_metric", metric: "Pushups", value: 5 })).toBe("Stats · Pushups: +5 today");
  });
});
