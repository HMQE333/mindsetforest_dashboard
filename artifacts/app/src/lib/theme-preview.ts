import type { AccentColor, CardStyle, FontPair, FrameStyle, ThemeMode } from "@/hooks/useUserSettings";

/**
 * The theme's CSS variables, applied to the page. Lives apart from the
 * Settings ThemeTab so the settings hook (loaded with the app shell) can apply
 * the saved theme without pulling the whole Settings screen into the first load.
 */

export const ACCENTS: { id: AccentColor; label: string; hue: number; sat: number; light: number }[] = [
  { id: "purple", label: "Amethyst", hue: 263, sat: 70, light: 58 },
  { id: "blue", label: "Sapphire", hue: 217, sat: 91, light: 60 },
  { id: "cyan", label: "Aqua", hue: 189, sat: 94, light: 43 },
  { id: "green", label: "Emerald", hue: 152, sat: 76, light: 45 },
  { id: "gold", label: "Gold", hue: 45, sat: 93, light: 47 },
  { id: "orange", label: "Flame", hue: 25, sat: 95, light: 53 },
  { id: "red", label: "Ruby", hue: 0, sat: 72, light: 51 },
  { id: "pink", label: "Rose", hue: 330, sat: 81, light: 60 },
];

export const FONT_PAIRS: { id: FontPair; label: string; display: string; body: string; preview: string; googleImport: string }[] = [
  { id: "default", label: "Default", display: "Inter", body: "Inter", preview: "Clean & modern", googleImport: "" },
  { id: "mono", label: "Mono", display: "JetBrains Mono", body: "JetBrains Mono", preview: "Terminal vibes", googleImport: "" },
  { id: "editorial", label: "Editorial", display: "Playfair Display", body: "Inter", preview: "Classic & refined", googleImport: "family=Playfair+Display:wght@400;600;700;800;900" },
  { id: "geometric", label: "Geometric", display: "Space Grotesk", body: "Space Grotesk", preview: "Bold & technical", googleImport: "family=Space+Grotesk:wght@300;400;500;600;700" },
  { id: "handcraft", label: "Handcraft", display: "Caveat", body: "Inter", preview: "Personal touch", googleImport: "family=Caveat:wght@400;500;600;700" },
  { id: "clean", label: "Clean", display: "DM Sans", body: "DM Sans", preview: "Polished & soft", googleImport: "family=DM+Sans:wght@300;400;500;600;700" },
];

const ACCENTS_MAP: Record<AccentColor, { hue: number; sat: number; light: number }> = Object.fromEntries(
  ACCENTS.map(a => [a.id, { hue: a.hue, sat: a.sat, light: a.light }])
) as any;

