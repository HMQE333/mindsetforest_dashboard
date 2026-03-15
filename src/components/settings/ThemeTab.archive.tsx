import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ThemeMode, AccentColor, FrameStyle, HeroLayout } from "@/hooks/useUserSettings";

const THEMES: { id: ThemeMode; label: string; icon: string; description: string; preview: { bg: string; card: string; text: string } }[] = [
  { id: "dark", label: "Dark", icon: "🌙", description: "Default dark RPG theme", preview: { bg: "#0a0b10", card: "#111320", text: "#e8e8f0" } },
  { id: "oled", label: "OLED Black", icon: "⬛", description: "True black for AMOLED", preview: { bg: "#000000", card: "#0a0a0a", text: "#e8e8f0" } },
  { id: "midnight", label: "Midnight", icon: "🌌", description: "Deep navy blue tones", preview: { bg: "#0a0e1a", card: "#111828", text: "#d0d8f0" } },
  { id: "forest", label: "Forest", icon: "🌲", description: "Deep greens, earthy tones", preview: { bg: "#070d08", card: "#0e1a10", text: "#d0e8d4" } },
  { id: "crimson", label: "Crimson", icon: "🩸", description: "Dark reds, warm blacks", preview: { bg: "#0d0608", card: "#1a0c10", text: "#f0d8dc" } },
  { id: "cyber", label: "Cyber", icon: "🔮", description: "Neon-tinted high contrast", preview: { bg: "#040810", card: "#081018", text: "#c8f0ff" } },
  { id: "sandstone", label: "Sandstone", icon: "🏜️", description: "Warm beige light theme", preview: { bg: "#f5f0e8", card: "#faf7f0", text: "#2a2418" } },
  { id: "light", label: "Light", icon: "☀️", description: "Clean light mode", preview: { bg: "#f5f5f7", card: "#ffffff", text: "#1a1a2e" } },
];

const ACCENTS: { id: AccentColor; label: string; hue: number; sat: number; light: number }[] = [
  { id: "purple", label: "Amethyst", hue: 263, sat: 70, light: 58 },
  { id: "blue", label: "Sapphire", hue: 217, sat: 91, light: 60 },
  { id: "cyan", label: "Aqua", hue: 189, sat: 94, light: 43 },
  { id: "green", label: "Emerald", hue: 152, sat: 76, light: 45 },
  { id: "gold", label: "Gold", hue: 45, sat: 93, light: 47 },
  { id: "orange", label: "Flame", hue: 25, sat: 95, light: 53 },
  { id: "red", label: "Ruby", hue: 0, sat: 72, light: 51 },
  { id: "pink", label: "Rose", hue: 330, sat: 81, light: 60 },
];

const FRAMES: { id: FrameStyle; label: string; icon: string; description: string }[] = [
  { id: "default", label: "Default", icon: "🎯", description: "Lift + shadow on hover" },
  { id: "aura", label: "Aura", icon: "🔆", description: "Card-color matching glow" },
  { id: "neon", label: "Neon", icon: "💡", description: "Bright neon outline" },
  { id: "frost", label: "Frost", icon: "❄️", description: "Frosted blur + white border" },
  { id: "sharp", label: "Sharp", icon: "🔷", description: "Hard edges, subtle scale" },
  { id: "prism", label: "Prism", icon: "🌈", description: "Dual accent + card glow" },
];

const HERO_LAYOUTS: { id: HeroLayout; label: string; icon: string; description: string }[] = [
  { id: "default", label: "Default", icon: "🎮", description: "Full streak + bar + cards" },
  { id: "compact", label: "Compact", icon: "⚡", description: "All stats in 2 rows" },
  { id: "minimal", label: "Minimal", icon: "🧊", description: "Just the XP bar" },
  { id: "command", label: "Command", icon: "🎯", description: "Radial gauge + stats" },
  { id: "solid", label: "Solid", icon: "🪨", description: "Flat matte, no glass" },
];

interface ThemeTabProps {
  currentTheme: ThemeMode;
  currentAccent: AccentColor;
  currentFrame?: FrameStyle;
  currentHeroLayout?: HeroLayout;
  onSave: (theme: ThemeMode, accent: AccentColor, frame?: FrameStyle, heroLayout?: HeroLayout) => Promise<void>;
}

