import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type CompletionEffectStyle = "burst" | "banner" | "fireworks" | "none";

interface CategoryCompleteEffectProps {
  style: CompletionEffectStyle;
  color?: string;
  onDone: () => void;
}

// ─── Burst ────────────────────────────────────────────────────────────────────
const BURST_PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * 360;
  const distance = 60 + Math.random() * 80;
  const rad = (angle * Math.PI) / 180;
  const emojis = ["✨", "⭐", "💫", "🌟", "✦", "·"];
  return {
    x: Math.cos(rad) * distance,
    y: Math.sin(rad) * distance,
    emoji: emojis[i % emojis.length],
    scale: 0.6 + Math.random() * 0.8,
    rotate: Math.random() * 360,
    delay: Math.random() * 0.18,
  };
});

function BurstEffect({ color, onDone }: { color: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[9000] pointer-events-none flex items-center justify-center">
      <div className="relative">
        {/* Centre flash */}
        <motion.div
          initial={{ scale: 0, opacity: 1 }}
          animate={{ scale: 3.5, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute -inset-4 rounded-full"
          style={{ background: color, filter: "blur(12px)", mixBlendMode: "screen" }}
        />
        {/* Trophy pop */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 1.2, times: [0, 0.3, 1] }}
          className="text-5xl select-none"
        >
          🏆
        </motion.div>
        {/* Particles */}
        {BURST_PARTICLES.map((p, i) => (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: p.x,
              y: p.y,
              scale: p.scale,
              opacity: 0,
              rotate: p.rotate,
            }}
            transition={{ duration: 1.0, delay: p.delay, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-lg select-none"
          >
            {p.emoji}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────
function BannerEffect({ color, onDone }: { color: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-x-0 top-24 z-[9000] pointer-events-none flex justify-center">
      <motion.div
        initial={{ y: -80, opacity: 0, scale: 0.85 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0 }}
        className="flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border border-white/20"
        style={{
          background: `linear-gradient(135deg, ${color}cc 0%, ${color}88 100%)`,
          backdropFilter: "blur(16px)",
          boxShadow: `0 12px 40px ${color}55`,
        }}
      >
        <motion.span
          initial={{ rotate: -20, scale: 0 }}
          animate={{ rotate: [0, -15, 10, 0], scale: [0, 1.3, 1] }}
          transition={{ delay: 0.15, duration: 0.6, ease: "backOut" }}
          className="text-3xl"
        >
          🏆
        </motion.span>
        <div>
          <motion.p
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="text-base font-extrabold text-white tracking-wide"
          >
            ALL DONE! 🎉
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.75 }}
            transition={{ delay: 0.4 }}
            className="text-xs text-white/80"
          >
            Category complete · Keep going!
          </motion.p>
        </div>
        {/* Shimmer sparkles */}
        {["✨", "⭐", "💫"].map((e, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5], y: [-8, -20] }}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.9, repeat: 1 }}
            className="absolute text-sm select-none"
            style={{ right: 16 + i * 14, top: -10 }}
          >
            {e}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Fireworks ────────────────────────────────────────────────────────────────
const FW_COLORS = [
  "hsl(var(--primary))",
  "hsl(50 100% 60%)",
  "hsl(340 90% 65%)",
  "hsl(200 90% 65%)",
  "hsl(120 70% 60%)",
];

const CLUSTERS = Array.from({ length: 3 }, (_, ci) => ({
  x: 20 + ci * 30, // % from left
  delay: ci * 0.28,
  color: FW_COLORS[ci % FW_COLORS.length],
  particles: Array.from({ length: 10 }, (_, pi) => {
    const angle = (pi / 10) * 360 * (Math.PI / 180);
    const r = 50 + Math.random() * 50;
    return {
      tx: Math.cos(angle) * r,
      ty: Math.sin(angle) * r - 30,
      rotate: Math.random() * 360,
    };
  }),
}));

function FireworksEffect({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-[9000] pointer-events-none overflow-hidden">
      {CLUSTERS.map((cluster, ci) => (
        <div
          key={ci}
          className="absolute"
          style={{ left: `${cluster.x}%`, top: "25%" }}
        >
          {/* Launch trail */}
          <motion.div
            initial={{ y: 80, opacity: 1, scaleY: 1 }}
            animate={{ y: 0, opacity: 0, scaleY: 0.3 }}
            transition={{ delay: cluster.delay, duration: 0.4, ease: "easeIn" }}
            className="absolute -left-px w-0.5 h-10 rounded-full"
            style={{ background: cluster.color, filter: "blur(1px)", transformOrigin: "bottom" }}
          />
          {/* Explosion particles */}
          {cluster.particles.map((p, pi) => (
            <motion.div
              key={pi}
              initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              animate={{
                x: p.tx,
                y: p.ty,
                scale: [1, 1.2, 0],
                opacity: [1, 1, 0],
                rotate: p.rotate,
              }}
              transition={{
                delay: cluster.delay + 0.38,
                duration: 0.9,
                ease: [0.2, 0.8, 0.4, 1],
              }}
              className="absolute w-2 h-2 rounded-full"
              style={{ background: cluster.color, filter: "blur(0.5px)" }}
            />
          ))}
          {/* Pop emoji */}
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0] }}
            transition={{ delay: cluster.delay + 0.4, duration: 0.8 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-2xl select-none"
          >
            {ci === 0 ? "🎆" : ci === 1 ? "🎇" : "✨"}
          </motion.span>
        </div>
      ))}
      {/* Big "DONE!" text */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.15, 1], opacity: [0, 1, 0] }}
        transition={{ delay: 0.6, duration: 1.2 }}
        className="absolute inset-x-0 top-1/3 text-center"
      >
        <span className="text-4xl font-extrabold text-white drop-shadow-lg" style={{ textShadow: "0 0 20px rgba(255,200,50,0.8)" }}>
          🎉 DONE! 🎉
        </span>
      </motion.div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CategoryCompleteEffect({ style, color = "hsl(var(--primary))", onDone }: CategoryCompleteEffectProps) {
  const calledRef = useRef(false);
  const safeDone = () => {
    if (!calledRef.current) { calledRef.current = true; onDone(); }
  };

  if (style === "none") { safeDone(); return null; }

  return (
    <AnimatePresence>
      {style === "burst" && <BurstEffect color={color} onDone={safeDone} />}
      {style === "banner" && <BannerEffect color={color} onDone={safeDone} />}
      {style === "fireworks" && <FireworksEffect onDone={safeDone} />}
    </AnimatePresence>
  );
}
