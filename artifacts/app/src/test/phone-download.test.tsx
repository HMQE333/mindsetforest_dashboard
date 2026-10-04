import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PhoneDownload from "../components/tracker/PhoneDownload";
import { deviceLabel } from "../components/tracker/computer-time-shared";

describe("deviceLabel", () => {
  it("names the phone by its model and shortens a computer's random id", () => {
    expect(deviceLabel("android:Pixel 8:1a2b3c4d5e6f")).toBe("📱 Pixel 8");
    expect(deviceLabel("android::x")).toBe("📱 Telefon");
    expect(deviceLabel("3f2a1b9c-1111-2222-3333-444455556666")).toBe("💻 3f2a1b9c…");
  });
});

describe("PhoneDownload", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("on Android, links the app to this database and falls back to the APK", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8)" });
    const html = renderToStaticMarkup(<PhoneDownload />);
    const href = /href="(intent:[^"]+)"/.exec(html)?.[1].replace(/&amp;/g, "&");
    expect(href).toBe(
      "intent://setup?url=https%3A%2F%2Fabc.supabase.co&key=sb_publishable_x" +
        "#Intent;scheme=mindsetforest;package=app.mindsetforest.phone;S.browser_fallback_url=%2Fdownloads%2Fmindsetforest-phone.apk;end",
    );
    expect(html).toContain('href="/downloads/mindsetforest-phone.apk"');
  });

  it("elsewhere, says to open the page on the phone", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    const html = renderToStaticMarkup(<PhoneDownload />);
    expect(html).not.toContain("intent:");
    expect(html).toContain("Otwórz tę stronę na telefonie");
  });
});
