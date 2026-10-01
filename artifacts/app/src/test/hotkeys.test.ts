import { describe, it, expect } from "vitest";
import { comboFromEvent, DEFAULT_HOTKEYS, formatHotkey, hotkeyDiffs, hotkeyProblem, matchesHotkey, resolveHotkeys } from "../lib/hotkeys";

const ev = (code: string, mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe("comboFromEvent", () => {
  it("reads the key from the code, not the layout", () => {
    expect(comboFromEvent(ev("KeyK", { ctrl: true, shift: true }))).toBe("ctrl+shift+k");
    expect(comboFromEvent(ev("KeyC", { alt: true }))).toBe("alt+c");
    expect(comboFromEvent(ev("Enter", { meta: true }))).toBe("ctrl+enter");
    expect(comboFromEvent(ev("Digit3", { alt: true, shift: true }))).toBe("alt+shift+3");
    expect(comboFromEvent(ev("F9"))).toBe("f9");
  });

  it("waits while only modifiers are held", () => {
    expect(comboFromEvent(ev("ShiftLeft", { shift: true }))).toBeNull();
    expect(comboFromEvent(ev("ControlLeft", { ctrl: true }))).toBeNull();
    expect(comboFromEvent(ev("Comma", { ctrl: true }))).toBeNull();
  });

  it("matches only the exact combo", () => {
    expect(matchesHotkey(ev("KeyK", { ctrl: true, shift: true }), "ctrl+shift+k")).toBe(true);
    expect(matchesHotkey(ev("KeyK", { ctrl: true }), "ctrl+shift+k")).toBe(false);
    expect(matchesHotkey(ev("KeyK", { ctrl: true, shift: true }), "")).toBe(false);
  });
});

describe("resolve and diff", () => {
  it("lays the user's choices over the defaults", () => {
    const map = resolveHotkeys({ quickCapture: "alt+q", toggleAssistant: "alt+a", junk: "x" } as never);
    expect(map.quickCapture).toBe("alt+q");
    expect(map.toggleAssistant).toBe("alt+a");
    expect(map.inboxSave).toBe("ctrl+enter");
    expect("junk" in map).toBe(false);
    expect(hotkeyDiffs(map)).toEqual({ quickCapture: "alt+q", toggleAssistant: "alt+a" });
    expect(hotkeyDiffs(resolveHotkeys(null))).toBeNull();
  });

  it("formats for display", () => {
    expect(formatHotkey("ctrl+shift+k")).toBe("Ctrl+Shift+K");
    expect(formatHotkey("ctrl+enter")).toBe("Ctrl+Enter");
    expect(formatHotkey("")).toBe("Not set");
  });
});

describe("hotkeyProblem", () => {
  const map = { ...DEFAULT_HOTKEYS };

  it("accepts sensible combos and an empty one", () => {
    expect(hotkeyProblem("toggleAssistant", "alt+shift+a", map)).toBeNull();
    expect(hotkeyProblem("goHome", "f2", map)).toBeNull();
    expect(hotkeyProblem("toggleAssistant", "", map)).toBeNull();
  });

  it("refuses what would break typing or the browser", () => {
    expect(hotkeyProblem("toggleAssistant", "ctrl+alt+s", map)).toMatch(/AltGr/);
    expect(hotkeyProblem("toggleAssistant", "a", map)).toMatch(/Add Ctrl/);
    expect(hotkeyProblem("toggleAssistant", "shift+a", map)).toMatch(/capitals/);
    expect(hotkeyProblem("toggleAssistant", "ctrl+w", map)).toMatch(/browser/);
    expect(hotkeyProblem("toggleAssistant", "ctrl+c", map)).toMatch(/copy/);
    expect(hotkeyProblem("trackerCapture", "f8", map)).toMatch(/Add Ctrl/);
    expect(hotkeyProblem("trackerCapture", "alt+shift+enter", map)).toMatch(/letter/);
  });

  it("refuses a combo another action already has", () => {
    expect(hotkeyProblem("toggleAssistant", "ctrl+shift+k", map)).toBe('Already used by "Quick Capture".');
    expect(hotkeyProblem("quickCapture", "ctrl+shift+k", map)).toBeNull();
  });
});
