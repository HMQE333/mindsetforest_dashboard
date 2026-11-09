/**
 * A picture's palette, worked out in the browser (exact and free): the main
 * colours with their share of the picture, and the colour words they fall
 * under, which the Library's and Images' colour filters match on.
 */
export const HUES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "black", "white", "gray"] as const;
export type Hue = (typeof HUES)[number];

/** Swatch shown on the filter chip for each colour word. */
export const HUE_SWATCH: Record<Hue, string> = {
  red: "#e5484d", orange: "#f76b15", yellow: "#ffc53d", green: "#46a758", teal: "#12a594", blue: "#3e63dd",
  purple: "#8e4ec6", pink: "#e93d82", brown: "#8d5b3e", black: "#111111", white: "#f5f5f5", gray: "#8b8d98",
};

export interface PaletteColor { hex: string; share: number; hue: Hue }

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** The colour word a person would use for this colour. */
export function hueName(r: number, g: number, b: number): Hue {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < 0.13) return "black";
  if (l > 0.9 && s < 0.5) return "white";
  if (s < 0.15 || (s < 0.25 && l < 0.3)) return l > 0.8 ? "white" : "gray";
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return l < 0.4 ? "brown" : "orange";
  if (h < 68) return l < 0.35 ? "brown" : "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "pink";
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * Main colours of RGBA pixels: 4-bit-per-channel buckets, the biggest first,
 * near-duplicates folded together. Transparent pixels are skipped.
 */
export function paletteFromPixels(data: ArrayLike<number>, max = 5): PaletteColor[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else buckets.set(key, { n: 1, r, g, b });
    total++;
  }
  if (!total) return [];
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => ({ n: e.n, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }));
  const kept: typeof sorted = [];
  for (const c of sorted) {
    const near = kept.find((k) => Math.abs(k.r - c.r) + Math.abs(k.g - c.g) + Math.abs(k.b - c.b) < 60);
    if (near) {
      const n = near.n + c.n;
      near.r = (near.r * near.n + c.r * c.n) / n; near.g = (near.g * near.n + c.g * c.n) / n; near.b = (near.b * near.n + c.b * c.n) / n;
      near.n = n;
    } else kept.push({ ...c });
  }
  return kept
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => ({ hex: `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`, share: Math.round((c.n / total) * 1000) / 1000, hue: hueName(c.r, c.g, c.b) }));
}

/** The colour words that cover a real part of the picture (8% or more), biggest first. */
export function huesOf(colors: PaletteColor[], minShare = 0.08): Hue[] {
  const share = new Map<Hue, number>();
  for (const c of colors) share.set(c.hue, (share.get(c.hue) ?? 0) + c.share);
  return [...share].filter(([, s]) => s >= minShare).sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

/** Loads the picture into a 64 px canvas and reads its palette; null when the host does not allow it (CORS). */
export function extractPalette(url: string): Promise<PaletteColor[] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = setTimeout(() => resolve(null), 15_000);
    img.onload = () => {
      clearTimeout(done);
      try {
        const scale = Math.min(1, 64 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(paletteFromPixels(ctx.getImageData(0, 0, w, h).data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(done); resolve(null); };
    img.src = url;
  });
}
