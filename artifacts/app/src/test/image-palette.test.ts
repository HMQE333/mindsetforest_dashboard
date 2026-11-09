import { describe, expect, it } from "vitest";
import { hueName, huesOf, paletteFromPixels } from "@/lib/image-palette";

const px = (...cols: [number, number, number, number][]) => cols.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat());

describe("hueName", () => {
  it("names the colours a person would", () => {
    expect(hueName(230, 30, 30)).toBe("red");
    expect(hueName(30, 90, 220)).toBe("blue");
    expect(hueName(40, 160, 60)).toBe("green");
    expect(hueName(250, 220, 40)).toBe("yellow");
    expect(hueName(245, 140, 20)).toBe("orange");
    expect(hueName(120, 70, 35)).toBe("brown");
    expect(hueName(10, 10, 10)).toBe("black");
    expect(hueName(250, 250, 250)).toBe("white");
    expect(hueName(128, 128, 128)).toBe("gray");
    expect(hueName(140, 60, 200)).toBe("purple");
    expect(hueName(235, 70, 150)).toBe("pink");
  });
});

describe("paletteFromPixels", () => {
  it("gives the main colours biggest first with their share", () => {
    const p = paletteFromPixels(px([230, 30, 30, 70], [30, 90, 220, 30]));
    expect(p.map((c) => c.hue)).toEqual(["red", "blue"]);
    expect(p[0].share).toBeCloseTo(0.7);
    expect(p[0].hex).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("folds near shades together and skips transparent pixels", () => {
    const p = paletteFromPixels([...px([230, 30, 30, 50], [225, 35, 28, 50]), 0, 0, 255, 0]);
    expect(p).toHaveLength(1);
    expect(p[0].share).toBe(1);
  });
  it("is empty for an empty picture", () => expect(paletteFromPixels([])).toEqual([]));
});

describe("huesOf", () => {
  it("keeps colours that cover a real part", () => {
    expect(huesOf([{ hex: "#ff0000", share: 0.6, hue: "red" }, { hex: "#0000ff", share: 0.35, hue: "blue" }, { hex: "#00ff00", share: 0.05, hue: "green" }])).toEqual(["red", "blue"]);
  });
});
