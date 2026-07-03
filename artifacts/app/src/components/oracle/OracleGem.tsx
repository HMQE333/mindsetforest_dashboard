import { motion } from "framer-motion";
import { OracleTier } from "@/lib/oracle-data";

interface OracleGemProps {
  tier: OracleTier;
  onClick?: () => void;
  shaking?: boolean;
}

export default function OracleGem({ tier, onClick, shaking }: OracleGemProps) {
  return (
    <motion.div
      className="relative w-64 h-64 mx-auto cursor-pointer select-none"
      onClick={onClick}
      animate={shaking ? { x: [0, -4, 4, -3, 3, 0] } : {}}
      transition={shaking ? { duration: 0.3 } : {}}
    >
      {/* Glow background */}
      <motion.div
        className="absolute inset-0 rounded-full blur-[46px]"
        style={{ background: `hsl(${tier.glowColor} / 0.6)` }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Oracle image */}
      <motion.img
        src={tier.image}
        alt={tier.label}
        className="absolute inset-0 w-full h-full object-contain z-10 drop-shadow-2xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ filter: `drop-shadow(0 0 14px hsl(${tier.glowColor} / 0.4))` }}
      />

      {/* Evolution ring for higher tiers */}
      {tier.id >= 4 && (
        <motion.div
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: `hsl(${tier.glowColor} / 0.4)` }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {tier.id >= 5 && (
        <motion.div
          className="absolute -inset-4 rounded-full border"
          style={{ borderColor: `hsl(${tier.glowColor} / 0.2)` }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.4, 0.1], rotate: [0, 180, 360] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
      )}
    </motion.div>
  );
}
