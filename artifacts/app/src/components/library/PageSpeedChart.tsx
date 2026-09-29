import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_WORDS_FOR_WPM, binPages, formatSpan, perPage, type PageSample } from "@/lib/reading-speed";

interface PageSpeedChartProps {
  samples: PageSample[];
  /** The book's colour: one series, so no legend. */
  color: string;
  height?: number;
}

const PAD = { top: 10, right: 8, bottom: 18, left: 34 };
const MIN_BAND = 6;
const MAX_BAR = 24;

/** Clean top for the y axis: 30 s, 1 min, 2 min, 5 min... */
function niceMax(v: number): number {
  const steps = [30, 60, 90, 120, 180, 240, 300, 420, 600];
  return steps.find((s) => s >= v) ?? Math.ceil(v / 60) * 60;
}

function tickLabel(s: number): string {
  if (s === 0) return "0";
  return s < 60 ? `${s}s` : s % 60 === 0 ? `${s / 60}m` : `${(s / 60).toFixed(1)}m`;
}

/**
 * Time per page across the book, as columns in page order. A long book pools
 * neighbouring pages so every column keeps at least a few pixels; hovering a
 * column gives its pages, time and (for text pages) words per minute.
 */
export default function PageSpeedChart({ samples, color, height = 132 }: PageSpeedChartProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const pages = useMemo(() => perPage(samples), [samples]);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const bins = useMemo(() => binPages(pages, Math.max(1, Math.floor(plotW / MIN_BAND))), [pages, plotW]);
  const average = pages.length ? pages.reduce((n, p) => n + p.seconds, 0) / pages.length : 0;
  const yMax = niceMax(Math.max(...bins.map((b) => b.seconds), average, 1));
  const y = (s: number) => PAD.top + plotH - (s / yMax) * plotH;
  const band = bins.length ? plotW / bins.length : 0;
  const barW = Math.max(2, Math.min(MAX_BAR, band - 2));
  const ticks = [0, yMax / 2, yMax];

  const hovered = hover !== null ? bins[hover] : null;
  const hoveredPage = hovered && hovered.count === 1 ? pages.find((p) => p.page === hovered.from) : undefined;
  const wpm = hoveredPage?.words && hoveredPage.words >= MIN_WORDS_FOR_WPM ? Math.round((hoveredPage.words * 60) / hoveredPage.seconds) : null;

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Time per page over ${pages.length} pages read, average ${formatSpan(average)}`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10} style={{ fontVariantNumeric: "tabular-nums" }}>
                {tickLabel(t)}
              </text>
            </g>
          ))}

          {bins.map((b, i) => {
            const x = PAD.left + i * band + (band - barW) / 2;
            const top = y(b.seconds);
            const h = Math.max(1, PAD.top + plotH - top);
            const r = Math.min(4, barW / 2, h);
            // Rounded at the data end, square on the baseline.
            const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
            return <path key={i} d={d} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />;
          })}

          {/* Average, as a quiet reference line with its value. */}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(average)} y2={y(average)} stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={1} />
          <text x={width - PAD.right} y={y(average) - 4} textAnchor="end" fontSize={10} className="fill-foreground" fillOpacity={0.75}>
            avg {formatSpan(average)}
          </text>

          {bins.length > 0 && (
            <>
              <text x={PAD.left} y={height - 4} fontSize={10} className="fill-muted-foreground">p. {bins[0].from}</text>
              <text x={width - PAD.right} y={height - 4} textAnchor="end" fontSize={10} className="fill-muted-foreground">p. {bins[bins.length - 1].to}</text>
            </>
          )}

          {/* Hit targets: the whole column band, taller than the bar. */}
          {bins.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={PAD.left + i * band}
              y={PAD.top}
              width={band}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          ))}
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground shadow-md whitespace-nowrap"
          style={{
            left: Math.min(Math.max(PAD.left + (hover as number) * band + band / 2, 70), width - 70),
            top: 0,
          }}
        >
          <p className="font-semibold">{hovered.from === hovered.to ? `Page ${hovered.from}` : `Pages ${hovered.from}–${hovered.to}`}</p>
          <p className="text-muted-foreground">
            {formatSpan(hovered.seconds)} {hovered.count > 1 ? "per page" : ""}
            {wpm ? ` · ${wpm} words/min` : ""}
          </p>
        </div>
      )}

      <table className="sr-only">
        <caption>Time per page</caption>
        <thead><tr><th>Page</th><th>Seconds</th></tr></thead>
        <tbody>
          {pages.map((p) => <tr key={p.page}><td>{p.page}</td><td>{Math.round(p.seconds)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
