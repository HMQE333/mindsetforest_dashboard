import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Reward } from "@/lib/oracle-data";

interface RewardCardProps {
  reward: Reward;
  canAfford: boolean;
  onPurchase: (reward: Reward) => void;
}

export default function RewardCard({ reward, canAfford, onPurchase }: RewardCardProps) {
  const [burst, setBurst] = useState(false);

  const handleClick = () => {
    if (!canAfford) return;
    setBurst(true);
    onPurchase(reward);
    setTimeout(() => setBurst(false), 700);
  };

  const costColors: Record<string, string> = {
    instant: "bg-emerald-950 text-emerald-300",
    medium: "bg-amber-950 text-amber-300",
    growth: "bg-blue-950 text-blue-300",
    big: "bg-fuchsia-950 text-fuchsia-300",
  };

  return (
    <motion.div
      onClick={handleClick}
      whileHover={canAfford ? { y: -4, scale: 1.02 } : {}}
      whileTap={canAfford ? { scale: 0.98 } : {}}
      className={`relative overflow-hidden rounded-2xl p-4 border transition-all duration-200 cursor-pointer
        ${canAfford
          ? "glass-card-hover border-white/10 hover:border-white/20"
          : "glass-card border-white/5 opacity-50 cursor-not-allowed"
        }`}
    >
      {/* Burst effect */}
      <AnimatePresence>
        {burst && (
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 2.5, opacity: 0.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 rounded-full bg-gradient-radial from-amber-400/40 to-transparent pointer-events-none z-0"
            style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{reward.icon}</span>
          <span className="font-semibold text-sm text-foreground">{reward.name}</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">{reward.description}</p>
        <span className={`text-[10px] uppercase tracking-widest px-3 py-1 rounded-full font-semibold ${costColors[reward.category]}`}>
          {reward.cost} XP
        </span>
      </div>

      {/* Hover shimmer */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
    </motion.div>
  );
}
