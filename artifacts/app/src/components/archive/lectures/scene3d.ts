/**
 * The geometry behind a ```plot3d block, kept apart from the canvas so it can
 * be tested: data scaled into a box, an orthographic camera turned by azimuth
 * and elevation, and every surface quad, segment and point sorted back to
 * front (the painter's algorithm), which is enough for one or two surfaces and
 * a few vectors and needs no WebGL.
 */
import { autoRange, ticks, type Plot3DSpec, type Range } from "./plot-spec";

export type V3 = [number, number, number];

export interface View {
  /** Turn around the vertical axis, radians. */
  az: number;
  /** Height of the eye above the floor, radians (-1.45 to 1.45). */
  el: number;
  zoom: number;
}

export const DEFAULT_VIEW: View = { az: -0.65, el: 0.5, zoom: 1 };

export interface SurfaceMesh {
  n: number;
  /** (n+1)² vertices in box coordinates, row by row (y outer, x inner); null where the value is not a number. */
  verts: (V3 | null)[];
  /** The value at each vertex scaled to 0..1 over the z range, for colour. */
  level: number[];
}

export interface Scene {
  /** The data ranges shown on the axes. */
  x: Range;
  y: Range;
  z: Range;
  /** Data -> box coordinates (about -1..1 on each axis). */
  toBox: (p: V3) => V3;
  surfaces: SurfaceMesh[];
  points: { at: V3; label: string | null }[];
  vectors: { from: V3; to: V3; label: string | null }[];
  ticks: { x: number[]; y: number[]; z: number[] };
  /** Arrows along the axes through the origin, for vector pictures. */
  originAxes: boolean;
}

const pad = (r: Range, k = 0.08): Range => {
  const d = r[1] - r[0] || 1;
  return [r[0] - d * k, r[1] + d * k];
};

const span = (vals: number[], withZero: boolean): Range => {
  const v = withZero ? [...vals, 0] : vals;
  if (!v.length) return [-1, 1];
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return hi > lo ? [lo, hi] : [lo - 1, hi + 1];
};

export function buildScene(spec: Plot3DSpec, n = 36): Scene {
  const samples = spec.surfaces.map((s) => {
    const vals: number[] = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const x = s.x[0] + ((s.x[1] - s.x[0]) * i) / n;
        const y = s.y[0] + ((s.y[1] - s.y[0]) * j) / n;
        vals.push(s.fn({ x, y }));
      }
    }
    const zr = s.z ?? autoRange(vals);
    return { s, vals, zr };
  });

  const hasSurface = samples.length > 0;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (const { s, zr } of samples) {
    xs.push(...s.x);
    ys.push(...s.y);
    zs.push(...zr);
  }
  for (const p of spec.points) {
    xs.push(p.x);
    ys.push(p.y);
    zs.push(p.z);
  }
  for (const v of spec.vectors) {
    for (const q of [v.from, v.to]) {
      xs.push(q[0]);
      ys.push(q[1]);
      zs.push(q[2]);
    }
  }
  // Points and vectors keep one unit on every axis (angles and lengths are the point);
  // a surface fills a box, as a function plot does.
  let x = span(xs, !hasSurface);
  let y = span(ys, !hasSurface);
  let z = span(zs, !hasSurface);
  if (!hasSurface) {
    x = pad(x, 0.15);
    y = pad(y, 0.15);
    z = pad(z, 0.15);
  }
  const half = (r: Range) => (r[1] - r[0]) / 2;
  const mid = (r: Range) => (r[0] + r[1]) / 2;
  let kx: number, ky: number, kz: number;
  if (hasSurface) {
    kx = 1 / half(x);
    ky = 1 / half(y);
    kz = 0.75 / half(z);
  } else {
    const k = 1 / Math.max(half(x), half(y), half(z));
    kx = ky = kz = k;
  }
  const toBox = (p: V3): V3 => [(p[0] - mid(x)) * kx, (p[1] - mid(y)) * ky, (p[2] - mid(z)) * kz];

  const surfaces: SurfaceMesh[] = samples.map(({ s, vals, zr }) => {
    const verts: (V3 | null)[] = [];
    const level: number[] = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const v = vals[j * (n + 1) + i];
        const xv = s.x[0] + ((s.x[1] - s.x[0]) * i) / n;
        const yv = s.y[0] + ((s.y[1] - s.y[0]) * j) / n;
        if (!Number.isFinite(v)) {
          verts.push(null);
          level.push(0);
          continue;
        }
        const zc = Math.max(zr[0], Math.min(zr[1], v));
        verts.push(toBox([xv, yv, zc]));
        level.push((zc - zr[0]) / (zr[1] - zr[0] || 1));
      }
    }
    return { n, verts, level };
  });

  return {
    x,
    y,
    z,
    toBox,
    surfaces,
    points: spec.points.map((p) => ({ at: toBox([p.x, p.y, p.z]), label: p.label })),
    vectors: spec.vectors.map((v) => ({ from: toBox(v.from), to: toBox(v.to), label: v.label })),
    ticks: { x: ticks(x[0], x[1], 4), y: ticks(y[0], y[1], 4), z: ticks(z[0], z[1], 4) },
    originAxes: !hasSurface,
  };
}

/**
 * The camera: box coordinates -> screen pixels (y down) plus depth (larger is
 * nearer the eye). Orthographic, so sizes do not change with distance.
 */
export function projector(view: View, width: number, height: number) {
  const ca = Math.cos(view.az);
  const sa = Math.sin(view.az);
  const ce = Math.cos(view.el);
  const se = Math.sin(view.el);
  const scale = (Math.min(width, height * 1.25) / 3.6) * view.zoom;
  const cx = width / 2;
  const cy = height / 2 + height * 0.04;
  return (p: V3): { x: number; y: number; depth: number } => {
    const x1 = p[0] * ca - p[1] * sa;
    const y1 = p[0] * sa + p[1] * ca;
    const z1 = p[2];
    const up = y1 * se + z1 * ce;
    const depth = -y1 * ce + z1 * se;
    return { x: cx + x1 * scale, y: cy - up * scale, depth };
  };
}

/** The view after a drag of (dx, dy) pixels from `start`. */
export function dragView(start: View, dx: number, dy: number): View {
  return { ...start, az: start.az - dx * 0.01, el: clampEl(start.el + dy * 0.01) };
}

export const clampEl = (el: number) => Math.max(-1.45, Math.min(1.45, el));
export const clampZoom = (z: number) => Math.max(0.4, Math.min(4, z));

/** The surface's colour at `level` (0..1): one blue hue from dark (low) to light (high). */
export function rampColor(level: number): V3 {
  const stops: V3[] = [
    [24, 79, 149],
    [57, 135, 229],
    [134, 182, 239],
    [205, 226, 251],
  ];
  const t = Math.max(0, Math.min(1, level)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) as V3;
}

export function hexRgb(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
