import { describe, expect, it } from "vitest";
import { boxContents, moveTo, parseIngredients, readBoxes, setCount } from "@/lib/recipe-boxes";

describe("recipe boxes", () => {
  const ings = parseIngredients("Sauce:\n- 2 cloves garlic\n* 1 onion\n\n1. 200 g rice\n2) salt\n- salt");
  it("reads ingredient lines, skips headings and blanks, keeps duplicates apart", () => {
    expect(ings.map((i) => i.text)).toEqual(["2 cloves garlic", "1 onion", "200 g rice", "salt", "salt"]);
    expect(ings[4].key).toBe("salt#2");
  });
  it("puts ingredients in boxes and back", () => {
    let b = readBoxes(null);
    b = moveTo(b, ings[0].key, 0);
    b = moveTo(b, ings[2].key, 2);
    const c = boxContents(ings, b);
    expect(c.boxes[0].map((i) => i.text)).toEqual(["2 cloves garlic"]);
    expect(c.boxes[2].map((i) => i.text)).toEqual(["200 g rice"]);
    expect(c.loose).toHaveLength(3);
    expect(boxContents(ings, moveTo(b, ings[0].key, null)).boxes[0]).toEqual([]);
  });
  it("fewer boxes sends the removed box's things back to the table", () => {
    const b = setCount(moveTo(readBoxes(null), ings[1].key, 3), 3);
    expect(b.count).toBe(3);
    expect(boxContents(ings, b).loose.map((i) => i.text)).toContain("1 onion");
  });
  it("cleans stored JSON", () => {
    expect(readBoxes({ count: 9, assign: { a: 7, b: 1 } })).toEqual({ count: 6, labels: [], assign: { b: 1 } });
  });
});
