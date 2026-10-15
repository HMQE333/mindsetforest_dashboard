import { useId, useMemo, useState, type PointerEvent } from "react";
import BlockError from "./BlockError";
import { autoRange, parsePlot, sampleRuns, tickLabel, ticks, type Lang, type Range } from "./plot-spec";
import { SERIES, useElementWidth } from "./useElementWidth";

const PAD = { l: 44, r: 14, t: 12, b: 28 };

/**
 * A ```plot block: functions of x drawn as an SVG, sized to the column so text
 * stays legible on a phone. Hover (or touch) shows each function's value.
 */
export default function PlotBlock({ source, lang }: { source: string; lang: Lang }) {
  const parsed = useMemo(() => parsePlot(source, lang), [source, lang]);
  const [box, width] = useElementWidth<HTMLDivElement>();
  const clip = `kos-plot-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [hoverX, setHoverX] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (!parsed.ok) return null;
    const { spec } = parsed;
    const fns = spec.functions.slice(0, SERIES.length);
    let y: Range = spec.y ?? [0, 1];
    if (!spec.y) {
      const values: number[] = [];
      for (const f of fns) for (const run of sampleRuns(f.fn, spec.x, null, 240)) for (const [, v] of run) values.push(v);
      for (const p of spec.points) values.push(p.y);
      y = autoRange(values);
    }
    const runs = fns.map((f) => sampleRuns(f.fn, spec.x, y));
    return { spec, fns, y, runs };
  }, [parsed]);

  if (!parsed.ok || !geo) {
    return <BlockError title={lang === "pl" ? "Nie udało się narysować wykresu" : "Could not draw the plot"} message={parsed.ok ? "" : parsed.error} source={source} />;
  }

  const { spec, fns, y, runs } = geo;
  const W = Math.max(240, width);
  const H = Math.round(Math.min(380, Math.max(220, W * 0.62)));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const sx = (v: number) => PAD.l + ((v - spec.x[0]) / (spec.x[1] - spec.x[0])) * iw;
  const sy = (v: number) => PAD.t + ((y[1] - v) / (y[1] - y[0])) * ih;
  const xt = ticks(spec.x[0], spec.x[1], Math.max(3, Math.round(iw / 80)));
  const yt = ticks(y[0], y[1], Math.max(3, Math.round(ih / 50)));
  const axisY = y[0] <= 0 && y[1] >= 0 ? sy(0) : null;
  const axisX = spec.x[0] <= 0 && spec.x[1] >= 0 ? sx(0) : null;
  const path = (run: [number, number][]) =>
    run.map(([a, b], i) => `${i ? "L" : "M"}${sx(a).toFixed(1)},${sy(Math.max(y[0] - (y[1] - y[0]), Math.min(y[1] + (y[1] - y[0]), b))).toFixed(1)}`).join("");
  const legend = fns.length > 1 || fns.some((f) => f.label);
  const name = (i: number) => fns[i].label ?? fns[i].expr;
  const describe =
    (spec.title ? `${spec.title}. ` : "") +
    (lang === "pl" ? "Wykres: " : "Plot: ") +
    fns.map((f) => `y = ${f.expr}`).join("; ") +
    (lang === "pl" ? `, x od ${spec.x[0]} do ${spec.x[1]}.` : `, x from ${spec.x[0]} to ${spec.x[1]}.`);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < PAD.l || px > W - PAD.r) return setHoverX(null);
    setHoverX(spec.x[0] + ((px - PAD.l) / iw) * (spec.x[1] - spec.x[0]));
  };
  const hover = hoverX === null ? null : fns.map((f) => f.fn({ x: hoverX }));

  return (
    <figure className="my-2 space-y-1.5" data-plot="2d">
      {spec.title && <figcaption className="text-sm font-semibold text-foreground">{spec.title}</figcaption>}
      <div ref={box} className="relative w-full">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={describe}
          className="block max-w-full touch-pan-y select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverX(null)}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={PAD.l} y={PAD.t} width={iw} height={ih} />
            </clipPath>
          </defs>
          <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="hsl(var(--muted) / 0.25)" rx={4} />
          {xt.map((v) => (
            <g key={`x${v}`}>
              <line x1={sx(v)} x2={sx(v)} y1={PAD.t} y2={PAD.t + ih} stroke="hsl(var(--foreground) / 0.07)" />
              <text x={sx(v)} y={H - 9} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">{tickLabel(v)}</text>
            </g>
          ))}
          {yt.map((v) => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={PAD.l + iw} y1={sy(v)} y2={sy(v)} stroke="hsl(var(--foreground) / 0.07)" />
              <text x={PAD.l - 6} y={sy(v) + 4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">{tickLabel(v)}</text>
            </g>
          ))}
          {axisY !== null && <line x1={PAD.l} x2={PAD.l + iw} y1={axisY} y2={axisY} stroke="hsl(var(--foreground) / 0.35)" />}
          {axisX !== null && <line x1={axisX} x2={axisX} y1={PAD.t} y2={PAD.t + ih} stroke="hsl(var(--foreground) / 0.35)" />}
          <g clipPath={`url(#${clip})`}>
            {runs.map((rs, i) =>
              rs.map((run, j) => <path key={`${i}-${j}`} d={path(run)} fill="none" stroke={SERIES[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />),
            )}
            {spec.points.map((p, i) => (
              <g key={`p${i}`}>
                <circle cx={sx(p.x)} cy={sy(p.y)} r={4.5} fill="hsl(var(--foreground))" stroke="hsl(var(--background))" strokeWidth={2} />
                {p.label && (
                  <text x={sx(p.x) + 7} y={sy(p.y) - 7} fontSize={12} fill="hsl(var(--foreground))" paintOrder="stroke" stroke="hsl(var(--background))" strokeWidth={3}>
                    {p.label}
                  </text>
                )}
              </g>
            ))}
            {hoverX !== null && hover && (
              <g pointerEvents="none">
                <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.t} y2={PAD.t + ih} stroke="hsl(var(--foreground) / 0.4)" strokeDasharray="3 3" />
                {hover.map((v, i) =>
                  Number.isFinite(v) && v >= y[0] && v <= y[1] ? (
                    <circle key={i} cx={sx(hoverX)} cy={sy(v)} r={4} fill={SERIES[i]} stroke="hsl(var(--background))" strokeWidth={2} />
                  ) : null,
                )}
              </g>
            )}
          </g>
        </svg>
        {hoverX !== null && hover && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-border bg-popover/95 px-2 py-1 text-[11px] leading-4 shadow-md tabular-nums"
            style={sx(hoverX) > W / 2 ? { right: W - sx(hoverX) + 10 } : { left: sx(hoverX) + 10 }}
          >
            <div className="text-muted-foreground">x = {fmt(hoverX)}</div>
            {hover.map((v, i) => (
              <div key={i} className="flex items-center gap-1.5 text-foreground">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES[i] }} />
                {legend ? `${name(i)}: ` : "y = "}
                {Number.isFinite(v) ? fmt(v) : "—"}
              </div>
            ))}
          </div>
        )}
      </div>
      {legend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/85">
          {fns.map((f, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES[i] }} aria-hidden="true" />
              {f.label ?? `y = ${f.expr}`}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

const fmt = (v: number) => String(Number(v.toPrecision(4)));