/** Apply theme + accent + frame + font to CSS variables immediately (live preview) */
export function applyThemePreview(theme: ThemeMode, accent: AccentColor, frame: FrameStyle = "default", font: FontPair = "default", cardStyle: CardStyle = "default", customAccentHue?: number | null, borderRadius?: number, cardOpacity?: number) {
  const root = document.documentElement;
  
  // Use custom hue if set, otherwise use preset accent
  const a = ACCENTS_MAP[accent] || ACCENTS_MAP.purple;
  const h = customAccentHue != null ? customAccentHue : a.hue;
  const s = customAccentHue != null ? 70 : a.sat;
  const l = customAccentHue != null ? 58 : a.light;

  root.style.setProperty("--primary", `${h} ${s}% ${l}%`);
  root.style.setProperty("--ring", `${h} ${s}% ${l}%`);
  root.style.setProperty("--accent", `${h} ${Math.max(s - 20, 30)}% ${Math.max(l - 33, 12)}%`);
  root.style.setProperty("--accent-foreground", `${h} ${Math.min(s + 20, 100)}% ${Math.min(l + 27, 90)}%`);
  root.style.setProperty("--glow-purple", `${h} ${s}% ${l}%`);
  root.style.setProperty("--glow-pink", `${(h + 29) % 360} ${Math.min(s + 14, 100)}% ${Math.min(l + 3, 80)}%`);
  root.style.setProperty("--xp-gradient-from", `${h} ${s}% ${l}%`);
  root.style.setProperty("--xp-gradient-to", `${(h + 29) % 360} ${Math.min(s + 14, 100)}% ${Math.min(l + 3, 80)}%`);
  root.style.setProperty("--sidebar-primary", `${h} ${s}% ${l}%`);
  root.style.setProperty("--sidebar-ring", `${h} ${s}% ${l}%`);

  // Border radius
  if (borderRadius != null) {
    root.style.setProperty("--radius", `${borderRadius}px`);
  }

  // Card opacity
  if (cardOpacity != null) {
    root.style.setProperty("--card-opacity", `${cardOpacity}`);
  }

  // Apply font pair
  const fp = FONT_PAIRS.find(f => f.id === font) || FONT_PAIRS[0];
  if (fp.googleImport) {
    const linkId = "google-fonts-custom";
    let link = document.getElementById(linkId) as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?${fp.googleImport}&display=swap`;
  }
  // Fluent Emoji after the text font, as in index.css: Windows 11 emoji with any font pair.
  document.body.style.fontFamily = `'${fp.body}', 'Fluent Emoji Color', system-ui, -apple-system, sans-serif`;
  root.style.setProperty("--font-display", `'${fp.display}', 'Fluent Emoji Color'`);

  const setDarkVars = (bg: string, fg: string, card: string, cardFg: string, sec: string, secFg: string, mut: string, mutFg: string, brd: string, glass: string) => {
    root.style.setProperty("--background", bg);
    root.style.setProperty("--foreground", fg);
    root.style.setProperty("--card", card);
    root.style.setProperty("--card-foreground", cardFg);
    root.style.setProperty("--popover", card);
    root.style.setProperty("--popover-foreground", cardFg);
    root.style.setProperty("--secondary", sec);
    root.style.setProperty("--secondary-foreground", secFg);
    root.style.setProperty("--muted", mut);
    root.style.setProperty("--muted-foreground", mutFg);
    root.style.setProperty("--border", brd);
    root.style.setProperty("--input", brd);
    root.style.setProperty("--glass", glass);
    root.style.setProperty("--glass-border", "0 0% 100%");
    root.style.setProperty("--primary-foreground", "0 0% 100%");
    root.style.setProperty("--destructive-foreground", "0 0% 100%");
    root.classList.remove("light-theme");
  };

  const setLightVars = (bg: string, fg: string, card: string, cardFg: string, sec: string, secFg: string, mut: string, mutFg: string, brd: string, glass: string, glassBorder: string) => {
    root.style.setProperty("--background", bg);
    root.style.setProperty("--foreground", fg);
    root.style.setProperty("--card", card);
    root.style.setProperty("--card-foreground", cardFg);
    root.style.setProperty("--popover", card);
    root.style.setProperty("--popover-foreground", cardFg);
    root.style.setProperty("--secondary", sec);
    root.style.setProperty("--secondary-foreground", secFg);
    root.style.setProperty("--muted", mut);
    root.style.setProperty("--muted-foreground", mutFg);
    root.style.setProperty("--border", brd);
    root.style.setProperty("--input", brd);
    root.style.setProperty("--glass", glass);
    root.style.setProperty("--glass-border", glassBorder);
    root.style.setProperty("--primary-foreground", "0 0% 100%");
    root.style.setProperty("--destructive-foreground", "0 0% 100%");
    root.classList.add("light-theme");
  };

  switch (theme) {
    case "dark":
      setDarkVars("230 25% 4%", "220 20% 95%", "230 20% 7%", "220 20% 95%", "230 15% 14%", "220 20% 90%", "230 15% 12%", "220 10% 55%", "230 15% 15%", "230 20% 7%");
      break;
    case "oled":
      setDarkVars("0 0% 0%", "220 20% 95%", "0 0% 4%", "220 20% 95%", "0 0% 8%", "220 20% 90%", "0 0% 6%", "220 10% 50%", "0 0% 10%", "0 0% 4%");
      break;
    case "midnight":
      setDarkVars("222 47% 5%", "213 31% 91%", "222 40% 8%", "213 31% 91%", "222 30% 14%", "213 25% 88%", "222 30% 11%", "215 15% 50%", "222 25% 15%", "222 40% 8%");
      break;
    case "forest":
      setDarkVars("140 30% 4%", "130 20% 92%", "145 25% 7%", "130 20% 92%", "140 18% 13%", "130 20% 88%", "142 20% 10%", "135 12% 48%", "140 18% 14%", "145 25% 7%");
      break;
    case "crimson":
      setDarkVars("350 30% 4%", "350 15% 93%", "350 22% 7%", "350 15% 93%", "350 15% 13%", "350 15% 88%", "350 18% 10%", "350 10% 48%", "350 15% 14%", "350 22% 7%");
      break;
    case "cyber":
      setDarkVars("215 50% 3%", "195 70% 90%", "215 45% 6%", "195 70% 90%", "215 35% 12%", "195 50% 85%", "215 40% 8%", "200 20% 45%", "215 35% 13%", "215 45% 6%");
      break;
    case "sandstone":
      setLightVars("35 30% 94%", "30 30% 12%", "38 35% 97%", "30 30% 12%", "35 25% 89%", "30 20% 20%", "35 25% 89%", "30 12% 50%", "35 20% 82%", "38 35% 97%", "35 20% 82%");
      break;
    case "light":
      setLightVars("220 14% 96%", "224 71% 10%", "0 0% 100%", "224 71% 10%", "220 14% 92%", "224 50% 18%", "220 14% 92%", "220 9% 46%", "220 13% 87%", "0 0% 100%", "220 13% 87%");
      break;
    case "frost":
      setLightVars("205 40% 94%", "210 40% 15%", "205 50% 97%", "210 40% 15%", "205 30% 88%", "210 30% 22%", "205 30% 90%", "210 15% 48%", "205 25% 82%", "205 50% 97%", "205 30% 82%");
      break;
    case "timber":
      setDarkVars("25 35% 4%", "30 25% 90%", "28 30% 8%", "30 25% 90%", "25 20% 14%", "30 20% 85%", "25 22% 11%", "30 12% 48%", "25 18% 16%", "28 30% 8%");
      break;
  }

  const frameClasses = ["frame-default", "frame-aura", "frame-neon", "frame-frost", "frame-sharp", "frame-prism", "frame-electric", "frame-plasma", "frame-icicle", "frame-bark"];
  root.classList.remove(...frameClasses);
  if (frame && frame !== "default") {
    root.classList.add(`frame-${frame}`);
  }

  const cardClasses = ["card-default", "card-glassmorphic", "card-solid", "card-outline", "card-elevated", "card-frosted", "card-wood", "card-neumorphic"];
  root.classList.remove(...cardClasses);
  if (cardStyle && cardStyle !== "default") {
    root.classList.add(`card-${cardStyle}`);
  }
}
