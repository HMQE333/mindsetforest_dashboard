import { motion } from "framer-motion";

const GUIDE_CARDS = [
  {
    emoji: "🧩",
    title: "Your Life, Your Categories",
    desc: "Split your goals into 8 areas of improvement. Each day, tackle 3 daily tasks per category. Reset anytime. Want more tasks or need to split one? Go ahead, it's your system.",
    glow: "from-primary/20",
  },
  {
    emoji: "🧠",
    title: "Built for the Restless Mind",
    desc: "Designed to boost dopamine for ADHD brains and reduce mental fatigue. No rigid routines. If your mind rebels, the system adapts. Flexibility is the feature.",
    glow: "from-cat-spirit/20",
  },
  {
    emoji: "⚔️",
    title: "Turn Life Into an Adventure",
    desc: "Earn XP, level up, maintain streaks. Every completed task is progress in your personal RPG. Your real life, gamified.",
    glow: "from-cat-creation/20",
  },
  {
    emoji: "📊",
    title: "Stats: Track What Matters",
    desc: "Monitor objective metrics over time. Daily averages, weekly totals, 12-month performance views. See the proof that you're growing.",
    glow: "from-cat-exploration/20",
  },
  {
    emoji: "🪜",
    title: "Ladder & Habit Loops",
    desc: "Break your long-term vision into actionable steps. Build momentum through repeatable habit cycles. The big picture, one rung at a time.",
    glow: "from-cat-networking/20",
  },
  {
    emoji: "🔮",
    title: "Oracle: Guilt-Free Rewards",
    desc: "Spend earned XP on real rewards. You worked for it. Enjoy it without guilt. The Oracle says you deserve it.",
    glow: "from-cat-mind/20",
  },
  {
    emoji: "🧠",
    title: "Planning Mindboard",
    desc: "Map your goals from vision to next-action. A nested mind-map (Goal → Phase → Task → Action) connects everything to your Ladder and Habit Loops. Think big, then zoom in.",
    glow: "from-cat-mind/20",
  },
  {
    emoji: "📦",
    title: "Archive: Your Second Brain",
    desc: "Capture ideas, links and images from anywhere. Smart semantic search finds what you meant — not just what you typed. Tag by pillar, revisit via spaced repetition.",
    glow: "from-cat-exploration/20",
  },
  {
    emoji: "🌳",
    title: "Forest: Knowledge, Shared",
    desc: "Plant your best ideas as seeds. Friends and the public can water and save them. A quiet social layer for growth — no doomscrolling, just signal.",
    glow: "from-emerald-500/20",
  },
  {
    emoji: "🍳",
    title: "Cooking Studio",
    desc: "AI cleans messy recipes into clear steps and gram-accurate ingredients. Plan meals, build shopping prompts, and turn cooking into a calm ritual.",
    glow: "from-cat-body/20",
  },
  {
    emoji: "💰",
    title: "Finance, Without the Anxiety",
    desc: "Track cash flow, subscriptions and loans with a 6-month savings curve. Numbers you can face — designed to inform, not to shame.",
    glow: "from-cat-creation/20",
  },
  {
    emoji: "📚",
    title: "Library, Calendar & Breathe",
    desc: "A reading list that respects your pace. A minimalist calendar for what truly matters. And a breathing vessel for when the mind needs air.",
    glow: "from-cat-spirit/20",
  },
];

const GuideSection = () => (
  <div className="mt-20 max-w-4xl mx-auto px-2">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="text-center mb-12"
    >
      <h2 className="text-3xl font-extrabold text-gradient-purple mb-3 tracking-tight">
        How It Works
      </h2>
      <p className="text-muted-foreground text-base">
        Your life. Your rules. Your adventure.
      </p>
    </motion.div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {GUIDE_CARDS.map((card, i) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + Math.min(i, 5) * 0.08, duration: 0.5 }}
          className="relative group rounded-2xl bg-card/40 backdrop-blur-xl border border-white/[0.07] p-7 text-center
                     hover:border-white/15 hover:-translate-y-1 transition-all duration-300
                     hover:shadow-[0_16px_48px_-12px_hsl(var(--glow-purple)/0.2)]"
        >
          {/* Top gradient line */}
          <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r ${card.glow} via-transparent to-transparent`} />

          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl group-hover:scale-110 transition-transform duration-300 drop-shadow-lg">
              {card.emoji}
            </span>
            <h3 className="font-bold text-foreground text-lg tracking-tight">
              {card.title}
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              {card.desc}
            </p>
          </div>

          {/* Bottom gradient line */}
          <div className="mt-5 h-px w-full bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        </motion.div>
      ))}
    </div>
  </div>
);

export default GuideSection;
