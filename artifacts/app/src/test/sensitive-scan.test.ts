import { describe, expect, it } from "vitest";
import { scanSensitive } from "@/lib/sensitive-scan";

describe("scanSensitive", () => {
  it("finds logins and passwords", () => {
    expect(scanSensitive("Konto bank\nlogin: jan123\nhasło: Tajne!2024")).toEqual(["login"]);
    expect(scanSensitive("wifi password: kot-na-plocie")).toEqual(["password"]);
    expect(scanSensitive("jan@example.com:Sup3rSecret")).toEqual(["login"]);
  });
  it("finds keys, cards, IBANs and recovery codes", () => {
    expect(scanSensitive("OPENAI sk-proj-abcdefghijklmnopqrstuvwxyz123456")).toContain("key");
    expect(scanSensitive("-----BEGIN OPENSSH PRIVATE KEY-----\nabc")).toContain("key");
    expect(scanSensitive("karta 4111 1111 1111 1111 exp 12/29")).toContain("card");
    expect(scanSensitive("PL61 1090 1014 0000 0712 1981 2874")).toContain("bank");
    expect(scanSensitive("Google backup codes: 1234 5678")).toContain("recovery");
  });
  it("leaves ordinary notes alone", () => {
    expect(scanSensitive("The password manager idea: use Bitwarden for everything.")).toEqual([]);
    expect(scanSensitive("Read 40 pages, phone 600 700 800, order 1234567890123")).toEqual([]);
    expect(scanSensitive("https://example.com/watch?v=abc and a #tag")).toEqual([]);
  });
});
