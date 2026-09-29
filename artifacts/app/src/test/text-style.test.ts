import { describe, it, expect } from "vitest";
import { replaceDashes, replaceDashesDeep } from "../lib/text-style";

describe("replaceDashes", () => {
  it("turns em dashes and spaced en dashes into arrows, keeps ranges", () => {
    expect(replaceDashes("Zapisuję notatkę — czytałeś książkę")).toBe("Zapisuję notatkę → czytałeś książkę");
    expect(replaceDashes("Krok 1—opis")).toBe("Krok 1 → opis");
    expect(replaceDashes("Plan – wersja 2")).toBe("Plan → wersja 2");
    expect(replaceDashes("20–30 min")).toBe("20–30 min");
    expect(replaceDashes("bez zmian - zwykły minus")).toBe("bez zmian - zwykły minus");
    expect(replaceDashes("")).toBe("");
  });

  it("walks nested objects and arrays", () => {
    const out = replaceDashesDeep({ steps: [{ title: "A — B", xp: 10 }], diagnosis: "x — y", n: null });
    expect(out).toEqual({ steps: [{ title: "A → B", xp: 10 }], diagnosis: "x → y", n: null });
  });
});
