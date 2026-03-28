import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RUNES } from "@/lib/breathing-data";
import type { BreathPhase, VesselShape, VesselEffectId } from "@/lib/breathing-data";

interface Props {
  phase: BreathPhase;
  fillLevel: number;
  progress: number;
  phaseDuration: number;
  shape?: VesselShape;
  activeEffects?: Set<VesselEffectId>;
}

const VESSEL_PATHS: Record<VesselShape, string> = {
  urn: "M75,15 Q75,8 85,8 L115,8 Q125,8 125,15 L125,28 Q125,35 135,40 L140,42 Q160,52 162,75 L164,110 Q165,145 160,175 Q155,210 145,235 Q138,252 125,260 L75,260 Q62,252 55,235 Q45,210 40,175 Q35,145 36,110 L38,75 Q40,52 60,42 L65,40 Q75,35 75,28 Z",
  orb: "M100,10 A90,130 0 1,1 99.99,10 Z",
  hourglass: "M55,10 L145,10 Q150,10 150,15 L150,30 Q150,50 130,80 Q110,110 105,140 Q110,170 130,200 Q150,230 150,250 L150,265 Q150,270 145,270 L55,270 Q50,270 50,265 L50,250 Q50,230 70,200 Q90,170 95,140 Q90,110 70,80 Q50,50 50,30 L50,15 Q50,10 55,10 Z",
  ampoule: "M85,10 Q80,10 80,15 L80,70 Q80,80 70,90 Q50,110 45,140 L45,200 Q45,260 70,270 L130,270 Q155,260 155,200 L155,140 Q150,110 130,90 Q120,80 120,70 L120,15 Q120,10 115,10 Z",
  eye: "M10,140 Q50,70 100,70 Q150,70 190,140 Q150,210 100,210 Q50,210 10,140 Z",
};

const VESSEL_ENGRAVINGS: Record<VesselShape, { x: number; y: number; char: string }[]> = {
  urn: [
    { x: 55, y: 140, char: "ᚱ" },
    { x: 132, y: 140, char: "ᛊ" },
    { x: 93, y: 75, char: "ᚨ" },
    { x: 93, y: 245, char: "ᚾ" },
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
  eye: [
    { x: 30, y: 138, char: "ᚱ" },
    { x: 160, y: 138, char: "ᛊ" },
    { x: 75, y: 90, char: "ᚾ" },
    { x: 115, y: 90, char: "ᛖ" },
    { x: 75, y: 195, char: "ᚨ" },
    { x: 115, y: 195, char: "ᚢ" },
  ],
};

// Generate stable particle configs
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  radius: 120 + Math.random() * 40,
  speed: 15 + Math.random() * 15,
  startAngle: (i / 10) * Math.PI * 2,
  size: 2 + Math.random() * 1.5,
}));

// Generate stable spark configs
const SPARKS = Array.from({ length: 4 }, (_, i) => ({
  xOffset: -30 + Math.random() * 60,
  driftY: 40 + Math.random() * 40,
  duration: 2 + Math.random() * 2,
  delay: i * 0.8,
}));

