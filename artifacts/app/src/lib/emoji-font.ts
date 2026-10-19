/**
 * Fluent emoji (the Windows 11 look) on every device. The font is
 * public/fonts/fluent-emoji/fluent-emoji.css, written by
 * scripts/fetch-emoji-font.mjs: 129 unicode-range subsets of 130-500 KB each,
 * and the landing page alone needs 11 of them (2.2 MB, far more than the app's
 * code). So it is kept off the first screen (src/main.tsx decides when):
 *
 * - First visit: emoji show in the system font until the visitor first
 *   interacts. Then the subsets holding the emoji on screen are fetched as
 *   FontFace objects that are not in the document yet, and every face is added
 *   in one go, so the page re-lays out once. (Through the stylesheet, each
 *   subset that arrives re-lays out the whole page: the family is in body's
 *   font stack.) The other subsets load on demand later, as from the stylesheet.
 * - Later visits: the files are in the browser's cache by then, so the plain
 *   stylesheet goes in at startup and emoji are Fluent from the first paint.
 */

const STORAGE_KEY = "mf-emoji-font";
const FAMILY = "Fluent Emoji Color";
const CSS_PATH = "fonts/fluent-emoji/fluent-emoji.css";

const cssUrl = () => new URL(`${import.meta.env.BASE_URL}${CSS_PATH}`, document.baseURI).href;

/** Whether this browser has loaded the font before (so its files are likely cached). */
export function emojiFontCached(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The stylesheet itself, as before: for a browser that has the files cached, or no FontFace API. */
export function addEmojiStylesheet(): void {
  if (document.querySelector("link[data-emoji-font]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssUrl();
  link.setAttribute("data-emoji-font", "");
  document.head.appendChild(link);
}

type Range = [number, number];

/** "U+1f600-1f64f, U+2764" -> [[0x1f600, 0x1f64f], [0x2764, 0x2764]] */
export function parseUnicodeRange(value: string): Range[] {
  const out: Range[] = [];
  for (const token of value.split(",")) {
    const [lo, hi] = token.trim().replace(/^U\+/i, "").split("-").map((h) => parseInt(h, 16));
    if (Number.isFinite(lo)) out.push([lo, Number.isFinite(hi) ? hi : lo]);
  }
  return out;
}

export interface EmojiFace {
  /** The face's `src` with each url() made absolute against the stylesheet. */
  src: string;
  unicodeRange: string;
  ranges: Range[];
}

/** The @font-face rules of the generated stylesheet. */
export function parseEmojiFaces(css: string, baseUrl: string): EmojiFace[] {
  const faces: EmojiFace[] = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const src = /src:\s*([^;]+);/.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1]?.trim();
    if (!src || !unicodeRange) continue;
    faces.push({
      src: src.replace(/url\((['"]?)([^'")]+)\1\)/g, (_, q: string, u: string) => `url(${q}${new URL(u, baseUrl).href}${q})`),
      unicodeRange,
      ranges: parseUnicodeRange(unicodeRange),
    });
  }
  return faces;
}

/**
 * The faces the browser would fetch for `text`. Where ranges overlap (one
 * emoji in several subsets), CSS checks the rule defined last first, and stops
 * at the first that covers the character.
 */
export function facesForText<T extends EmojiFace>(faces: T[], text: string): T[] {
  const points = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp > 0x7f) points.add(cp);
  }
  const picked = new Set<T>();
  for (const cp of points) {
    for (let i = faces.length - 1; i >= 0; i--) {
      if (faces[i].ranges.some(([lo, hi]) => cp >= lo && cp <= hi)) {
        picked.add(faces[i]);
        break;
      }
    }
  }
  return faces.filter((f) => picked.has(f));
}

/** First-visit path: fetch the subsets for the emoji on screen, then switch them all on at once. */
export async function loadEmojiFont(): Promise<void> {
  if (document.querySelector("link[data-emoji-font]")) return;
  if (typeof FontFace === "undefined" || !document.fonts) {
    addEmojiStylesheet();
    return;
  }
  const url = cssUrl();
  const res = await fetch(url);
  if (!res.ok) return;
  const faces = parseEmojiFaces(await res.text(), url).map((f) => ({
    ...f,
    face: new FontFace(FAMILY, f.src, { unicodeRange: f.unicodeRange, display: "swap" }),
  }));
  const needed = facesForText(faces, document.body.textContent ?? "");
  const loaded = await Promise.allSettled(needed.map((f) => f.face.load()));
  for (const f of faces) document.fonts.add(f.face);
  if (loaded.every((r) => r.status === "fulfilled")) {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* storage blocked: the next visit takes this path again */
    }
  }
}
