import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ThemeMode, AccentColor, FrameStyle, HeroLayout, FontPair, BackgroundPattern, CardStyle, UserPreferences } from "@/hooks/useUserSettings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";

const THEMES: { id: ThemeMode; label: string; icon: string; description: string; preview: { bg: string; card: string; text: string } }[] = [
  { id: "dark", label: "Dark", icon: "🌙", description: "Default dark RPG theme", preview: { bg: "#0a0b10", card: "#111320", text: "#e8e8f0" } },
  { id: "oled", label: "OLED Black", icon: "⬛", description: "True black for AMOLED", preview: { bg: "#000000", card: "#0a0a0a", text: "#e8e8f0" } },
  { id: "midnight", label: "Midnight", icon: "🌌", description: "Deep navy blue tones", preview: { bg: "#0a0e1a", card: "#111828", text: "#d0d8f0" } },
  { id: "forest", label: "Forest", icon: "🌲", description: "Deep greens, earthy tones", preview: { bg: "#070d08", card: "#0e1a10", text: "#d0e8d4" } },
  { id: "crimson", label: "Crimson", icon: "🩸", description: "Dark reds, warm blacks", preview: { bg: "#0d0608", card: "#1a0c10", text: "#f0d8dc" } },
  { id: "cyber", label: "Cyber", icon: "🔮", description: "Neon-tinted high contrast", preview: { bg: "#040810", card: "#081018", text: "#c8f0ff" } },
  { id: "sandstone", label: "Sandstone", icon: "🏜️", description: "Warm beige light theme", preview: { bg: "#f5f0e8", card: "#faf7f0", text: "#2a2418" } },
  { id: "light", label: "Light", icon: "☀️", description: "Clean light mode", preview: { bg: "#f5f5f7", card: "#ffffff", text: "#1a1a2e" } },
  { id: "frost", label: "Frost", icon: "❄️", description: "Icy blues, crisp whites", preview: { bg: "#e8f0f8", card: "#f0f6fc", text: "#1a2a3a" } },
  { id: "timber", label: "Timber", icon: "🪵", description: "Warm browns, cabin tones", preview: { bg: "#0e0906", card: "#1a110a", text: "#e8d8c8" } },
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
  { id: "glow", label: "Glow", icon: "✨", description: "Accent-colored glow border" },
  { id: "aura", label: "Aura", icon: "🔆", description: "Card-color matching glow" },
  { id: "neon", label: "Neon", icon: "💡", description: "Bright neon outline" },
  { id: "frost", label: "Frost", icon: "❄️", description: "Frosted blur + white border" },
  { id: "sharp", label: "Sharp", icon: "🔷", description: "Hard edges, subtle scale" },
  { id: "prism", label: "Prism", icon: "🌈", description: "Dual accent + card glow" },
  { id: "electric", label: "Electric", icon: "⚡", description: "Animated crackling border" },
  { id: "plasma", label: "Plasma", icon: "🔮", description: "Electric + card-color border" },
  { id: "icicle", label: "Icicle", icon: "🧊", description: "Frosted ice border glow" },
  { id: "bark", label: "Bark", icon: "🪵", description: "Organic wood-grain glow" },
];

const FONT_PAIRS: { id: FontPair; label: string; display: string; body: string; preview: string; googleImport: string }[] = [
  { id: "default", label: "Default", display: "Inter", body: "Inter", preview: "Clean & modern", googleImport: "" },
  { id: "mono", label: "Mono", display: "JetBrains Mono", body: "JetBrains Mono", preview: "Terminal vibes", googleImport: "" },
  { id: "editorial", label: "Editorial", display: "Playfair Display", body: "Inter", preview: "Classic & refined", googleImport: "family=Playfair+Display:wght@400;600;700;800;900" },
  { id: "geometric", label: "Geometric", display: "Space Grotesk", body: "Space Grotesk", preview: "Bold & technical", googleImport: "family=Space+Grotesk:wght@300;400;500;600;700" },
  { id: "handcraft", label: "Handcraft", display: "Caveat", body: "Inter", preview: "Personal touch", googleImport: "family=Caveat:wght@400;500;600;700" },
  { id: "clean", label: "Clean", display: "DM Sans", body: "DM Sans", preview: "Polished & soft", googleImport: "family=DM+Sans:wght@300;400;500;600;700" },
];

