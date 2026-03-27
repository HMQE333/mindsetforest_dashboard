import { motion } from "framer-motion";
import { RUNES } from "@/lib/breathing-data";
import type { BreathPhase, VesselShape } from "@/lib/breathing-data";

interface Props {
  phase: BreathPhase;
  fillLevel: number;
  progress: number;
  phaseDuration: number;
  shape?: VesselShape;
}

const VESSEL_PATHS: Record<VesselShape, string> = {
  urn: "M60,30 Q60,10 80,10 L120,10 Q140,10 140,30 L145,60 Q155,80 155,120 L155,180 Q155,240 130,260 L70,260 Q45,240 45,180 L45,120 Q45,80 55,60 Z",
  orb: "M100,10 Q160,10 170,80 Q180,140 170,200 Q160,270 100,270 Q40,270 30,200 Q20,140 30,80 Q40,10 100,10 Z",
  hourglass: "M55,10 L145,10 Q150,10 150,15 L150,30 Q150,50 130,80 Q110,110 105,140 Q110,170 130,200 Q150,230 150,250 L150,265 Q150,270 145,270 L55,270 Q50,270 50,265 L50,250 Q50,230 70,200 Q90,170 95,140 Q90,110 70,80 Q50,50 50,30 L50,15 Q50,10 55,10 Z",
  ampoule: "M85,10 Q80,10 80,15 L80,70 Q80,80 70,90 Q50,110 45,140 L45,200 Q45,260 70,270 L130,270 Q155,260 155,200 L155,140 Q150,110 130,90 Q120,80 120,70 L120,15 Q120,10 115,10 Z",
};

const VESSEL_ENGRAVINGS: Record<VesselShape, { x: number; y: number; char: string }[]> = {
  urn: [
    { x: 65, y: 150, char: "ᚱ" },
    { x: 125, y: 150, char: "ᛊ" },
    { x: 95, y: 250, char: "ᚾ" },
  ],
  orb: [
    { x: 60, y: 140, char: "ᚨ" },
    { x: 130, y: 140, char: "ᛖ" },
    { x: 95, y: 60, char: "ᚱ" },
    { x: 95, y: 240, char: "ᚢ" },
  ],
  hourglass: [
    { x: 65, y: 45, char: "ᚱ" },
    { x: 120, y: 45, char: "ᛊ" },
    { x: 65, y: 250, char: "ᚾ" },
    { x: 120, y: 250, char: "ᛖ" },
  ],
  ampoule: [
    { x: 92, y: 55, char: "ᚨ" },
    { x: 60, y: 200, char: "ᚱ" },
    { x: 130, y: 200, char: "ᛊ" },
  ],
};

const BreathingVessel = ({ phase, fillLevel, progress, phaseDuration, shape = "urn" }: Props) => {
  const isActive = phase === "inhale" || phase === "exhale";
  const glowIntensity = phase === "inhale" ? 0.6 + fillLevel * 0.4 : phase === "hold1" ? 0.8 : 0.3 + fillLevel * 0.3;
  const vesselPath = VESSEL_PATHS[shape];
  const engravings = VESSEL_ENGRAVINGS[shape];

  return (
    <div className="relative flex items-center justify-center" style={{ width: 280, height: 340 }}>
      {/* Outer glow */}
      <motion.div
        className="absolute rounded-full"
        style={{ width: 260, height: 260, top: 40 }}
        animate={{
          boxShadow: `0 0 ${40 + glowIntensity * 60}px ${10 + glowIntensity * 20}px hsla(185, 80%, 55%, ${glowIntensity * 0.35})`,
        }}
        transition={{ duration: phaseDuration, ease: "easeInOut" }}
      />

      {/* Runes orbiting */}
      {RUNES.map((rune, i) => {
        const angle = (i / RUNES.length) * Math.PI * 2 - Math.PI / 2;
        const radius = 140;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius + 20;
        const runeActive = progress > 0 && (i / RUNES.length) <= progress;

        return (
          <motion.span
            key={i}
            className="absolute text-xl font-bold select-none"
            style={{ left: `calc(50% + ${x}px - 12px)`, top: `calc(50% + ${y}px - 12px)` }}
            animate={{
              color: runeActive
                ? `hsla(185, 90%, 70%, ${0.7 + Math.sin(Date.now() / 800 + i) * 0.3})`
                : "hsla(185, 40%, 35%, 0.3)",
              textShadow: runeActive
                ? `0 0 12px hsla(185, 90%, 60%, 0.6)`
                : "none",
              scale: runeActive && phase === "inhale" ? [1, 1.15, 1] : 1,
            }}
            transition={{ duration: 2, repeat: runeActive ? Infinity : 0, repeatType: "reverse" }}
          >
            {rune}
          </motion.span>
        );
      })}

      {/* Vessel SVG */}
      <svg viewBox="0 0 200 280" className="relative z-10" style={{ width: 180, height: 260 }}>
        <defs>
          <clipPath id="vesselClip">
            <path d={vesselPath} />
          </clipPath>
          <linearGradient id="vesselGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsla(185, 60%, 25%, 0.3)" />
            <stop offset="100%" stopColor="hsla(185, 60%, 15%, 0.5)" />
          </linearGradient>
          <linearGradient id="airGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsla(185, 90%, 65%, 0.7)" />
            <stop offset="50%" stopColor="hsla(190, 85%, 50%, 0.5)" />
            <stop offset="100%" stopColor="hsla(195, 80%, 40%, 0.6)" />
          </linearGradient>
        </defs>

        {/* Vessel outline */}
        <path
          d={vesselPath}
          fill="url(#vesselGrad)"
          stroke="hsla(185, 50%, 45%, 0.4)"
          strokeWidth="1.5"
        />

        {/* Rune engravings on vessel */}
        {engravings.map((e, i) => (
          <text key={i} x={e.x} y={e.y} fill="hsla(185, 50%, 50%, 0.15)" fontSize="14" fontWeight="bold">{e.char}</text>
        ))}

        {/* Air fill */}
        <g clipPath="url(#vesselClip)">
          <motion.rect
            x="20"
            width="160"
            height="280"
            fill="url(#airGrad)"
            initial={{ y: 280 - fillLevel * 270 }}
            animate={{ y: 280 - fillLevel * 270 }}
            transition={{ duration: phaseDuration, ease: "easeInOut" }}
          />
          {/* Wave surface */}
          <motion.ellipse
            cx="100"
            rx="80"
            ry="6"
            fill="hsla(185, 90%, 70%, 0.4)"
            initial={{ cy: 280 - fillLevel * 270, rx: 80 }}
            animate={{
              cy: 280 - fillLevel * 270,
              rx: isActive ? [70, 90, 70] : 80,
            }}
            transition={{
              cy: { duration: phaseDuration, ease: "easeInOut" },
              rx: { duration: 1.5, repeat: Infinity, repeatType: "reverse" },
            }}
          />
        </g>
      </svg>

      {/* Inner vessel shimmer */}
      <motion.div
        className="absolute rounded-full z-20 pointer-events-none"
        style={{ width: 80, height: 80, top: "45%" }}
        animate={{
          opacity: phase === "hold1" || phase === "hold2" ? [0.1, 0.25, 0.1] : 0.05,
          background: `radial-gradient(circle, hsla(185, 90%, 70%, 0.2), transparent)`,
        }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
  );
};

export default BreathingVessel;
