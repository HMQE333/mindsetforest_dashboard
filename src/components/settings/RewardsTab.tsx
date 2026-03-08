import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { REWARDS, Reward } from "@/lib/oracle-data";
import { Plus, Trash2 } from "lucide-react";

const REWARD_CATEGORIES: Reward["category"][] = ["instant", "medium", "growth", "big"];
const CATEGORY_LABELS: Record<string, string> = {
  instant: "⚡ Instant (10-25)",
  medium: "🎯 Medium (30-60)",
  growth: "🌱 Growth (70-120)",
  big: "🏆 Big (100-200)",
};

interface RewardsTabProps {
  customRewards: Reward[] | null;
  onSave: (rewards: Reward[] | null) => Promise<void>;
  onReset: () => Promise<void>;
}

interface EditableReward extends Reward {
  tempId: string;
}

export default function RewardsTab({ customRewards, onSave, onReset }: RewardsTabProps) {
  const [rewards, setRewards] = useState<EditableReward[]>([]);
  const [dirty, setDirty] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Reward["category"]>("instant");

  useEffect(() => {
    const source = customRewards || REWARDS;
    setRewards(source.map((r, i) => ({ ...r, tempId: `r-${i}-${Date.now()}` })));
  }, [customRewards]);

  const filtered = rewards.filter(r => r.category === activeCategory);

  const update = (tempId: string, field: keyof Reward, value: string | number) => {
    setRewards(prev => prev.map(r => r.tempId === tempId ? { ...r, [field]: value } : r));
    setDirty(true);
  };

  const addReward = () => {
    setRewards(prev => [...prev, {
      tempId: `r-new-${Date.now()}`,
      id: `custom-${Date.now()}`,
      name: "",
      icon: "🎁",
      description: "",
      cost: 20,
      category: activeCategory,
    }]);
    setDirty(true);
  };

  const removeReward = (tempId: string) => {
    setRewards(prev => prev.filter(r => r.tempId !== tempId));
    setDirty(true);
  };

  const handleSave = async () => {
    const valid = rewards.filter(r => r.name.trim());
    const cleaned: Reward[] = valid.map(({ tempId, ...r }) => r);
    await onSave(cleaned.length > 0 ? cleaned : null);
    setDirty(false);
  };

  const handleReset = async () => {
    await onReset();
    setRewards(REWARDS.map((r, i) => ({ ...r, tempId: `r-${i}-${Date.now()}` })));
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-muted-foreground">Set your own Oracle rewards</p>
        <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Reset to defaults
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap">
        {REWARD_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeCategory === cat
                ? "gradient-purple text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        <AnimatePresence mode="popLayout">
          {filtered.map((reward, i) => (
            <motion.div
              key={reward.tempId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-card p-3 flex items-start gap-2"
            >
              <input
                value={reward.icon}
                onChange={e => update(reward.tempId, "icon", e.target.value)}
                className="w-9 h-9 text-center text-lg bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-primary/50 shrink-0"
                maxLength={4}
              />
              <div className="flex-1 space-y-1.5">
                <input
                  value={reward.name}
                  onChange={e => update(reward.tempId, "name", e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  placeholder="Reward name"
                  maxLength={40}
                />
                <input
                  value={reward.description}
                  onChange={e => update(reward.tempId, "description", e.target.value)}
                  className="w-full bg-transparent text-xs text-muted-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  placeholder="Description"
                  maxLength={100}
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Cost:</span>
                  <input
                    type="number"
                    value={reward.cost}
                    onChange={e => update(reward.tempId, "cost", Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 bg-transparent text-xs font-mono text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                    min={1}
                    max={1000}
                  />
                  <span className="text-xs text-muted-foreground">XP</span>
                </div>
              </div>
              <button
                onClick={() => removeReward(reward.tempId)}
                className="p-1.5 text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        onClick={addReward}
        className="w-full py-2 rounded-xl border border-dashed border-white/20 text-sm text-muted-foreground hover:text-foreground hover:border-white/40 transition-all flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Add Reward
      </button>

      {dirty && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          Save Rewards
        </motion.button>
      )}
    </div>
  );
}
