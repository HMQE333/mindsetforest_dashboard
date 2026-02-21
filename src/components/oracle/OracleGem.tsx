import { motion, AnimatePresence } from "framer-motion";
import { OracleTier } from "@/lib/oracle-data";

interface OracleGemProps {
  tier: OracleTier;
  onClick?: () => void;
  shaking?: boolean;
}

export default function OracleGem({ tier, onClick, shaking }: OracleGemProps) {
  return (
    <motion.div
      className="relative w-52 h-52 mx-auto cursor-pointer select-none"
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

      {/* Orb */}
      <motion.div
        className={`absolute inset-4 rounded-full bg-gradient-to-br ${tier.orbGradient} border border-white/10 shadow-2xl`}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Inner shine */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent via-white/5 to-white/15" />

        {/* Core light */}
        <motion.div
          className="absolute top-1/2 left-1/2 w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: `hsl(${tier.glowColor} / 0.9)`, filter: "blur(8px)" }}
          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Tier number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-bold text-white/80 drop-shadow-lg font-mono">
            {tier.id}
          </span>
        </div>
      </motion.div>

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
