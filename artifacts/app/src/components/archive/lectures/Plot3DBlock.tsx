import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import BlockError from "./BlockError";
import { parsePlot3D, tickLabel, type Lang } from "./plot-spec";
import { DEFAULT_VIEW, buildScene, clampEl, clampZoom, dragView, hexRgb, projector, rampColor, type Scene, type V3, type View } from "./scene3d";
import { SERIES, useElementWidth } from "./useElementWidth";

const TEXT = {
  pl: {
    error: "Nie udało się narysować wykresu 3D",
    help: "Przeciągnij, aby obrócić. Strzałki obracają, plus i minus przybliżają, 0 przywraca widok.",
    left: "Obróć w lewo",
    right: "Obróć w prawo",
    up: "Spójrz z góry",
    down: "Spójrz z dołu",
    zoomIn: "Przybliż",
    zoomOut: "Oddal",
    reset: "Przywróć widok",
    surface: "powierzchnia",
    points: "punkty",
    vectors: "wektory",
    hint: "Przeciągnij, aby obrócić",
  },
  en: {
    error: "Could not draw the 3D plot",
    help: "Drag to rotate. Arrow keys rotate, plus and minus zoom, 0 resets the view.",
    left: "Rotate left",
    right: "Rotate right",
    up: "Look from above",
    down: "Look from below",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Reset the view",
    surface: "surface",
    points: "points",
    vectors: "vectors",
    hint: "Drag to rotate",
  },
};

const cssColor = (name: string, fallback: string) => {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : fallback;
};

