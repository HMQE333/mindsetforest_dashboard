import { motion } from "framer-motion";

const GUIDE_CARDS = [
  {
    emoji: "🧩",
    title: "Your Life, Your Categories",
    desc: "Split your goals into 8 areas of improvement. Each day, tackle 3 daily tasks per category. Reset anytime. Want more tasks or need to split one? Go ahead — it's your system.",
  },
  {
    emoji: "🧠",
    title: "Built for the Restless Mind",
    desc: "Designed to boost dopamine for ADHD brains and reduce mental fatigue. No rigid routines — if your mind rebels, the system adapts. Flexibility is the feature.",
  },
  {
    emoji: "⚔️",
    title: "Turn Life Into an Adventure",
    desc: "Earn XP, level up, maintain streaks. Every completed task is progress in your personal RPG. Your real life — gamified.",
  },
  {
    emoji: "📊",
    title: "Stats: Track What Matters",
    desc: "Monitor objective metrics over time. Daily averages, weekly totals, 12-month performance views. See the proof that you're growing.",
  },
  {
    emoji: "🪜",
    title: "Ladder & Habit Loops",
    desc: "Break your long-term vision into actionable steps. Build momentum through repeatable habit cycles. The big picture, one rung at a time.",
  },
  {
    emoji: "🔮",
    title: "Oracle: Guilt-Free Rewards",
    desc: "Spend earned XP on real rewards. You worked for it — enjoy it without guilt. The Oracle says you deserve it.",
  },
];

const GuideSection = () => (
  <div className="mt-16 max-w-4xl mx-auto">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="text-center mb-10"
    >
      <h2 className="text-2xl font-bold text-gradient-purple mb-2">How It Works</h2>
      <p className="text-muted-foreground text-sm">Your life. Your rules. Your adventure.</p>
    </motion.div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {GUIDE_CARDS.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
          className="glass-card-hover p-6 group"
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl shrink-0 mt-0.5 group-hover:scale-110 transition-transform duration-300">
              {card.emoji}
            </span>
            <div>
              <h3 className="font-bold text-foreground mb-1.5 text-base">{card.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{card.desc}</p>
            </div>
          </div>
          <div className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </motion.div>
      ))}
    </div>
  </div>
);

export default GuideSection;
