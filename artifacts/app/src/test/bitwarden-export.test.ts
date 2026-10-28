import { describe, expect, it } from "vitest";
import { noteToItems, parseLoginLine, toBitwardenCsv } from "@/lib/bitwarden-export";

describe("bitwarden export", () => {
  it("reads the shapes he writes", () => {
    expect(parseLoginLine("jan@mail.com:Secr3t! netflix")).toMatchObject({ name: "netflix", username: "jan@mail.com", password: "Secr3t!" });
    expect(parseLoginLine("Spotify jan@mail.com:abcd1234")).toMatchObject({ name: "Spotify", username: "jan@mail.com", password: "abcd1234" });
    expect(parseLoginLine("github.com | janek | p@ss:word")).toMatchObject({ name: "github.com", uri: "https://github.com", username: "janek", password: "p@ss:word" });
    expect(parseLoginLine("meeting at 12:30 tomorrow")).toBeNull();
    expect(parseLoginLine("see https://example.com/a:b")).toBeNull();
  });
  it("label notes become one login; the rest a secure note", () => {
    expect(noteToItems("Bank", "login: jan\nhasło: x y z")[0]).toMatchObject({ type: "login", name: "Bank", username: "jan", password: "x y z" });
    expect(noteToItems("Keys", "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa")[0]).toMatchObject({ type: "note", name: "Keys" });
    expect(noteToItems("L", "a@b.com:pass1 x\nc@d.com:pass2 y")).toHaveLength(2);
  });
  it("writes valid CSV", () => {
    const csv = toBitwardenCsv([{ type: "login", name: 'A, "B"', username: "u", password: "p,1" }]);
    expect(csv.split("\n")[1]).toBe('MindsetForest,,login,"A, ""B""",,,0,,u,"p,1",');
  });
});
