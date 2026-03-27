import { motion } from "framer-motion";
import { RUNES } from "@/lib/breathing-data";
import type { BreathPhase } from "@/lib/breathing-data";

interface Props {
  phase: BreathPhase;
  fillLevel: number; // 0-1
  progress: number; // 0-1 overall session progress
  phaseDuration: number;
}

const BreathingVessel = ({ phase, fillLevel, progress, phaseDuration }: Props) => {
  const isActive = phase === "inhale" || phase === "exhale";
  const glowIntensity = phase === "inhale" ? 0.6 + fillLevel * 0.4 : phase === "hold1" ? 0.8 : 0.3 + fillLevel * 0.3;

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
            {/* Urn shape */}
            <path d="M60,30 Q60,10 80,10 L120,10 Q140,10 140,30 L145,60 Q155,80 155,120 L155,180 Q155,240 130,260 L70,260 Q45,240 45,180 L45,120 Q45,80 55,60 Z" />
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
          d="M60,30 Q60,10 80,10 L120,10 Q140,10 140,30 L145,60 Q155,80 155,120 L155,180 Q155,240 130,260 L70,260 Q45,240 45,180 L45,120 Q45,80 55,60 Z"
          fill="url(#vesselGrad)"
          stroke="hsla(185, 50%, 45%, 0.4)"
          strokeWidth="1.5"
        />

        {/* Rune engravings on vessel */}
        <text x="65" y="150" fill="hsla(185, 50%, 50%, 0.15)" fontSize="14" fontWeight="bold">ᚱ</text>
        <text x="125" y="150" fill="hsla(185, 50%, 50%, 0.15)" fontSize="14" fontWeight="bold">ᛊ</text>
        <text x="95" y="250" fill="hsla(185, 50%, 50%, 0.15)" fontSize="14" fontWeight="bold">ᚾ</text>

        {/* Air fill */}
        <g clipPath="url(#vesselClip)">
          <motion.rect
            x="40"
            width="120"
            height="260"
            fill="url(#airGrad)"
            animate={{ y: 260 - fillLevel * 250 }}
            transition={{ duration: phaseDuration, ease: "easeInOut" }}
          />
          {/* Wave surface */}
          <motion.ellipse
            cx="100"
            rx="60"
            ry="6"
            fill="hsla(185, 90%, 70%, 0.4)"
            animate={{
              cy: 260 - fillLevel * 250,
              rx: isActive ? [55, 65, 55] : 60,
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