const BACKGROUNDS: { id: BackgroundPattern; label: string; icon: string; description: string }[] = [
  { id: "none", label: "None", icon: "🚫", description: "Clean, no pattern" },
  { id: "grid", label: "Grid", icon: "📐", description: "Subtle grid lines" },
  { id: "dots", label: "Dots", icon: "⚬", description: "Polka dot matrix" },
  { id: "noise", label: "Noise", icon: "📡", description: "Film grain texture" },
  { id: "starry", label: "Starry Night", icon: "✨", description: "Animated floating stars" },
  { id: "mesh", label: "Gradient Mesh", icon: "🌈", description: "Soft color blobs" },
  { id: "fireflies", label: "Fireflies", icon: "🪲", description: "Warm drifting firefly glow" },
  { id: "forest", label: "Forest", icon: "🌲", description: "Layered tree silhouettes" },
  { id: "snow", label: "Snowfall", icon: "❄️", description: "Gently falling snowflakes" },
  { id: "leaves", label: "Falling Leaves", icon: "🍂", description: "Autumn leaves drifting down" },
];

const CARD_STYLES: { id: CardStyle; label: string; icon: string; description: string }[] = [
  { id: "default", label: "Default", icon: "🪟", description: "Semi-transparent glass" },
  { id: "glassmorphic", label: "Glassmorphic", icon: "💎", description: "Heavy blur, iridescent shimmer" },
  { id: "solid", label: "Solid", icon: "🧱", description: "Opaque, flat surface" },
  { id: "outline", label: "Outline", icon: "🔲", description: "Transparent, border-only" },
  { id: "elevated", label: "Elevated", icon: "📦", description: "Strong shadows, layered depth" },
  { id: "frosted", label: "Frosted", icon: "🧊", description: "Icy translucent glass" },
  { id: "wood", label: "Wood", icon: "🪵", description: "Natural wood grain texture" },
  { id: "moss", label: "Moss", icon: "🌿", description: "Green organic moss texture" },
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
  currentFontPair?: FontPair;
  currentBackgroundPattern?: BackgroundPattern;
  currentCardStyle?: CardStyle;
  currentCustomAccentHue?: number | null;
  currentCardOpacity?: number;
  currentBackgroundIntensity?: number;
  currentBorderRadius?: number;
  onSave: (theme: ThemeMode, accent: AccentColor, frame?: FrameStyle, heroLayout?: HeroLayout, fontPair?: FontPair, backgroundPattern?: BackgroundPattern, cardStyle?: CardStyle, extraPrefs?: Partial<UserPreferences>) => Promise<void>;
}

