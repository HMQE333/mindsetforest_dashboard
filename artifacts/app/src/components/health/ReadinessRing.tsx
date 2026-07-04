import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import type { Verdict } from "@/lib/watch-data";
import { VERDICT_META } from "@/lib/watch-data";

interface Props {
  score: number; // 0-100
  verdict: Verdict;
  size?: number;
}

/**
 * Readiness gauge — the "Morning Report" score in one glance.
 * Echoes the health tree's visual language (staged colour + soft glow +
 * spring-in animation) but as a radial dial: a filling ring, a glowing tip,
 * a counting number, and the day's verdict word in the centre.
 */
export default function ReadinessRing({ score, verdict, size = 190 }: Props) {
  const meta = VERDICT_META[verdict];
  const R = 78;
  const cx = 100;
  const cy = 100;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  // Count-up number, synced with the arc fill.
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(Math.round(eased * score));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, score]);

  // Glowing tip at the end of the filled arc (starts at top, clockwise).
  const tipAngle = -90 + pct * 360;
  const tipRad = (tipAngle * Math.PI) / 180;
  const tipX = cx + R * Math.cos(tipRad);
  const tipY = cy + R * Math.sin(tipRad);

  const gradId = `readiness-grad-${verdict}`;

  return (
    <div ref={ref} className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <motion.svg
          viewBox="0 0 200 200"
          width={size}
          height={size}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 16px ${meta.color}55)` }}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={meta.color} stopOpacity="0.65" />
              <stop offset="100%" stopColor={meta.color} stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="hsl(var(--muted))" strokeOpacity={0.4} strokeWidth={12} />

          {/* Filled arc */}
          <motion.circle
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={12}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            initial={{ pathLength: 0 }}
            animate={inView ? { pathLength: pct } : { pathLength: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Glowing tip */}
          {pct > 0.02 && (
            <motion.circle
              cx={tipX}
              cy={tipY}
              r={6}
              fill={meta.color}
              initial={{ opacity: 0, scale: 0 }}
              animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0 }}
              transition={{ delay: 1.05, duration: 0.4 }}
              style={{ filter: `drop-shadow(0 0 8px ${meta.color})` }}
            />
          )}
        </motion.svg>

        {/* Centre readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="text-3xl leading-none mb-0.5"
          >
            {meta.emoji}
          </motion.div>
          <div className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: meta.color }}>
            {display}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">Readiness</div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-2 px-4 py-1 rounded-full text-xs font-extrabold tracking-[0.14em] border"
        style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}
      >
        {meta.word}
      </motion.div>
    </div>
  );
}
