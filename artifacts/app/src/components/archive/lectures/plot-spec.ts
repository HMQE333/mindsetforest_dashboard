/**
 * The ```plot and ```plot3d blocks of a lecture summary (vault format 2):
 * strict JSON, checked here before anything is drawn, so a bad block becomes
 * a readable error instead of a broken note.
 *
 * plot:   one object (it may span lines):
 *         {"title", "x": [min, max], "y"?: [min, max], "functions": [{"expr", "label"?}], "points"?: [{"x", "y", "label"?}]}
 * plot3d: one object per line (or one array of them):
 *         {"kind": "surface", "expr", "x": [min, max], "y": [min, max], "z"?: [min, max], "title"?, "label"?}
 *         {"kind": "points", "points": [{"x", "y", "z", "label"?}]}
 *         {"kind": "vectors", "vectors": [{"from": [x, y, z], "to": [x, y, z], "label"?}]}
 */
import { compile, exprErrorText, type Compiled } from "./expr";

export type Lang = "pl" | "en";
export type Range = [number, number];

export interface PlotFunction {
  expr: string;
  label: string | null;
  fn: Compiled;
}

export interface PlotSpec {
  title: string | null;
  x: Range;
  y: Range | null;
  functions: PlotFunction[];
  points: { x: number; y: number; label: string | null }[];
}

export interface Surface {
  expr: string;
  label: string | null;
  fn: Compiled;
  x: Range;
  y: Range;
  z: Range | null;
}

export interface Plot3DSpec {
  title: string | null;
  surfaces: Surface[];
  points: { x: number; y: number; z: number; label: string | null }[];
  vectors: { from: [number, number, number]; to: [number, number, number]; label: string | null }[];
}

export type Parsed<T> = { ok: true; spec: T } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

class SpecError extends Error {}

const T = {
  pl: {
    json: (line: number | null, msg: string) => `Niepoprawny JSON${line ? ` w wierszu ${line}` : ""}: ${msg}`,
    object: "Blok musi być obiektem JSON w nawiasach { }.",
    range: (key: string) => `„${key}” musi być parą liczb [min, max], gdzie min < max.`,
    functions: "„functions” musi być niepustą listą obiektów z polem „expr”.",
    points: "„points” musi być listą obiektów z liczbami x i y.",
    points3d: "„points” musi być listą obiektów z liczbami x, y i z.",
    vectors: "„vectors” musi być listą obiektów z „from” i „to”, każde jako [x, y, z].",
    kind: (k: string) => `Nieznany rodzaj „${k}”. Dozwolone: surface, points, vectors.`,
    empty: "Blok jest pusty.",
  },
  en: {
    json: (line: number | null, msg: string) => `Invalid JSON${line ? ` on line ${line}` : ""}: ${msg}`,
    object: "The block must be a JSON object in { }.",
    range: (key: string) => `"${key}" must be a pair of numbers [min, max] with min < max.`,
    functions: '"functions" must be a non-empty list of objects with an "expr".',
    points: '"points" must be a list of objects with numbers x and y.',
    points3d: '"points" must be a list of objects with numbers x, y and z.',
    vectors: '"vectors" must be a list of objects with "from" and "to", each as [x, y, z].',
    kind: (k: string) => `Unknown kind "${k}". Allowed: surface, points, vectors.`,
    empty: "The block is empty.",
  },
};

function range(v: unknown, key: string, lang: Lang, optional = false): Range | null {
  if (v === undefined && optional) return null;
  if (!Array.isArray(v) || v.length !== 2) throw new SpecError(T[lang].range(key));
  const a = num(v[0]);
  const b = num(v[1]);
  if (a === null || b === null || !(a < b)) throw new SpecError(T[lang].range(key));
  return [a, b];
}

function expression(src: unknown, vars: ("x" | "y")[], lang: Lang): { expr: string; fn: Compiled } {
  const expr = typeof src === "number" ? String(src) : str(src);
  if (expr === null) throw new SpecError(T[lang].functions);
  try {
    return { expr, fn: compile(expr, vars) };
  } catch (e) {
    throw new SpecError(exprErrorText(e, expr, lang));
  }
}

function jsonError(e: unknown): string {
  return e instanceof Error ? e.message.replace(/^JSON\.parse: /, "") : String(e);
}

export function parsePlot(src: string, lang: Lang): Parsed<PlotSpec> {
  let raw: unknown;
  try {
    raw = JSON.parse(src);
  } catch (e) {
    return { ok: false, error: T[lang].json(null, jsonError(e)) };
  }
  try {
    if (!isObj(raw)) throw new SpecError(T[lang].object);
    const x = range(raw.x, "x", lang)!;
    const y = range(raw.y, "y", lang, true);
    if (!Array.isArray(raw.functions) || raw.functions.length === 0) throw new SpecError(T[lang].functions);
    const functions = raw.functions.map((f) => {
      if (!isObj(f)) throw new SpecError(T[lang].functions);
      return { ...expression(f.expr, ["x"], lang), label: str(f.label) };
    });
    const points = raw.points === undefined ? [] : pointList(raw.points, false, lang);
    return {
      ok: true,
      spec: { title: str(raw.title), x, y, functions, points: points.map(({ x, y, label }) => ({ x, y, label })) },
    };
  } catch (e) {
    return { ok: false, error: e instanceof SpecError ? e.message : String(e) };
  }
}