/* ── Collapsible Section Wrapper ── */
function Section({ title, icon, defaultOpen = true, children }: { title: string; icon: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 group cursor-pointer">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <span>{icon}</span> {title}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ── Frame Style Preview ── */
function FrameStylePreview({ frameId, accent }: { frameId: FrameStyle; accent: AccentColor }) {
  const accentColor = `hsl(${getAccentHSL(accent)})`;
  const accentDim = `hsl(${getAccentHSL(accent)} / 0.25)`;
  const warmGlow = `hsl(${getAccentHSL(accent, 15)} / 0.3)`;

  const baseCard: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "0 10px",
    transition: "all 0.2s",
    position: "relative",
    overflow: "hidden",
  };

  const innerLine = (w: number, opacity = 0.15) => (
    <div style={{ width: w, height: 3, borderRadius: 2, backgroundColor: `rgba(255,255,255,${opacity})` }} />
  );
  const innerDot = (color: string) => (
    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
  );

  const getStyle = (): React.CSSProperties => {
    switch (frameId) {
      case "glow":
        return { ...baseCard, boxShadow: `0 0 16px ${accentDim}, 0 0 4px ${accentColor}, inset 0 0 8px ${accentDim}`, borderColor: accentColor };
      case "aura":
        return { ...baseCard, boxShadow: `0 0 20px ${warmGlow}, 0 0 40px ${warmGlow}, 0 4px 12px rgba(0,0,0,0.2)`, borderColor: `hsl(${getAccentHSL(accent)} / 0.3)`, backgroundColor: "rgba(255,255,255,0.05)" };
      case "neon":
        return { ...baseCard, boxShadow: `0 0 6px ${accentColor}, 0 0 14px ${accentColor}, 0 0 28px ${accentDim}`, borderColor: accentColor, borderWidth: 2 };
      case "frost":
        return { ...baseCard, backdropFilter: "blur(8px)", borderColor: "rgba(200,230,255,0.35)", backgroundColor: "rgba(200,230,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 12px rgba(180,220,255,0.1)" };
      case "sharp":
        return { ...baseCard, borderRadius: 2, boxShadow: "4px 4px 0 rgba(0,0,0,0.4)", borderColor: "rgba(255,255,255,0.15)", borderWidth: 1.5 };
      case "prism":
        return { ...baseCard, boxShadow: `6px 0 18px ${accentDim}, -6px 0 18px rgba(255,180,255,0.15), 0 0 8px ${accentDim}`, borderColor: accentColor, borderWidth: 1.5 };
      case "electric":
        return { ...baseCard, borderColor: accentColor, boxShadow: `0 0 8px ${accentDim}, 0 0 20px ${accentDim}`, borderWidth: 1.5, animation: "electric-preview-pulse 1.2s infinite", backgroundImage: `linear-gradient(90deg, transparent 40%, ${accentDim} 50%, transparent 60%)` };
      case "plasma":
        return { ...baseCard, borderColor: accentColor, boxShadow: `0 0 12px ${warmGlow}, 0 0 24px ${warmGlow}`, borderWidth: 1.5, animation: "electric-preview-pulse 1.2s infinite", background: `linear-gradient(135deg, rgba(0,0,0,0.3), ${accentDim}, rgba(0,0,0,0.1))` };
      case "icicle":
        return { ...baseCard, borderColor: "hsl(200, 80%, 82%)", boxShadow: "0 0 12px hsla(200, 80%, 75%, 0.3), 0 0 28px hsla(200, 70%, 70%, 0.12), inset 0 1px 0 rgba(200,230,255,0.2)", backgroundColor: "rgba(200,230,255,0.06)" };
      case "bark":
        return { ...baseCard, borderColor: "hsl(28, 45%, 38%)", borderWidth: "1.5px", boxShadow: "0 0 18px hsla(30, 55%, 32%, 0.4), 0 0 36px hsla(25, 45%, 22%, 0.18), inset 0 0 14px hsla(30, 40%, 20%, 0.12)", backgroundColor: "rgba(60, 40, 20, 0.15)", backgroundImage: "repeating-linear-gradient(88deg, transparent, transparent 10px, hsla(28, 35%, 28%, 0.18) 10px, hsla(28, 35%, 28%, 0.18) 11.5px), repeating-linear-gradient(94deg, transparent, transparent 18px, hsla(25, 30%, 25%, 0.12) 18px, hsla(25, 30%, 25%, 0.12) 19px)" };
      default:
        return { ...baseCard, boxShadow: "0 4px 12px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.15)", borderColor: "rgba(255,255,255,0.1)", transform: "translateY(-1px)" };
    }
  };

  return (
    <div style={getStyle()}>
      {innerDot(accentColor)}
      {innerLine(24)}
      <div style={{ flex: 1 }} />
      {innerLine(16, 0.1)}
    </div>
  );
}

/* ── Card Style Preview ── */
function CardStylePreview({ styleId, accent }: { styleId: CardStyle; accent: AccentColor }) {
  const accentColor = `hsl(${getAccentHSL(accent)})`;
  const accentDim = `hsl(${getAccentHSL(accent)} / 0.2)`;

  const base: React.CSSProperties = {
    width: "100%",
    height: 40,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 10px",
    transition: "all 0.3s",
  };

  const innerLine = (w: number, opacity = 0.15) => (
    <div style={{ width: w, height: 3, borderRadius: 2, backgroundColor: `rgba(255,255,255,${opacity})` }} />
  );
  const innerDot = (color: string) => (
    <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: color }} />
  );

  const getStyle = (): React.CSSProperties => {
    switch (styleId) {
      case "glassmorphic":
        return {
          ...base,
          backgroundColor: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${accentDim}`,
          background: `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.06) 100%)`,
        };
      case "solid":
        return {
          ...base,
          backgroundColor: "rgba(30,30,40,0.95)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
        };
      case "outline":
        return {
          ...base,
          backgroundColor: "transparent",
          border: `1.5px solid rgba(255,255,255,0.15)`,
        };
      case "elevated":
        return {
          ...base,
          backgroundColor: "rgba(25,25,35,0.9)",
          border: "1px solid rgba(255,255,255,0.05)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
          borderRadius: 14,
        };
      case "frosted":
        return {
          ...base,
          backgroundColor: "rgba(200, 230, 255, 0.06)",
          backdropFilter: "blur(28px)",
          border: "1px solid hsla(200, 60%, 80%, 0.25)",
          boxShadow: "inset 0 0 20px hsla(200, 70%, 80%, 0.06), 0 4px 20px rgba(0,0,0,0.2)",
        };
      case "wood":
        return {
          ...base,
          backgroundColor: "hsl(28, 40%, 18%)",
          border: "1px solid hsl(28, 30%, 28%)",
          boxShadow: "inset 0 1px 0 hsla(35, 40%, 30%, 0.3), 0 2px 8px rgba(0,0,0,0.3)",
          borderRadius: 10,
          backgroundImage: `repeating-linear-gradient(
            95deg,
            transparent,
            transparent 8px,
            hsla(30, 30%, 22%, 0.4) 8px,
            hsla(30, 30%, 22%, 0.4) 9px
          )`,
        };
      case "moss":
        return {
          ...base,
          backgroundColor: "hsl(140, 35%, 12%)",
          border: "1px solid hsl(135, 30%, 22%)",
          boxShadow: "inset 0 1px 0 hsla(140, 40%, 25%, 0.3), 0 2px 8px rgba(0,0,0,0.3)",
          borderRadius: 14,
          backgroundImage: `radial-gradient(circle 3px at 25% 35%, hsla(130, 50%, 28%, 0.4), transparent),
            radial-gradient(circle 2px at 65% 60%, hsla(140, 45%, 25%, 0.3), transparent),
            radial-gradient(circle 2.5px at 80% 30%, hsla(125, 40%, 22%, 0.25), transparent)`,
        };
      default:
        return {
          ...base,
          backgroundColor: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.1)",
        };
    }
  };

  return (
    <div style={getStyle()}>
      {innerDot(accentColor)}
      {innerLine(20)}
      <div style={{ flex: 1 }} />
      {innerLine(14, 0.1)}
    </div>
  );
}

function AccentPreviewStrip({ accent }: { accent: AccentColor }) {
  const accentColor = `hsl(${getAccentHSL(accent)})`;
  const accentDim = `hsl(${getAccentHSL(accent)} / 0.25)`;

  return (
    <div className="flex items-center gap-3 mt-3 px-1">
      {/* Mini button */}
      <div
        className="px-3 py-1 rounded-lg text-[9px] font-bold text-white shrink-0"
        style={{ backgroundColor: accentColor }}
      >
        Button
      </div>
      {/* Mini progress bar */}
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: accentDim }}>
        <div className="h-full w-[65%] rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
      {/* Mini badge */}
      <div
        className="px-2 py-0.5 rounded-full text-[8px] font-bold shrink-0"
        style={{ backgroundColor: accentDim, color: accentColor }}
      >
        Badge
      </div>
    </div>
  );
}

/* ── Large Hero Preview ── */
function HeroLivePreview({ layoutId, accent }: { layoutId: HeroLayout; accent: AccentColor }) {
  const accentColor = `hsl(${getAccentHSL(accent)})`;
  const accentDim = `hsl(${getAccentHSL(accent)} / 0.25)`;
  const mutedBar = "rgba(255,255,255,0.06)";
  const mutedLine = "rgba(255,255,255,0.12)";

  const StatCard = ({ w = 60 }: { w?: number }) => (
    <div className="rounded-lg flex flex-col items-center justify-center gap-0.5 py-2" style={{ width: w, backgroundColor: mutedBar, border: `1px solid ${mutedLine}` }}>
      <div className="text-[8px] font-bold" style={{ color: accentColor }}>128</div>
      <div style={{ width: 24, height: 2, borderRadius: 2, backgroundColor: mutedLine }} />
    </div>
  );

  const XPBar = ({ height = 6 }: { height?: number }) => (
    <div className="w-full rounded-full overflow-hidden" style={{ height, backgroundColor: accentDim }}>
      <div className="h-full rounded-full" style={{ width: "55%", background: `linear-gradient(90deg, ${accentColor}, hsl(${getAccentHSL(accent, 20)}))` }} />
    </div>
  );

  const StreakBadge = () => (
    <div className="px-2 py-0.5 rounded-full text-[8px] font-bold" style={{ backgroundColor: accentDim, color: accentColor }}>
      🔥 7 day streak
    </div>
  );

  return (
    <div className="mt-3 rounded-xl p-4 border border-white/5" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
      <div className="text-[9px] text-muted-foreground mb-2 uppercase tracking-wider">Live Preview</div>
      <div className="rounded-xl p-3" style={{ backgroundColor: "rgba(0,0,0,0.3)", minHeight: 100 }}>
        {layoutId === "default" && (
          <div className="flex flex-col items-center gap-2">
            <StreakBadge />
            <div className="flex items-center gap-2 w-full max-w-[80%]">
              <div className="text-[9px] font-bold" style={{ color: accentColor }}>Lv.5</div>
              <XPBar />
              <div className="text-[8px] text-muted-foreground whitespace-nowrap">550/1000</div>
            </div>
            <div className="flex gap-2 mt-1">
              <StatCard /><StatCard /><StatCard />
            </div>
          </div>
        )}
        {layoutId === "compact" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <StreakBadge />
              <div className="text-[9px] font-bold" style={{ color: accentColor }}>Lv.5</div>
              <XPBar height={5} />
            </div>
            <div className="flex gap-2 justify-center">
              <StatCard w={52} /><StatCard w={52} /><StatCard w={52} /><StatCard w={52} />
            </div>
          </div>
        )}
        {layoutId === "minimal" && (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex items-center gap-2 w-full max-w-[85%]">
              <div className="text-[9px] font-bold" style={{ color: accentColor }}>Lv.5</div>
              <XPBar height={4} />
              <div className="text-[8px] text-muted-foreground whitespace-nowrap">55%</div>
            </div>
            <div className="flex gap-4">
              {[1,2,3,4].map(i => (
                <div key={i} style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: mutedLine }} />
              ))}
            </div>
          </div>
        )}
        {layoutId === "command" && (
          <div className="flex items-center gap-4 justify-center py-1">
            <div className="w-14 h-14 rounded-full border-2 flex items-center justify-center" style={{ borderColor: accentColor }}>
              <div className="text-[10px] font-bold" style={{ color: accentColor }}>55%</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-[9px] font-bold" style={{ color: accentColor }}>Level 5 — 550 XP</div>
              <div className="flex gap-1.5">
                <StatCard w={48} /><StatCard w={48} /><StatCard w={48} />
              </div>
            </div>
          </div>
        )}
        {layoutId === "solid" && (
          <div className="flex flex-col items-center gap-2">
            <div className="px-3 py-1 rounded text-[9px] font-bold text-white" style={{ backgroundColor: accentColor }}>
              🔥 7 day streak
            </div>
            <div className="flex items-center gap-2 w-full max-w-[80%]">
              <div className="text-[9px] font-bold" style={{ color: accentColor }}>Lv.5</div>
              <div className="flex-1 h-[6px] rounded border overflow-hidden" style={{ borderColor: mutedLine }}>
                <div className="h-full w-[55%] rounded" style={{ backgroundColor: accentColor }} />
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              {[1,2,3].map(i => (
                <div key={i} className="rounded flex flex-col items-center justify-center gap-0.5 py-2" style={{ width: 60, backgroundColor: mutedBar, border: `1px solid ${mutedLine}`, borderRadius: 3 }}>
                  <div className="text-[8px] font-bold" style={{ color: accentColor }}>128</div>
                  <div style={{ width: 24, height: 2, borderRadius: 1, backgroundColor: mutedLine }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Small Thumbnail Preview (for grid selector) ── */
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

/* ── Main ThemeTab ── */
export default function ThemeTab({ currentTheme, currentAccent, currentFrame, currentHeroLayout, currentFontPair, currentBackgroundPattern, currentCardStyle, currentCustomAccentHue, currentCardOpacity, currentBackgroundIntensity, currentBorderRadius, onSave }: ThemeTabProps) {
  const [theme, setTheme] = useState<ThemeMode>(currentTheme);
  const [accent, setAccent] = useState<AccentColor>(currentAccent);
  const [frame, setFrame] = useState<FrameStyle>(currentFrame || "default");
  const [heroLayout, setHeroLayout] = useState<HeroLayout>(currentHeroLayout || "default");
  const [fontPair, setFontPair] = useState<FontPair>(currentFontPair || "default");
  const [bgPattern, setBgPattern] = useState<BackgroundPattern>(currentBackgroundPattern || "none");
  const [cardStyle, setCardStyle] = useState<CardStyle>(currentCardStyle || "default");
  const [customHue, setCustomHue] = useState<number | null>(currentCustomAccentHue ?? null);
  const [cardOpacity, setCardOpacity] = useState<number>(currentCardOpacity ?? 0.6);
  const [bgIntensity, setBgIntensity] = useState<number>(currentBackgroundIntensity ?? 0.6);
  const [borderRadius, setBorderRadius] = useState<number>(currentBorderRadius ?? 12);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTheme(currentTheme);
    setAccent(currentAccent);
    setFrame(currentFrame || "default");
    setHeroLayout(currentHeroLayout || "default");
    setFontPair(currentFontPair || "default");
    setBgPattern(currentBackgroundPattern || "none");
    setCardStyle(currentCardStyle || "default");
    setCustomHue(currentCustomAccentHue ?? null);
    setCardOpacity(currentCardOpacity ?? 0.6);
    setBgIntensity(currentBackgroundIntensity ?? 0.6);
    setBorderRadius(currentBorderRadius ?? 12);
  }, [currentTheme, currentAccent, currentFrame, currentHeroLayout, currentFontPair, currentBackgroundPattern, currentCardStyle, currentCustomAccentHue, currentCardOpacity, currentBackgroundIntensity, currentBorderRadius]);

  const handleThemeChange = (t: ThemeMode) => { setTheme(t); setDirty(true); applyThemePreview(t, accent, frame, fontPair, cardStyle, customHue, borderRadius, cardOpacity); };
  const handleAccentChange = (a: AccentColor) => { setAccent(a); setCustomHue(null); setDirty(true); applyThemePreview(theme, a, frame, fontPair, cardStyle, null, borderRadius, cardOpacity); };
  const handleFrameChange = (f: FrameStyle) => { setFrame(f); setDirty(true); applyThemePreview(theme, accent, f, fontPair, cardStyle, customHue, borderRadius, cardOpacity); };
  const handleHeroLayoutChange = (h: HeroLayout) => { setHeroLayout(h); setDirty(true); };
  const handleFontChange = (f: FontPair) => { setFontPair(f); setDirty(true); applyThemePreview(theme, accent, frame, f, cardStyle, customHue, borderRadius, cardOpacity); };
  const handleBgChange = (b: BackgroundPattern) => { setBgPattern(b); setDirty(true); };
  const handleCardStyleChange = (c: CardStyle) => { setCardStyle(c); setDirty(true); applyThemePreview(theme, accent, frame, fontPair, c, customHue, borderRadius, cardOpacity); };
  const handleCustomHueChange = (h: number) => { setCustomHue(h); setDirty(true); applyThemePreview(theme, accent, frame, fontPair, cardStyle, h, borderRadius, cardOpacity); };
  const handleCardOpacityChange = (v: number) => { setCardOpacity(v); setDirty(true); applyThemePreview(theme, accent, frame, fontPair, cardStyle, customHue, borderRadius, v); };
  const handleBorderRadiusChange = (v: number) => { setBorderRadius(v); setDirty(true); applyThemePreview(theme, accent, frame, fontPair, cardStyle, customHue, v, cardOpacity); };
  const handleBgIntensityChange = (v: number) => { setBgIntensity(v); setDirty(true); };

  const handleSave = async () => {
    await onSave(theme, accent, frame, heroLayout, fontPair, bgPattern, cardStyle, {
      customAccentHue: customHue,
      cardOpacity,
      backgroundIntensity: bgIntensity,
      borderRadius,
    });
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      {/* ── Theme Mode ── */}
      <Section title="Theme Mode" icon="🌙">
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
      </Section>

      {/* ── Accent Color ── */}
      <Section title="Accent Color" icon="🎨">
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
        {/* Custom Accent Hue Slider */}
        <div className="mt-3 px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Custom Hue</span>
            <span className="text-[10px] font-mono text-muted-foreground">{customHue != null ? `${customHue}°` : "—"}</span>
          </div>
          <div className="relative">
            <Slider
              min={0}
              max={360}
              step={1}
              value={[customHue ?? 0]}
              onValueChange={([v]) => handleCustomHueChange(v)}
              className="w-full"
            />
            <div className="h-1.5 w-full rounded-full mt-1" style={{
              background: "linear-gradient(90deg, hsl(0,70%,58%), hsl(60,70%,58%), hsl(120,70%,58%), hsl(180,70%,58%), hsl(240,70%,58%), hsl(300,70%,58%), hsl(360,70%,58%))",
              opacity: 0.5,
            }} />
          </div>
        </div>
        <AccentPreviewStrip accent={accent} />
      </Section>

      {/* ── Card Frame Style ── */}
      <Section title="Card Frame Style" icon="🖼️">
        <div className="grid grid-cols-2 gap-2">
          {FRAMES.map((f, i) => (
            <motion.button
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleFrameChange(f.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                frame === f.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              <div className="mb-2">
                <FrameStylePreview frameId={f.id} accent={accent} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">{f.icon}</span>
                <div>
                  <div className="text-xs font-bold text-foreground">{f.label}</div>
                  <div className="text-[10px] text-muted-foreground">{f.description}</div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
        {/* Border Radius Slider */}
        <div className="mt-3 px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Border Radius</span>
            <span className="text-[10px] font-mono text-muted-foreground">{borderRadius}px</span>
          </div>
          <Slider min={0} max={24} step={1} value={[borderRadius]} onValueChange={([v]) => handleBorderRadiusChange(v)} className="w-full" />
        </div>
      </Section>
      <Section title="Card Style" icon="🃏">
        <div className="grid grid-cols-2 gap-2">
          {CARD_STYLES.map((c, i) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleCardStyleChange(c.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                cardStyle === c.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              <div className="mb-2">
                <CardStylePreview styleId={c.id} accent={accent} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base">{c.icon}</span>
                <div>
                  <div className="text-xs font-bold text-foreground">{c.label}</div>
                  <div className="text-[10px] text-muted-foreground">{c.description}</div>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
        {/* Card Opacity Slider */}
        <div className="mt-3 px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Opacity</span>
            <span className="text-[10px] font-mono text-muted-foreground">{Math.round(cardOpacity * 100)}%</span>
          </div>
          <Slider min={5} max={100} step={1} value={[Math.round(cardOpacity * 100)]} onValueChange={([v]) => handleCardOpacityChange(v / 100)} className="w-full" />
        </div>
      </Section>
      <Section title="Dashboard Hero Layout" icon="🏠">
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
        <HeroLivePreview layoutId={heroLayout} accent={accent} />
      </Section>

      {/* ── Typography ── */}
      <Section title="Typography" icon="🔤" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          {FONT_PAIRS.map((f, i) => (
            <motion.button
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleFontChange(f.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                fontPair === f.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              <div className="mb-1.5 h-8 flex items-center">
                <span
                  className="text-sm font-bold text-foreground truncate"
                  style={{ fontFamily: f.display }}
                >
                  {f.preview}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">{f.display}{f.display !== f.body ? ` + ${f.body}` : ""}</div>
            </motion.button>
          ))}
        </div>
      </Section>

      {/* ── Background Pattern ── */}
      <Section title="Background" icon="🎨" defaultOpen={false}>
        <div className="grid grid-cols-3 gap-2">
          {BACKGROUNDS.map((b, i) => (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => handleBgChange(b.id)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                bgPattern === b.id
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                  : "border-white/5 hover:border-white/15 bg-muted/20"
              }`}
            >
              <span className="text-xl">{b.icon}</span>
              <div className="text-[10px] font-bold text-foreground">{b.label}</div>
              <div className="text-[8px] text-muted-foreground text-center leading-tight">{b.description}</div>
            </motion.button>
          ))}
        </div>
        {/* Background Intensity Slider */}
        {bgPattern !== "none" && (
          <div className="mt-3 px-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted-foreground font-medium">Intensity</span>
              <span className="text-[10px] font-mono text-muted-foreground">{Math.round(bgIntensity * 100)}%</span>
            </div>
            <Slider min={10} max={100} step={1} value={[Math.round(bgIntensity * 100)]} onValueChange={([v]) => handleBgIntensityChange(v / 100)} className="w-full" />
          </div>
        )}
      </Section>
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
  document.body.style.fontFamily = `'${fp.body}', system-ui, -apple-system, sans-serif`;
  root.style.setProperty("--font-display", `'${fp.display}'`);

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

  const frameClasses = ["frame-default", "frame-glow", "frame-aura", "frame-neon", "frame-frost", "frame-sharp", "frame-prism", "frame-electric", "frame-plasma", "frame-icicle", "frame-bark"];
  root.classList.remove(...frameClasses);
  if (frame && frame !== "default") {
    root.classList.add(`frame-${frame}`);
  }

  const cardClasses = ["card-default", "card-glassmorphic", "card-solid", "card-outline", "card-elevated", "card-frosted", "card-wood", "card-moss"];
  root.classList.remove(...cardClasses);
  if (cardStyle && cardStyle !== "default") {
    root.classList.add(`card-${cardStyle}`);
  }
}

export { ACCENTS };
