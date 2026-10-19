import { describe, it, expect } from "vitest";
import { isShortcutKey, isTypingTarget } from "../components/archive/keyboard";

/** A stand-in for a DOM element: just what the checks read. */
function el(tagName: string, opts: { type?: string; editable?: boolean; inside?: string[] } = {}) {
  return {
    tagName,
    type: opts.type,
    isContentEditable: !!opts.editable,
    closest: (selector: string) => ((opts.inside ?? []).some((s) => selector.includes(s)) ? {} : null),
  } as unknown as EventTarget;
}

function key(target: EventTarget | null, over: Partial<KeyboardEvent> = {}) {
  return { key: " ", target, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...over } as KeyboardEvent;
}

describe("isTypingTarget", () => {
  it("is true in text fields, text areas, selects and contenteditables", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", { editable: true }))).toBe(true);
    expect(isTypingTarget(el("SPAN", { inside: ['[role="textbox"]'] }))).toBe(true);
  });

  it("is false on buttons, checkboxes and the page itself", () => {
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("DIV"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe("isShortcutKey", () => {
  it("takes a plain key on the page", () => {
    expect(isShortcutKey(key(el("BODY")))).toBe(true);
  });

  it("leaves a Space typed into the Library search alone (the Digest bug)", () => {
    expect(isShortcutKey(key(el("INPUT", { type: "text" })))).toBe(false);
    expect(isShortcutKey(key(el("INPUT"), { key: "1" }))).toBe(false);
  });

  it("leaves keys with a modifier, mid-composition or already handled alone", () => {
    expect(isShortcutKey(key(el("BODY"), { ctrlKey: true }))).toBe(false);
    expect(isShortcutKey(key(el("BODY"), { metaKey: true }))).toBe(false);
    expect(isShortcutKey(key(el("BODY"), { altKey: true }))).toBe(false);
    expect(isShortcutKey(key(el("BODY"), { isComposing: true }))).toBe(false);
    expect(isShortcutKey(key(el("BODY"), { defaultPrevented: true }))).toBe(false);
  });
});