function pointList(v: unknown, three: boolean, lang: Lang) {
  const msg = three ? T[lang].points3d : T[lang].points;
  if (!Array.isArray(v)) throw new SpecError(msg);
  return v.map((p) => {
    if (!isObj(p)) throw new SpecError(msg);
    const x = num(p.x);
    const y = num(p.y);
    const z = three ? num(p.z) : 0;
    if (x === null || y === null || z === null) throw new SpecError(msg);
    return { x, y, z, label: str(p.label) ?? (typeof p.label === "number" ? String(p.label) : null) };
  });
}

function vec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map(num);
  return out.every((n): n is number => n !== null) ? (out as [number, number, number]) : null;
}

export function parsePlot3D(src: string, lang: Lang): Parsed<Plot3DSpec> {
  const items: { raw: unknown; line: number }[] = [];
  const text = src.trim();
  if (!text) return { ok: false, error: T[lang].empty };
  // One array, or one object spread over lines, or one object per line.
  let whole: unknown = undefined;
  try {
    whole = JSON.parse(text);
  } catch {
    /* per line below */
  }
  if (Array.isArray(whole)) whole.forEach((raw, i) => items.push({ raw, line: i + 1 }));
  else if (whole !== undefined) items.push({ raw: whole, line: 1 });
  else {
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      try {
        items.push({ raw: JSON.parse(l), line: i + 1 });
      } catch (e) {
        return { ok: false, error: T[lang].json(i + 1, jsonError(e)) };
      }
    }
  }
  const spec: Plot3DSpec = { title: null, surfaces: [], points: [], vectors: [] };
  try {
    for (const { raw } of items) {
      if (!isObj(raw)) throw new SpecError(T[lang].object);
      spec.title ??= str(raw.title);
      const kind = str(raw.kind) ?? (raw.expr !== undefined ? "surface" : raw.points ? "points" : raw.vectors ? "vectors" : "");
      if (kind === "surface") {
        spec.surfaces.push({
          ...expression(raw.expr, ["x", "y"], lang),
          label: str(raw.label),
          x: range(raw.x, "x", lang)!,
          y: range(raw.y, "y", lang)!,
          z: range(raw.z, "z", lang, true),
        });
      } else if (kind === "points") {
        spec.points.push(...pointList(raw.points, true, lang));
      } else if (kind === "vectors") {
        if (!Array.isArray(raw.vectors)) throw new SpecError(T[lang].vectors);
        for (const v of raw.vectors) {
          if (!isObj(v)) throw new SpecError(T[lang].vectors);
          const to = vec3(v.to);
          const from = v.from === undefined ? [0, 0, 0] as [number, number, number] : vec3(v.from);
          if (!to || !from) throw new SpecError(T[lang].vectors);
          spec.vectors.push({ from, to, label: str(v.label) });
        }
      } else throw new SpecError(T[lang].kind(kind || "?"));
    }
    if (!spec.surfaces.length && !spec.points.length && !spec.vectors.length) throw new SpecError(T[lang].empty);
    return { ok: true, spec };
  } catch (e) {
    return { ok: false, error: e instanceof SpecError ? e.message : String(e) };
  }
}

// -- sampling ------------------------------------------------------------------------

/** "Nice" tick values covering [min, max], about `count` of them (steps of 1, 2 or 5 × 10^k). */
export function ticks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

/** 0.30000000000000004 -> "0.3", 1500 -> "1500", 0.000012 -> "1.2e-5". */
export function tickLabel(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1).replace(/\.0e/, "e").replace("e+", "e");
  return String(Number(v.toPrecision(6)));
}

/**
 * The function sampled over [x0, x1] as polyline runs: a run breaks where the
 * value is not a number or jumps by more than the visible height (tan at
 * pi/2), so an asymptote is not drawn as a vertical line.
 */
export function sampleRuns(fn: Compiled, x: Range, yView: Range | null, n = 480): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  const height = yView ? yView[1] - yView[0] : Infinity;
  let prev: number | null = null;
  for (let i = 0; i <= n; i++) {
    const xv = x[0] + ((x[1] - x[0]) * i) / n;
    const yv = fn({ x: xv });
    if (!Number.isFinite(yv) || (prev !== null && Math.abs(yv - prev) > height)) {
      if (run.length > 1) runs.push(run);
      run = Number.isFinite(yv) ? [[xv, yv]] : [];
      prev = Number.isFinite(yv) ? yv : null;
      continue;
    }
    run.push([xv, yv]);
    prev = yv;
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** A y range for a plot without one: the values' spread, with the extreme 2% cut (asymptotes) and some air. */
export function autoRange(values: number[], fallback: Range = [-1, 1]): Range {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return fallback;
  const lo = v[Math.floor(v.length * 0.02)];
  const hi = v[Math.min(v.length - 1, Math.ceil(v.length * 0.98) - 1)];
  if (!(hi > lo)) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}