const rgb = (c: V3, k = 1, a = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;

/**
 * A ```plot3d block: surfaces z = f(x, y), points and vectors on a canvas you
 * can turn with a mouse, a finger (sideways drag; the page still scrolls
 * up and down), the buttons or the keyboard.
 */
export default function Plot3DBlock({ source, lang }: { source: string; lang: Lang }) {
  const t = TEXT[lang];
  const parsed = useMemo(() => parsePlot3D(source, lang), [source, lang]);
  const scene = useMemo(() => (parsed.ok ? buildScene(parsed.spec) : null), [parsed]);
  const [box, width] = useElementWidth<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [moved, setMoved] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; start: View } | null>(null);
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);

  const W = Math.max(240, width);
  const H = Math.round(Math.min(420, Math.max(260, W * 0.72)));

  useEffect(() => {
    const el = canvas.current;
    if (!el || !scene) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = Math.round(W * dpr);
    el.height = Math.round(H * dpr);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(ctx, scene, view, W, H);
  }, [scene, view, W, H]);

  if (!parsed.ok || !scene) {
    return <BlockError title={t.error} message={parsed.ok ? "" : parsed.error} source={source} />;
  }
  const spec = parsed.spec;

  const turn = (daz: number, del: number) => {
    setMoved(true);
    setView((v) => ({ ...v, az: v.az + daz, el: clampEl(v.el + del) }));
  };
  const zoom = (k: number) => setView((v) => ({ ...v, zoom: clampZoom(v.zoom * k) }));

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: view.zoom };
      drag.current = null;
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: view };
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pinch.current.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.current.dist;
      setView((v) => ({ ...v, zoom: clampZoom(pinchStart.current!.zoom * k) }));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setMoved(true);
    setView(dragView(d.start, e.clientX - d.x, e.clientY - d.y));
  };
  const onUp = (e: PointerEvent<HTMLCanvasElement>) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = Math.PI / 12;
    const map: Record<string, () => void> = {
      ArrowLeft: () => turn(step, 0),
      ArrowRight: () => turn(-step, 0),
      ArrowUp: () => turn(0, step / 1.5),
      ArrowDown: () => turn(0, -step / 1.5),
      "+": () => zoom(1.2),
      "=": () => zoom(1.2),
      "-": () => zoom(1 / 1.2),
      "0": () => setView(DEFAULT_VIEW),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const parts = [
    ...spec.surfaces.map((s) => `${t.surface} z = ${s.expr}, x ${s.x[0]}…${s.x[1]}, y ${s.y[0]}…${s.y[1]}`),
    spec.points.length ? `${t.points}: ${spec.points.map((p) => `${p.label ?? ""}(${p.x}, ${p.y}, ${p.z})`).join(", ")}` : "",
    spec.vectors.length ? `${t.vectors}: ${spec.vectors.map((v) => `${v.label ?? ""} [${v.from.join(", ")}] → [${v.to.join(", ")}]`).join(", ")}` : "",
  ].filter(Boolean);
  const label = `${spec.title ? `${spec.title}. ` : ""}${parts.join("; ")}. ${t.help}`;
  const btn = "h-8 min-w-8 px-2 rounded-md border border-border/60 bg-background/60 text-sm text-foreground/85 hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <figure className="my-2 space-y-1.5">
      {spec.title && <figcaption className="text-sm font-semibold text-foreground">{spec.title}</figcaption>}
      <div ref={box} className="relative w-full">
        <canvas
          ref={canvas}
          style={{ width: W, height: H }}
          className="block max-w-full rounded-lg bg-muted/25 touch-pan-y cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          tabIndex={0}
          role="img"
          aria-label={label}
          aria-roledescription={lang === "pl" ? "interaktywny wykres 3D" : "interactive 3D plot"}
          data-az={view.az.toFixed(3)}
          data-el={view.el.toFixed(3)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        />
        {!moved && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-background/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            ⟲ {t.hint}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.help}>
        <button type="button" className={btn} onClick={() => turn(Math.PI / 12, 0)} aria-label={t.left} title={t.left}>⟲</button>
        <button type="button" className={btn} onClick={() => turn(-Math.PI / 12, 0)} aria-label={t.right} title={t.right}>⟳</button>
        <button type="button" className={btn} onClick={() => turn(0, Math.PI / 18)} aria-label={t.up} title={t.up}>▲</button>
        <button type="button" className={btn} onClick={() => turn(0, -Math.PI / 18)} aria-label={t.down} title={t.down}>▼</button>
        <button type="button" className={btn} onClick={() => zoom(1.2)} aria-label={t.zoomIn} title={t.zoomIn}>+</button>
        <button type="button" className={btn} onClick={() => zoom(1 / 1.2)} aria-label={t.zoomOut} title={t.zoomOut}>−</button>
        <button type="button" className={btn} onClick={() => { setView(DEFAULT_VIEW); setMoved(false); }} aria-label={t.reset} title={t.reset}>↺</button>
        {spec.surfaces.length > 0 && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {spec.surfaces.map((s) => s.label ?? `z = ${s.expr}`).join(" · ")}
          </span>
        )}
      </div>
    </figure>
  );
}

/** A light at the viewer's upper left (fixed to the eye, so turning the plot changes the shading), in box space. */
function lightInBox(view: View): V3 {
  const [r, u, d] = [-0.45, 0.55, 0.7];
  const ce = Math.cos(view.el);
  const se = Math.sin(view.el);
  const ca = Math.cos(view.az);
  const sa = Math.sin(view.az);
  // View space (right, up, toward the eye) -> the frame turned by az -> box space.
  const l1: V3 = [r, u * se - d * ce, u * ce + d * se];
  const out: V3 = [l1[0] * ca + l1[1] * sa, -l1[0] * sa + l1[1] * ca, l1[2]];
  const len = Math.hypot(...out);
  return [out[0] / len, out[1] / len, out[2] / len];
}

type Prim =
  | { k: "quad"; pts: { x: number; y: number }[]; depth: number; fill: string; edge: string }
  | { k: "seg"; a: { x: number; y: number }; b: { x: number; y: number }; depth: number; color: string; width: number; arrow: boolean; label: string | null }
  | { k: "dot"; p: { x: number; y: number }; depth: number; label: string | null };