export default function ThemeTab({ currentTheme, currentAccent, currentFrame, currentHeroLayout, onSave }: ThemeTabProps) {
  const [theme, setTheme] = useState<ThemeMode>(currentTheme);
  const [accent, setAccent] = useState<AccentColor>(currentAccent);
  const [frame, setFrame] = useState<FrameStyle>(currentFrame || "default");
  const [heroLayout, setHeroLayout] = useState<HeroLayout>(currentHeroLayout || "default");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTheme(currentTheme);
    setAccent(currentAccent);
    setFrame(currentFrame || "default");
    setHeroLayout(currentHeroLayout || "default");
  }, [currentTheme, currentAccent, currentFrame, currentHeroLayout]);

  const handleThemeChange = (t: ThemeMode) => {
    setTheme(t);
    setDirty(true);
    applyThemePreview(t, accent, frame);
  };

  const handleAccentChange = (a: AccentColor) => {
    setAccent(a);
    setDirty(true);
    applyThemePreview(theme, a, frame);
  };

  const handleFrameChange = (f: FrameStyle) => {
    setFrame(f);
    setDirty(true);
    applyThemePreview(theme, accent, f);
  };

  const handleHeroLayoutChange = (h: HeroLayout) => {
    setHeroLayout(h);
    setDirty(true);
  };

  const handleSave = async () => {
    await onSave(theme, accent, frame, heroLayout);
    setDirty(false);
  };

  return (
    <div className="space-y-6">
      {/* Theme Mode */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">Theme Mode</label>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t, i) => (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => handleThemeChange(t.id)}
              className={`relative p-3 rounded-xl border text-left transition-all overflow-hidden ${
                theme === t.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              <div
                className="w-full h-10 rounded-lg mb-2 flex items-center gap-1.5 px-2"
                style={{ backgroundColor: t.preview.bg }}
              >
                <div className="w-6 h-4 rounded" style={{ backgroundColor: t.preview.card }} />
                <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: t.preview.text, opacity: 0.3 }} />
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `hsl(${getAccentHSL(accent)})` }} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">{t.icon}</span>
                <div>
                  <div className="text-xs font-bold text-foreground">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">{t.description}</div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">Accent Color</label>
        <div className="grid grid-cols-4 gap-2">
          {ACCENTS.map((a, i) => (
            <motion.button
              key={a.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleAccentChange(a.id)}
              className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all ${
                accent === a.id
                  ? "border-foreground/30 bg-white/5 scale-105"
                  : "border-white/5 hover:border-white/15"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full transition-all ${accent === a.id ? "ring-2 ring-foreground/40 ring-offset-2 ring-offset-background" : ""}`}
                style={{ backgroundColor: `hsl(${a.hue}, ${a.sat}%, ${a.light}%)` }}
              />
              <span className="text-[10px] font-semibold text-muted-foreground">{a.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Frame Style */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">Card Frame Style</label>
        <div className="grid grid-cols-5 gap-1.5">
          {FRAMES.map((f, i) => (
            <motion.button
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleFrameChange(f.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                frame === f.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              <span className="text-lg">{f.icon}</span>
              <span className="text-[9px] font-bold text-foreground">{f.label}</span>
              <span className="text-[8px] text-muted-foreground text-center leading-tight">{f.description}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Hero Layout */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">Dashboard Hero Layout</label>
        <div className="grid grid-cols-2 gap-2">
          {HERO_LAYOUTS.map((h, i) => (
            <motion.button
              key={h.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => handleHeroLayoutChange(h.id)}
              className={`relative p-3 rounded-xl border text-left transition-all overflow-hidden ${
                heroLayout === h.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              {/* Mini preview */}
              <HeroLayoutPreview layoutId={h.id} accent={accent} />
              <div className="flex items-center gap-2">
                <span className="text-lg">{h.icon}</span>
                <div>
                  <div className="text-xs font-bold text-foreground">{h.label}</div>
                  <div className="text-[10px] text-muted-foreground">{h.description}</div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
      <div className="rounded-xl overflow-hidden">
        <div className="h-2 w-full" style={{
          background: `linear-gradient(90deg, hsl(${getAccentHSL(accent)}), hsl(${getAccentHSL(accent, 20)}))`,
        }} />
      </div>

      {dirty && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          Save Theme
        </motion.button>
      )}
    </div>
  );
}

function HeroLayoutPreview({ layoutId, accent }: { layoutId: HeroLayout; accent: AccentColor }) {
  const accentColor = `hsl(${getAccentHSL(accent)})`;
  const accentDim = `hsl(${getAccentHSL(accent)}/ 0.3)`;
  const mutedBar = "rgba(255,255,255,0.08)";
  const mutedBlock = "rgba(255,255,255,0.06)";

  if (layoutId === "default") {
    return (
      <div className="w-full h-12 rounded-lg mb-2 flex flex-col items-center justify-center gap-1 px-2" style={{ backgroundColor: mutedBlock }}>
        <div className="w-14 h-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <div className="flex items-center gap-1 w-full max-w-[90%]">
          <div className="w-6 h-1.5 rounded" style={{ backgroundColor: accentColor }} />
          <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: accentDim }}>
            <div className="h-full w-[55%] rounded-full" style={{ backgroundColor: accentColor }} />
          </div>
        </div>
        <div className="flex gap-1">
          <div className="w-8 h-3 rounded" style={{ backgroundColor: mutedBar }} />
          <div className="w-8 h-3 rounded" style={{ backgroundColor: mutedBar }} />
          <div className="w-8 h-3 rounded" style={{ backgroundColor: mutedBar }} />
        </div>
      </div>
    );
  }
  if (layoutId === "compact") {
    return (
      <div className="w-full h-12 rounded-lg mb-2 flex flex-col items-center justify-center gap-1.5 px-2" style={{ backgroundColor: mutedBlock }}>
        <div className="flex items-center gap-1 w-full">
          <div className="w-5 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
          <div className="w-5 h-2 rounded" style={{ backgroundColor: accentColor }} />
          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: accentDim }}>
            <div className="h-full w-[55%] rounded-full" style={{ backgroundColor: accentColor }} />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-6 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
          <div className="w-6 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
          <div className="w-6 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
        </div>
      </div>
    );
  }
  if (layoutId === "minimal") {
    return (
      <div className="w-full h-12 rounded-lg mb-2 flex flex-col items-center justify-center gap-1 px-3" style={{ backgroundColor: mutedBlock }}>
        <div className="flex items-center gap-1.5 w-full">
          <div className="w-5 h-1.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
          <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: accentDim }}>
            <div className="h-full w-[55%] rounded-full" style={{ backgroundColor: accentColor }} />
          </div>
          <div className="w-5 h-1 rounded" style={{ backgroundColor: "rgba(255,255,255,0.15)" }} />
        </div>
        <div className="flex gap-3">
          <div className="w-3 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <div className="w-3 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <div className="w-3 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <div className="w-3 h-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
        </div>
      </div>
    );
  }
  if (layoutId === "command") {
    return (
      <div className="w-full h-12 rounded-lg mb-2 flex items-center justify-center gap-2 px-2" style={{ backgroundColor: mutedBlock }}>
        <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center" style={{ borderColor: accentColor }}>
          <div className="text-[7px] font-bold" style={{ color: accentColor }}>55</div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="w-12 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
          <div className="flex gap-0.5">
            <div className="w-6 h-3 rounded" style={{ backgroundColor: mutedBar }} />
            <div className="w-6 h-3 rounded" style={{ backgroundColor: mutedBar }} />
            <div className="w-6 h-3 rounded" style={{ backgroundColor: mutedBar }} />
          </div>
        </div>
      </div>
    );
  }
  // solid
  return (
    <div className="w-full h-12 rounded-lg mb-2 flex flex-col items-center justify-center gap-1 px-2" style={{ backgroundColor: mutedBlock }}>
      <div className="w-14 h-2.5 rounded" style={{ backgroundColor: accentColor }} />
      <div className="flex items-center gap-1 w-full max-w-[90%]">
        <div className="w-6 h-1.5 rounded" style={{ backgroundColor: accentColor }} />
        <div className="flex-1 h-2 rounded border" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="h-full w-[55%] rounded" style={{ backgroundColor: accentColor }} />
        </div>
      </div>
      <div className="flex gap-1">
        <div className="w-8 h-3 rounded border" style={{ borderColor: "rgba(255,255,255,0.1)", backgroundColor: mutedBar }} />
        <div className="w-8 h-3 rounded border" style={{ borderColor: "rgba(255,255,255,0.1)", backgroundColor: mutedBar }} />
        <div className="w-8 h-3 rounded border" style={{ borderColor: "rgba(255,255,255,0.1)", backgroundColor: mutedBar }} />
      </div>
    </div>
  );
}

function getAccentHSL(id: AccentColor, lightOffset = 0): string {
  const a = ACCENTS.find(a => a.id === id) || ACCENTS[0];
  return `${a.hue}, ${a.sat}%, ${a.light + lightOffset}%`;
}

const ACCENTS_MAP: Record<AccentColor, { hue: number; sat: number; light: number }> = Object.fromEntries(
  ACCENTS.map(a => [a.id, { hue: a.hue, sat: a.sat, light: a.light }])
) as any;

/** Apply theme + accent + frame to CSS variables immediately (live preview) */
export function applyThemePreview(theme: ThemeMode, accent: AccentColor, frame: FrameStyle = "default") {
  const root = document.documentElement;
  const a = ACCENTS_MAP[accent] || ACCENTS_MAP.purple;
  const h = a.hue, s = a.sat, l = a.light;

  // Accent-derived vars
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

  // Theme mode
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
  }

  // Frame style — remove all frame classes then add active one
  const frameClasses = ["frame-default", "frame-glow", "frame-aura", "frame-neon", "frame-frost", "frame-sharp", "frame-prism"];
  root.classList.remove(...frameClasses);
  if (frame && frame !== "default") {
    root.classList.add(`frame-${frame}`);
  }
}

export { ACCENTS };
