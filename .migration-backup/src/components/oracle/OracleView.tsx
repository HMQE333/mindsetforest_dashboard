import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOracleState } from "@/hooks/useOracleState";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useUserSettings } from "@/hooks/useUserSettings";
import { determineTier, randomMessage, Reward } from "@/lib/oracle-data";
import OracleGem from "./OracleGem";
import RewardCard from "./RewardCard";
import { toast } from "sonner";

export default function OracleView() {
  const { state: oracle, loading, sacrificeXP, purchaseReward } = useOracleState();
  const { state: dashboard, spendXP } = useDashboardState();
  const { getRewards } = useUserSettings();
  const rewards = getRewards();
  const [dialogText, setDialogText] = useState<string | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [sacrificeAmount, setSacrificeAmount] = useState(25);

  const tier = determineTier(oracle.oracleXP);

  const showDialog = useCallback((text: string) => {
    setDialogText(text);
    setDialogVisible(true);
    setTimeout(() => setDialogVisible(false), 4000);
  }, []);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 300);
  }, []);

  const handleSacrifice = useCallback(() => {
    if (dashboard.currentXP < sacrificeAmount) {
      triggerShake();
      showDialog("Not enough XP to sacrifice. Earn more first.");
      return;
    }
    spendXP(sacrificeAmount);
    sacrificeXP(sacrificeAmount);
    triggerShake();
    const newTier = determineTier(oracle.oracleXP + sacrificeAmount);
    showDialog(randomMessage(newTier));
    toast.success(`Sacrificed ${sacrificeAmount} XP to the Oracle`);
  }, [dashboard.currentXP, sacrificeAmount, spendXP, sacrificeXP, oracle.oracleXP, triggerShake, showDialog]);

  const handleSpeak = useCallback(() => {
    showDialog(randomMessage(tier));
  }, [tier, showDialog]);

  const handlePurchase = useCallback((reward: Reward) => {
    if (oracle.oracleXP < reward.cost) {
      triggerShake();
      showDialog("Not enough Oracle XP. The Oracle denies this tribute.");
      return;
    }
    purchaseReward(reward.id, reward.name, reward.cost);
    triggerShake();
    showDialog(`Sacrifice accepted. Take your ${reward.name}.`);
    toast.success(`Claimed: ${reward.icon} ${reward.name}`);
  }, [oracle.oracleXP, purchaseReward, triggerShake, showDialog]);

  const nextTierXP = tier.id < 5
    ? [0, 50, 150, 300, 600][tier.id] - oracle.oracleXP
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground animate-pulse">Awakening the Oracle...</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center"
    >
      {/* Oracle Title */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2"
      >
        <h2 className="text-2xl font-bold tracking-widest uppercase text-foreground/85">Oracle</h2>
      </motion.div>

      {/* Gem */}
      <OracleGem tier={tier} onClick={handleSpeak} shaking={shaking} />

      {/* XP + Tier info */}
      <div className="mt-4 mb-2">
        <div className="text-lg font-semibold text-foreground">
          Oracle XP: <span className="text-stat-value font-mono">{oracle.oracleXP}</span>
        </div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
          Tier {tier.id} · {tier.label}
        </div>
        {nextTierXP !== null && nextTierXP > 0 && (
          <div className="text-xs text-muted-foreground/70 mt-1">
            {nextTierXP} XP to next evolution
          </div>
        )}
      </div>

      {/* Dialog */}
      <AnimatePresence>
        {dialogVisible && dialogText && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="max-w-sm mx-auto mb-6 px-4 py-3 rounded-xl glass-card border border-white/10"
          >
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Oracle</div>
            <div className="text-sm text-foreground/90 italic">{dialogText}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sacrifice Controls */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <div className="glass-card px-4 py-2 text-sm text-muted-foreground">
          Dashboard XP: <span className="text-stat-value font-mono font-semibold">{dashboard.currentXP}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mb-8">
        <select
          value={sacrificeAmount}
          onChange={e => setSacrificeAmount(Number(e.target.value))}
          className="glass-card px-3 py-2 text-sm text-foreground bg-transparent border-white/10 rounded-xl appearance-none cursor-pointer"
        >
          {[10, 25, 50, 100].map(v => (
            <option key={v} value={v} className="bg-card text-foreground">{v} XP</option>
          ))}
        </select>
        <button
          onClick={handleSacrifice}
          className="px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider gradient-purple text-primary-foreground glow-sm hover:opacity-90 transition-all hover:-translate-y-0.5"
        >
          Sacrifice to Oracle
        </button>
      </div>

      {/* Rewards Grid */}
      <div className="text-left max-w-4xl mx-auto">
        <h3 className="text-lg font-bold text-foreground/80 mb-4 text-center uppercase tracking-widest">
          Rewards Shop
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {rewards.map(reward => (
            <RewardCard
              key={reward.id}
              reward={reward}
              canAfford={oracle.oracleXP >= reward.cost}
              onPurchase={handlePurchase}
            />
          ))}
        </div>
      </div>

      {/* Purchase History */}
      {oracle.rewardsPurchased.length > 0 && (
        <div className="mt-10 max-w-md mx-auto text-left">
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 text-center">
            Recent Claims ({oracle.rewardsPurchased.length})
          </h4>
          <div className="space-y-1">
            {oracle.rewardsPurchased.slice(-5).reverse().map((r, i) => (
              <div key={i} className="glass-card px-3 py-2 text-xs flex justify-between items-center">
                <span className="text-foreground/80">{r.name}</span>
                <span className="text-muted-foreground">-{r.cost} XP</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
