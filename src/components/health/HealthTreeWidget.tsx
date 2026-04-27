import { motion } from "framer-motion";

interface Props {
  score: number; // 0-100
}

export default function HealthTreeWidget({ score }: Props) {
  // Tier: 0-29 withered, 30-54 autumn, 55-79 healthy, 80-100 lush
  const tier = score >= 80 ? "lush" : score >= 55 ? "healthy" : score >= 30 ? "autumn" : "withered";
  const palette = {
    lush: { leaf: "hsl(142, 70%, 45%)", glow: "hsl(142, 70%, 55%)", trunk: "hsl(28, 40%, 25%)", opacity: 1 },
    healthy: { leaf: "hsl(110, 55%, 45%)", glow: "hsl(110, 55%, 55%)", trunk: "hsl(28, 40%, 25%)", opacity: 0.9 },
    autumn: { leaf: "hsl(28, 75%, 50%)", glow: "hsl(28, 75%, 60%)", trunk: "hsl(28, 35%, 22%)", opacity: 0.75 },
    withered: { leaf: "hsl(28, 20%, 35%)", glow: "hsl(28, 20%, 30%)", trunk: "hsl(28, 25%, 20%)", opacity: 0.4 },
  }[tier];

  const showLeaves = tier !== "withered";

  return (
    <div className="flex flex-col items-center">
      <motion.svg
        key={tier}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        viewBox="0 0 160 180"
        className="w-32 h-36"
        style={{ filter: tier === "lush" ? `drop-shadow(0 0 12px ${palette.glow}80)` : undefined }}
      >
        {/* Ground shadow */}
        <ellipse cx="80" cy="172" rx="40" ry="4" fill="hsl(var(--muted))" opacity="0.3" />
        {/* Trunk */}
        <path
          d="M76 170 Q74 130 78 100 Q80 80 82 100 Q86 130 84 170 Z"
          fill={palette.trunk}
        />
        {/* Branches */}
        <path d="M80 110 Q60 95 50 80" stroke={palette.trunk} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M80 105 Q100 90 112 76" stroke={palette.trunk} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M80 90 Q72 70 70 55" stroke={palette.trunk} strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* Leaf clusters */}
        {showLeaves && (
          <>
            <motion.circle
              cx="80" cy="50" r="32"
              fill={palette.leaf} opacity={palette.opacity}
              animate={tier === "lush" ? { y: [0, -2, 0] } : undefined}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.circle
              cx="50" cy="75" r="22"
              fill={palette.leaf} opacity={palette.opacity * 0.85}
              animate={tier === "lush" ? { y: [0, -1.5, 0] } : undefined}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            />
            <motion.circle
              cx="112" cy="72" r="24"
              fill={palette.leaf} opacity={palette.opacity * 0.9}
              animate={tier === "lush" ? { y: [0, -1.5, 0] } : undefined}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            />
          </>
        )}
      </motion.svg>
      <div className="text-center mt-1">
        <div className="text-xs text-muted-foreground">Health Score</div>
        <div className="text-2xl font-extrabold tabular-nums" style={{ color: palette.glow }}>
          {score}
        </div>
      </div>
    </div>
  );
}