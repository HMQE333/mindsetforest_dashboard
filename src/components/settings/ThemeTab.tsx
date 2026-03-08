import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ThemeMode, AccentColor } from "@/hooks/useUserSettings";

const THEMES: { id: ThemeMode; label: string; icon: string; description: string; preview: { bg: string; card: string; text: string } }[] = [
  { id: "dark", label: "Dark", icon: "🌙", description: "Default dark RPG theme", preview: { bg: "#0a0b10", card: "#111320", text: "#e8e8f0" } },
  { id: "oled", label: "OLED Black", icon: "⬛", description: "True black for AMOLED screens", preview: { bg: "#000000", card: "#0a0a0a", text: "#e8e8f0" } },
  { id: "midnight", label: "Midnight", icon: "🌌", description: "Deep navy blue tones", preview: { bg: "#0a0e1a", card: "#111828", text: "#d0d8f0" } },
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

interface ThemeTabProps {
  currentTheme: ThemeMode;
  currentAccent: AccentColor;
  onSave: (theme: ThemeMode, accent: AccentColor) => Promise<void>;
}

export default function ThemeTab({ currentTheme, currentAccent, onSave }: ThemeTabProps) {
  const [theme, setTheme] = useState<ThemeMode>(currentTheme);
  const [accent, setAccent] = useState<AccentColor>(currentAccent);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTheme(currentTheme);
    setAccent(currentAccent);
  }, [currentTheme, currentAccent]);

  const handleThemeChange = (t: ThemeMode) => {
    setTheme(t);
    setDirty(true);
    // Live preview
    applyThemePreview(t, accent);
  };

  const handleAccentChange = (a: AccentColor) => {
    setAccent(a);
    setDirty(true);
    // Live preview
    applyThemePreview(theme, a);
  };

  const handleSave = async () => {
    await onSave(theme, accent);
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
              {/* Mini preview */}
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

      {/* Preview bar */}
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

function getAccentHSL(id: AccentColor, lightOffset = 0): string {
  const a = ACCENTS.find(a => a.id === id) || ACCENTS[0];
  return `${a.hue}, ${a.sat}%, ${a.light + lightOffset}%`;
}

const ACCENTS_MAP: Record<AccentColor, { hue: number; sat: number; light: number }> = Object.fromEntries(
  ACCENTS.map(a => [a.id, { hue: a.hue, sat: a.sat, light: a.light }])
) as any;

/** Apply theme + accent to CSS variables immediately (live preview) */
export function applyThemePreview(theme: ThemeMode, accent: AccentColor) {
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
  switch (theme) {
    case "dark":
      root.style.setProperty("--background", "230 25% 4%");
      root.style.setProperty("--foreground", "220 20% 95%");
      root.style.setProperty("--card", "230 20% 7%");
      root.style.setProperty("--card-foreground", "220 20% 95%");
      root.style.setProperty("--popover", "230 20% 7%");
      root.style.setProperty("--popover-foreground", "220 20% 95%");
      root.style.setProperty("--secondary", "230 15% 14%");
      root.style.setProperty("--secondary-foreground", "220 20% 90%");
      root.style.setProperty("--muted", "230 15% 12%");
      root.style.setProperty("--muted-foreground", "220 10% 55%");
      root.style.setProperty("--border", "230 15% 15%");
      root.style.setProperty("--input", "230 15% 15%");
      root.style.setProperty("--glass", "230 20% 7%");
      root.style.setProperty("--glass-border", "0 0% 100%");
      root.style.setProperty("--primary-foreground", "0 0% 100%");
      root.style.setProperty("--destructive-foreground", "0 0% 100%");
      root.classList.remove("light-theme");
      break;

    case "oled":
      root.style.setProperty("--background", "0 0% 0%");
      root.style.setProperty("--foreground", "220 20% 95%");
      root.style.setProperty("--card", "0 0% 4%");
      root.style.setProperty("--card-foreground", "220 20% 95%");
      root.style.setProperty("--popover", "0 0% 4%");
      root.style.setProperty("--popover-foreground", "220 20% 95%");
      root.style.setProperty("--secondary", "0 0% 8%");
      root.style.setProperty("--secondary-foreground", "220 20% 90%");
      root.style.setProperty("--muted", "0 0% 6%");
      root.style.setProperty("--muted-foreground", "220 10% 50%");
      root.style.setProperty("--border", "0 0% 10%");
      root.style.setProperty("--input", "0 0% 10%");
      root.style.setProperty("--glass", "0 0% 4%");
      root.style.setProperty("--glass-border", "0 0% 100%");
      root.style.setProperty("--primary-foreground", "0 0% 100%");
      root.style.setProperty("--destructive-foreground", "0 0% 100%");
      root.classList.remove("light-theme");
      break;

    case "midnight":
      root.style.setProperty("--background", "222 47% 5%");
      root.style.setProperty("--foreground", "213 31% 91%");
      root.style.setProperty("--card", "222 40% 8%");
      root.style.setProperty("--card-foreground", "213 31% 91%");
      root.style.setProperty("--popover", "222 40% 8%");
      root.style.setProperty("--popover-foreground", "213 31% 91%");
      root.style.setProperty("--secondary", "222 30% 14%");
      root.style.setProperty("--secondary-foreground", "213 25% 88%");
      root.style.setProperty("--muted", "222 30% 11%");
      root.style.setProperty("--muted-foreground", "215 15% 50%");
      root.style.setProperty("--border", "222 25% 15%");
      root.style.setProperty("--input", "222 25% 15%");
      root.style.setProperty("--glass", "222 40% 8%");
      root.style.setProperty("--glass-border", "0 0% 100%");
      root.style.setProperty("--primary-foreground", "0 0% 100%");
      root.style.setProperty("--destructive-foreground", "0 0% 100%");
      root.classList.remove("light-theme");
      break;

    case "light":
      root.style.setProperty("--background", "220 14% 96%");
      root.style.setProperty("--foreground", "224 71% 10%");
      root.style.setProperty("--card", "0 0% 100%");
      root.style.setProperty("--card-foreground", "224 71% 10%");
      root.style.setProperty("--popover", "0 0% 100%");
      root.style.setProperty("--popover-foreground", "224 71% 10%");
      root.style.setProperty("--secondary", "220 14% 92%");
      root.style.setProperty("--secondary-foreground", "224 50% 18%");
      root.style.setProperty("--muted", "220 14% 92%");
      root.style.setProperty("--muted-foreground", "220 9% 46%");
      root.style.setProperty("--border", "220 13% 87%");
      root.style.setProperty("--input", "220 13% 87%");
      root.style.setProperty("--glass", "0 0% 100%");
      root.style.setProperty("--glass-border", "220 13% 87%");
      root.style.setProperty("--primary-foreground", "0 0% 100%");
      root.style.setProperty("--destructive-foreground", "0 0% 100%");
      root.classList.add("light-theme");
      break;
  }
}

export { ACCENTS };
