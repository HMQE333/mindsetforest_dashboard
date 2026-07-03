import { motion } from "framer-motion";

interface Props {
  score: number; // 0-100
  hideLabel?: boolean;
}

/**
 * 7-stage progression:
 *  0  dead       (0-14)   bare cracked trunk, no leaves, drooped branches
 *  1  barely     (15-29)  a few brown shriveled leaves, leaves falling
 *  2  fading     (30-44)  sparse autumn leaves, some bare patches
 *  3  autumn     (45-59)  full autumn canopy, warm orange
 *  4  reviving   (60-71)  yellow-green mix, fresh sprouts appearing
 *  5  healthy    (72-86)  full green canopy
 *  6  lush       (87-100) vibrant green + flowers + soft glow + sway
 */
function getStage(score: number): number {
  if (score < 15) return 0;
  if (score < 30) return 1;
  if (score < 45) return 2;
  if (score < 60) return 3;
  if (score < 72) return 4;
  if (score < 87) return 5;
  return 6;
}

const STAGE_META = [
  { label: "Dying", leaf: "hsl(28, 18%, 30%)", glow: "hsl(28, 18%, 40%)", trunk: "hsl(28, 22%, 18%)" },
  { label: "Withered", leaf: "hsl(28, 30%, 38%)", glow: "hsl(28, 30%, 45%)", trunk: "hsl(28, 28%, 20%)" },
  { label: "Fading", leaf: "hsl(28, 65%, 45%)", glow: "hsl(28, 65%, 55%)", trunk: "hsl(28, 32%, 22%)" },
  { label: "Autumn", leaf: "hsl(28, 80%, 52%)", glow: "hsl(28, 80%, 60%)", trunk: "hsl(28, 35%, 24%)" },
  { label: "Reviving", leaf: "hsl(80, 55%, 48%)", glow: "hsl(80, 55%, 58%)", trunk: "hsl(28, 38%, 25%)" },
  { label: "Healthy", leaf: "hsl(125, 58%, 42%)", glow: "hsl(125, 58%, 52%)", trunk: "hsl(28, 40%, 25%)" },
  { label: "Lush", leaf: "hsl(142, 70%, 45%)", glow: "hsl(142, 70%, 55%)", trunk: "hsl(28, 42%, 26%)" },
];