const BreathingVessel = ({ phase, fillLevel, progress, phaseDuration, shape = "urn", activeEffects = new Set() }: Props) => {
  const isActive = phase === "inhale" || phase === "exhale";
  const glowIntensity = phase === "inhale" ? 0.6 + fillLevel * 0.4 : phase === "hold1" ? 0.8 : 0.3 + fillLevel * 0.3;
  const vesselPath = VESSEL_PATHS[shape];
  const engravings = VESSEL_ENGRAVINGS[shape];

  const hasRotatingRunes = activeEffects.has("rotating-runes");
  const hasParticles = activeEffects.has("particles");
  const hasBursts = activeEffects.has("bursts");
  const hasSigil = activeEffects.has("sigil");
  const hasSparks = activeEffects.has("sparks");

  // Energy burst state
  const [burst, setBurst] = useState<{ runeIndex: number; key: number } | null>(null);

  useEffect(() => {
    if (!hasBursts) return;
    const fire = () => {
      const idx = Math.floor(Math.random() * RUNES.length);
      setBurst({ runeIndex: idx, key: Date.now() });
      setTimeout(() => setBurst(null), 800);
    };
    const interval = setInterval(fire, 6000 + Math.random() * 4000);
    return () => clearInterval(interval);
  }, [hasBursts]);

  // Compute rune positions for reuse
  const runePositions = useMemo(() =>
    RUNES.map((rune, i) => {
      const angle = (i / RUNES.length) * Math.PI * 2 - Math.PI / 2;
      const radius = 140;
      return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius + 20,
        rune,
        index: i,
      };
    }), []
  );

  const runesContent = runePositions.map(({ x, y, rune, index: i }) => {
    const runeActive = progress > 0 && (i / RUNES.length) <= progress;
    return (
      <motion.span
        key={i}
        className="absolute text-xl font-bold select-none"
        style={{ left: `calc(50% + ${x}px - 12px)`, top: `calc(50% + ${y}px - 12px)` }}
        animate={{
          color: runeActive
            ? `hsla(185, 90%, 70%, 0.9)`
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
  });

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

      {/* Rune ring — optionally rotating */}
      {hasRotatingRunes ? (
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          {runesContent}
        </motion.div>
      ) : (
        <>{runesContent}</>
      )}

      {/* Sigil lines connecting runes */}
      {hasSigil && (
        <svg
          className="absolute inset-0 z-0 pointer-events-none"
          viewBox="-140 -120 280 280"
          style={{ width: 280, height: 340, left: 0, top: 0 }}
        >
          <g transform="translate(140, 150)">
            {runePositions.map(({ x, y }, i) => {
              const next = runePositions[(i + 1) % runePositions.length];
              const lineActive = progress > 0 && (i / RUNES.length) <= progress;
              return (
                <motion.line
                  key={i}
                  x1={x} y1={y} x2={next.x} y2={next.y}
                  stroke="hsla(185, 70%, 55%, 0.15)"
                  strokeWidth="1"
                  animate={{
                    strokeOpacity: lineActive ? [0.15, 0.5, 0.15] : 0.08,
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              );
            })}
          </g>
        </svg>
      )}

      {/* Energy particles */}
      {hasParticles && PARTICLES.map((p, i) => (
        <motion.div
          key={`particle-${i}`}
          className="absolute rounded-full pointer-events-none z-0"
          style={{
            width: p.size,
            height: p.size,
            background: "hsla(185, 90%, 65%, 0.7)",
            boxShadow: "0 0 4px hsla(185, 90%, 65%, 0.5)",
            left: "50%",
            top: "50%",
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2 + 20,
          }}
          animate={{
            x: [
              Math.cos(p.startAngle) * p.radius,
              Math.cos(p.startAngle + Math.PI) * p.radius,
              Math.cos(p.startAngle + Math.PI * 2) * p.radius,
            ],
            y: [
              Math.sin(p.startAngle) * p.radius,
              Math.sin(p.startAngle + Math.PI) * p.radius,
              Math.sin(p.startAngle + Math.PI * 2) * p.radius,
            ],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: p.speed,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}

      {/* Energy bursts */}
      <AnimatePresence>
        {hasBursts && burst && (() => {
          const rp = runePositions[burst.runeIndex];
          return (
            <motion.div
              key={burst.key}
              className="absolute rounded-full pointer-events-none z-30"
              style={{
                width: 6,
                height: 6,
                background: "hsla(185, 95%, 75%, 0.9)",
                boxShadow: "0 0 12px hsla(185, 95%, 70%, 0.8)",
                left: `calc(50% + ${rp.x}px - 3px)`,
                top: `calc(50% + ${rp.y}px - 3px)`,
              }}
              initial={{ scale: 1, opacity: 1 }}
              animate={{
                left: "calc(50% - 3px)",
                top: "calc(50% + 17px)",
                scale: [1, 2, 0],
                opacity: [1, 0.8, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeIn" }}
            />
          );
        })()}
      </AnimatePresence>

      {/* Vessel SVG */}
      <svg viewBox="0 0 200 280" className="relative z-10" style={{ width: 180, height: 260 }}>
        <defs>
          <clipPath id={`vesselClip-${shape}`}>
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

        {/* Urn decorative details */}
        {shape === "urn" && (
          <>
            {/* Neck ring */}
            <ellipse cx="100" cy="35" rx="32" ry="3" fill="none" stroke="hsla(185, 50%, 50%, 0.2)" strokeWidth="1" />
            {/* Rim highlight */}
            <ellipse cx="100" cy="10" rx="22" ry="2.5" fill="none" stroke="hsla(185, 60%, 60%, 0.25)" strokeWidth="0.8" />
            {/* Belly band */}
            <path d="M42,145 Q100,155 158,145" fill="none" stroke="hsla(185, 50%, 50%, 0.12)" strokeWidth="1" />
            <path d="M44,155 Q100,165 156,155" fill="none" stroke="hsla(185, 50%, 50%, 0.08)" strokeWidth="0.8" />
            {/* Handle accents (left + right) */}
            <path d="M38,75 Q25,60 30,45 Q35,35 60,42" fill="none" stroke="hsla(185, 50%, 50%, 0.18)" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M162,75 Q175,60 170,45 Q165,35 140,42" fill="none" stroke="hsla(185, 50%, 50%, 0.18)" strokeWidth="1.2" strokeLinecap="round" />
          </>
        )}
        {shape === "eye" && (
          <>
            <motion.circle
              cx="100"
              cy="140"
              r="28"
              fill="none"
              stroke="hsla(185, 60%, 50%, 0.3)"
              strokeWidth="2"
              animate={{
                r: phase === "inhale" ? [24, 32] : phase === "exhale" ? [32, 24] : [28, 30, 28],
                strokeOpacity: [0.3, 0.5, 0.3],
              }}
              transition={{ duration: phaseDuration, ease: "easeInOut" }}
            />
            <motion.circle
              cx="100"
              cy="140"
              r="12"
              fill="hsla(185, 80%, 40%, 0.4)"
              animate={{
                r: phase === "inhale" ? [10, 16] : phase === "exhale" ? [16, 10] : [12, 14, 12],
                fill: phase === "hold1"
                  ? ["hsla(185, 80%, 40%, 0.4)", "hsla(185, 90%, 55%, 0.6)", "hsla(185, 80%, 40%, 0.4)"]
                  : "hsla(185, 80%, 40%, 0.4)",
              }}
              transition={{ duration: phaseDuration, ease: "easeInOut" }}
            />
          </>
        )}

        {/* Air fill */}
        <g clipPath={`url(#vesselClip-${shape})`}>
          <motion.rect
            x="0"
            width="200"
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


      {/* Ambient sparks */}
      {hasSparks && fillLevel > 0.3 && SPARKS.map((spark, i) => {
        const surfaceY = 260 - fillLevel * 270 + 40; // approximate surface position in container coords
        return (
          <motion.div
            key={`spark-${i}`}
            className="absolute rounded-full pointer-events-none z-20"
            style={{
              width: 2,
              height: 2,
              background: "hsla(185, 95%, 80%, 0.8)",
              boxShadow: "0 0 4px hsla(185, 95%, 70%, 0.6)",
              left: `calc(50% + ${spark.xOffset}px)`,
            }}
            animate={{
              top: [surfaceY, surfaceY - spark.driftY],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: spark.duration,
              delay: spark.delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
};

export default BreathingVessel;
