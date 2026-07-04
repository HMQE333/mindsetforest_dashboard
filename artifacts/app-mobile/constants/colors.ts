/**
 * MindsetForest / Life OS dark theme tokens.
 *
 * The web app (artifacts/app) is dark-only, so both the `light` and `dark`
 * palettes here use the same dark values — the app always renders dark
 * regardless of the device appearance setting.
 *
 * Values are converted from the web app's index.css HSL variables to hex.
 */

const dark = {
  // Legacy aliases
  text: "#eef1f5",
  tint: "#8b5cf6",

  // Core surfaces
  background: "#080a0d",
  foreground: "#eef1f5",

  // Cards / elevated surfaces
  card: "#12141b",
  cardForeground: "#eef1f5",

  // Primary action color
  primary: "#8b5cf6",
  primaryForeground: "#ffffff",

  // Secondary
  secondary: "#191b22",
  secondaryForeground: "#e2e4ea",

  // Muted / subdued
  muted: "#1a1c22",
  mutedForeground: "#8b90a0",

  // Accent
  accent: "#2a2050",
  accentForeground: "#d7c9ff",

  // Destructive
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",

  // Borders and inputs
  border: "#23262f",
  input: "#23262f",
};

// Category colors (converted from --cat-* CSS vars).
export const CATEGORY_COLORS: Record<string, string> = {
  mind: "#8b5cf6",
  body: "#f14141",
  creation: "#f9741f",
  exploration: "#06b6d4",
  networking: "#fbc522",
  trading: "#6467f1",
  spirit: "#d948ef",
  order: "#a1a1aa",
};

const colors = {
  light: dark,
  dark,
  radius: 12,
};

export default colors;