export default function HealthTreeWidget({ score, hideLabel }: Props) {
  const stage = getStage(score);
  const meta = STAGE_META[stage];

  // Trunk path varies slightly: dying is more cracked / leaning
  const trunkPath =
    stage === 0
      ? "M75 170 Q72 130 76 100 Q78 80 82 100 Q88 130 85 170 Z"
      : "M76 170 Q74 130 78 100 Q80 80 82 100 Q86 130 84 170 Z";

  // Branches — droopier when withered, upright when healthy
  const droop = stage <= 1 ? 12 : stage === 2 ? 6 : 0;
  const branches = (
    <g stroke={meta.trunk} strokeWidth={stage <= 1 ? 2.5 : 3} fill="none" strokeLinecap="round">
      <path d={`M80 110 Q60 ${95 + droop} 50 ${80 + droop}`} />
      <path d={`M80 105 Q100 ${90 + droop} 112 ${76 + droop}`} />
      <path d={`M80 90 Q72 ${70 + droop / 2} 70 ${55 + droop / 2}`} />
      {stage >= 4 && <path d="M80 100 Q90 80 96 60" />}
      {stage >= 5 && <path d="M80 95 Q66 78 58 62" />}
    </g>
  );

  // Cracks for dying tree
  const cracks = stage === 0 && (
    <g stroke="hsl(0, 0%, 0%)" strokeWidth="0.6" opacity="0.45">
      <path d="M78 160 L80 140" />
      <path d="M81 130 L79 115" />
    </g>
  );

  // Leaves — count & size scale with stage
  const leafConfigs: { cx: number; cy: number; r: number; delay: number }[] = [
    { cx: 80, cy: 50, r: 32, delay: 0 },
    { cx: 50, cy: 75, r: 22, delay: 0.2 },
    { cx: 112, cy: 72, r: 24, delay: 0.4 },
    { cx: 96, cy: 56, r: 16, delay: 0.6 },
    { cx: 64, cy: 58, r: 14, delay: 0.8 },
  ];
  // How many clusters to show per stage
  const clusterCount = [0, 1, 2, 3, 4, 5, 5][stage];
  const leafScale = [0, 0.45, 0.7, 0.9, 0.95, 1, 1.05][stage];
  const leafOpacity = [0, 0.55, 0.78, 0.9, 0.95, 1, 1][stage];
  const animateSway = stage >= 5;

  // Falling leaves for "barely / fading" stages
  const fallingLeaves = (stage === 1 || stage === 2) && (
    <g>
      {[
        { x: 55, delay: 0 },
        { x: 100, delay: 1.4 },
        { x: 78, delay: 2.6 },
      ].map((l, i) => (
        <motion.circle
          key={i}
          r={2}
          fill={meta.leaf}
          initial={{ cx: l.x, cy: 70, opacity: 0 }}
          animate={{
            cx: [l.x, l.x + 8, l.x - 4, l.x + 6],
            cy: [70, 110, 140, 168],
            opacity: [0, 0.9, 0.6, 0],
          }}
          transition={{ duration: 4.5, repeat: Infinity, delay: l.delay, ease: "easeIn" }}
        />
      ))}
    </g>
  );

  // Tiny pink flowers for the lush stage
  const flowers = stage === 6 && (
    <g>
      {[
        { cx: 70, cy: 42 },
        { cx: 92, cy: 48 },
        { cx: 80, cy: 30 },
        { cx: 56, cy: 70 },
        { cx: 110, cy: 64 },
      ].map((f, i) => (
        <motion.circle
          key={i}
          cx={f.cx}
          cy={f.cy}
          r={2.4}
          fill="hsl(330, 80%, 75%)"
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
        />
      ))}
    </g>
  );

  // Small sprout indicator at base for "reviving"
  const sprout = stage === 4 && (
    <g>
      <path d="M68 170 Q66 162 70 158" stroke="hsl(125, 60%, 45%)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="70" cy="157" r="2" fill="hsl(125, 60%, 50%)" />
    </g>
  );

  return (
    <div className="flex flex-col items-center">
      <motion.svg
        key={stage}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        viewBox="0 0 160 180"
        className="w-32 h-36"
        style={{ filter: stage === 6 ? `drop-shadow(0 0 14px ${meta.glow}90)` : undefined }}
      >
        {/* Ground shadow — smaller when tree is dying */}
        <ellipse cx="80" cy="172" rx={stage === 0 ? 26 : 40} ry="4" fill="hsl(var(--muted))" opacity="0.3" />

        {/* Trunk */}
        <path d={trunkPath} fill={meta.trunk} />
        {cracks}

        {/* Branches */}
        {branches}

        {/* Sprout (revival sign) */}
        {sprout}

        {/* Leaf canopy */}
        <g>
          {leafConfigs.slice(0, clusterCount).map((c, i) => (
            <motion.circle
              key={i}
              cx={c.cx}
              cy={c.cy}
              r={c.r * leafScale}
              fill={meta.leaf}
              opacity={leafOpacity * (1 - i * 0.05)}
              animate={animateSway ? { y: [0, -2, 0] } : undefined}
              transition={{ duration: 4 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: c.delay }}
            />
          ))}
        </g>

        {/* Falling leaves for transition stages */}
        {fallingLeaves}

        {/* Flowers for lush */}
        {flowers}
      </motion.svg>
      {!hideLabel && (
        <div className="text-center mt-1">
          <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: meta.glow }}>
            {meta.label}
          </div>
          <div className="text-2xl font-extrabold tabular-nums" style={{ color: meta.glow }}>
            {score}
          </div>
        </div>
      )}
    </div>
  );
}