function draw(ctx: CanvasRenderingContext2D, scene: Scene, view: View, W: number, H: number) {
  const fg = cssColor("--foreground", "#eef0f6");
  const muted = cssColor("--muted-foreground", "#8a8fa3");
  const bg = cssColor("--background", "#08090f");
  ctx.clearRect(0, 0, W, H);
  const P = projector(view, W, H);
  const font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.font = font;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const text = (s: string, x: number, y: number, color = muted, align: CanvasTextAlign = "center") => {
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = bg;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  };

  const { toBox } = scene;
  const [x0, x1] = scene.x;
  const [y0, y1] = scene.y;
  const [z0, z1] = scene.z;
  const prims: Prim[] = [];

  if (!scene.originAxes) {
    // The floor at the lowest z: a grid with tick labels on its two nearest edges, and a z axis at its farthest corner.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (const xv of scene.ticks.x) line(P(toBox([xv, y0, z0])), P(toBox([xv, y1, z0])));
    for (const yv of scene.ticks.y) line(P(toBox([x0, yv, z0])), P(toBox([x1, yv, z0])));
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (let i = 0; i < 4; i++) {
      const [a, b] = [corners[i], corners[(i + 1) % 4]];
      line(P(toBox([a[0], a[1], z0])), P(toBox([b[0], b[1], z0])));
    }
    const depthOf = ([cx, cy]: [number, number]) => P(toBox([cx, cy, z0])).depth;
    const far = [...corners].sort((a, b) => depthOf(a) - depthOf(b))[0];
    const near = [...corners].sort((a, b) => depthOf(b) - depthOf(a))[0];
    line(P(toBox([far[0], far[1], z0])), P(toBox([far[0], far[1], z1])));
    // Tick labels: x along the edge through the nearest corner at y = near y, y along x = near x.
    for (const xv of scene.ticks.x) {
      const p = P(toBox([xv, near[1] + (near[1] === y0 ? -1 : 1) * (y1 - y0) * 0.09, z0]));
      text(tickLabel(xv), p.x, p.y);
    }
    for (const yv of scene.ticks.y) {
      const p = P(toBox([near[0] + (near[0] === x0 ? -1 : 1) * (x1 - x0) * 0.09, yv, z0]));
      text(tickLabel(yv), p.x, p.y);
    }
    for (const zv of scene.ticks.z) {
      const p = P(toBox([far[0], far[1], zv]));
      text(tickLabel(zv), p.x - 8, p.y, muted, "right");
    }
    const xl = P(toBox([(x0 + x1) / 2, near[1] + (near[1] === y0 ? -1 : 1) * (y1 - y0) * 0.2, z0]));
    text("x", xl.x, xl.y, fg);
    const yl = P(toBox([near[0] + (near[0] === x0 ? -1 : 1) * (x1 - x0) * 0.2, (y0 + y1) / 2, z0]));
    text("y", yl.x, yl.y, fg);
    const zl = P(toBox([far[0], far[1], z1 + (z1 - z0) * 0.08]));
    text("z", zl.x, zl.y, fg);
  } else {
    // Points and vectors: axes through the origin, part of the depth order.
    const axes: [V3, string][] = [
      [[x1, 0, 0], "x"],
      [[0, y1, 0], "y"],
      [[0, 0, z1], "z"],
    ];
    const lo: V3[] = [[x0, 0, 0], [0, y0, 0], [0, 0, z0]];
    axes.forEach(([end, name], i) => {
      const a = P(toBox(lo[i]));
      const b = P(toBox(end));
      prims.push({ k: "seg", a, b, depth: (a.depth + b.depth) / 2 - 10, color: "rgba(255,255,255,0.35)", width: 1, arrow: true, label: name });
    });
  }

  scene.surfaces.forEach((s, si) => {
    const { n, verts, level } = s;
    const solid = scene.surfaces.length > 1 ? hexRgb(SERIES[si % SERIES.length]) : null;
    const proj = verts.map((v) => (v ? P(v) : null));
    const L = lightInBox(view);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const ids = [j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i];
        const q = ids.map((k) => proj[k]);
        if (q.some((p) => !p)) continue;
        const v = ids.map((k) => verts[k]!);
        // Lambert shading from a light at the viewer's upper left, both faces lit.
        const u: V3 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]];
        const w: V3 = [v[3][0] - v[0][0], v[3][1] - v[0][1], v[3][2] - v[0][2]];
        const nx = u[1] * w[2] - u[2] * w[1];
        const ny = u[2] * w[0] - u[0] * w[2];
        const nz = u[0] * w[1] - u[1] * w[0];
        const len = Math.hypot(nx, ny, nz) || 1;
        const lambert = Math.abs((nx * L[0] + ny * L[1] + nz * L[2]) / len);
        const shade = 0.5 + 0.5 * lambert;
        const lv = (level[ids[0]] + level[ids[1]] + level[ids[2]] + level[ids[3]]) / 4;
        const base = solid ?? rampColor(lv);
        prims.push({
          k: "quad",
          pts: q as { x: number; y: number }[],
          depth: (q[0]!.depth + q[1]!.depth + q[2]!.depth + q[3]!.depth) / 4,
          fill: rgb(base, shade),
          edge: rgb(base, shade * 0.72),
        });
      }
    }
  });

  const vecStart = scene.surfaces.length ? 1 : 0;
  scene.vectors.forEach((v, i) => {
    const a = P(v.from);
    const b = P(v.to);
    prims.push({ k: "seg", a, b, depth: Math.max(a.depth, b.depth), color: SERIES[(vecStart + i) % SERIES.length], width: 2.5, arrow: true, label: v.label });
  });
  scene.points.forEach((p) => {
    const q = P(p.at);
    prims.push({ k: "dot", p: q, depth: q.depth + 0.01, label: p.label });
  });

  prims.sort((a, b) => a.depth - b.depth);
  for (const pr of prims) {
    if (pr.k === "quad") {
      ctx.beginPath();
      ctx.moveTo(pr.pts[0].x, pr.pts[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(pr.pts[k].x, pr.pts[k].y);
      ctx.closePath();
      ctx.fillStyle = pr.fill;
      ctx.fill();
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = pr.edge;
      ctx.stroke();
    } else if (pr.k === "seg") {
      ctx.lineWidth = pr.width;
      ctx.strokeStyle = pr.color;
      line(pr.a, pr.b);
      if (pr.arrow) {
        const ang = Math.atan2(pr.b.y - pr.a.y, pr.b.x - pr.a.x);
        const len = Math.hypot(pr.b.x - pr.a.x, pr.b.y - pr.a.y);
        const head = Math.min(11, len * 0.35);
        if (head > 2) {
          ctx.beginPath();
          ctx.moveTo(pr.b.x, pr.b.y);
          ctx.lineTo(pr.b.x - head * Math.cos(ang - 0.42), pr.b.y - head * Math.sin(ang - 0.42));
          ctx.lineTo(pr.b.x - head * Math.cos(ang + 0.42), pr.b.y - head * Math.sin(ang + 0.42));
          ctx.closePath();
          ctx.fillStyle = pr.color;
          ctx.fill();
        }
      }
      if (pr.label) {
        const ang = Math.atan2(pr.b.y - pr.a.y, pr.b.x - pr.a.x);
        text(pr.label, pr.b.x + Math.cos(ang) * 12, pr.b.y + Math.sin(ang) * 12, fg);
      }
    } else {
      ctx.beginPath();
      ctx.arc(pr.p.x, pr.p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = fg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = bg;
      ctx.stroke();
      if (pr.label) text(pr.label, pr.p.x + 9, pr.p.y - 9, fg, "left");
    }
  }

  function line(a: { x: number; y: number }, b: { x: number; y: number }) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}
