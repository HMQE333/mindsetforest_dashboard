import { afterEach, describe, expect, it, vi } from "vitest";
import { parseKnowledgeNote } from "../lib/kos-vault";
import { filterNotes, groupNotes, MODE_KEY, neighbours, readMode, saveMode } from "../components/archive/lectures/concepts";

const note = (name: string, body: string, course?: string) =>
  parseKnowledgeNote({
    path: `Knowledge/${name}.md`,
    vault: "V",
    content: `---\ntype: concept\n${course ? `course: ${course}\n` : ""}---\n# ${name}\n\n${body}\n`,
    modified_at: "2026-10-01T00:00:00Z",
  } as never);

const NOTES = [
  note("Żółw", "Zwierzę wolne.", "Biologia"),
  note("Entropia", "Miara nieporządku.", "Fizyka"),
  note("Abak", "Liczydło."),
  note("Atom", "Najmniejsza część pierwiastka.", "Fizyka"),
];

describe("Pojęcia helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("folds diacritics and needs every word", () => {
    expect(filterNotes(NOTES, "zolw").map((n) => n.name)).toEqual(["Żółw"]);
    expect(filterNotes(NOTES, "fizyka miara").map((n) => n.name)).toEqual(["Entropia"]);
    expect(filterNotes(NOTES, "  ")).toBe(NOTES);
  });

  it("groups by course alphabetically with Inne last, titles sorted", () => {
    const g = groupNotes(NOTES);
    expect(g.map((x) => x.course)).toEqual(["Biologia", "Fizyka", "Inne"]);
    expect(g[1].notes.map((n) => n.name)).toEqual(["Atom", "Entropia"]);
  });

  it("finds neighbours in the shown order", () => {
    const order = groupNotes(NOTES).flatMap((g) => g.notes);
    expect(neighbours(order, "atom")).toEqual({ prev: order[0], next: order[2] });
    expect(neighbours(order, "Abak").next).toBeNull();
    expect(neighbours(order, "nope")).toEqual({ prev: null, next: null });
  });

  it("remembers the view, and survives blocked storage", () => {
    const m = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) });
    expect(readMode()).toBe("lectures");
    saveMode("concepts");
    expect(localStorage.getItem(MODE_KEY)).toBe("concepts");
    expect(readMode()).toBe("concepts");
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(readMode()).toBe("lectures");
    expect(() => saveMode("concepts")).not.toThrow();
  });
});
