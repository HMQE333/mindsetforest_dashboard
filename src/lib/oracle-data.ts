export interface OracleTier {
  id: number;
  key: string;
  label: string;
  minXP: number;
  glowColor: string;
  orbGradient: string;
  messages: string[];
}

export interface Reward {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  category: "instant" | "medium" | "growth" | "big";
}

export const ORACLE_TIERS: OracleTier[] = [
  {
    id: 1,
    key: "broken",
    label: "Broken Oracle",
    minXP: 0,
    glowColor: "120 60% 15%",
    orbGradient: "from-amber-950/80 via-stone-800/60 to-stone-900/80",
    messages: [
      "…feed me…",
      "I remember power. Give me more.",
      "Do not leave me like this.",
      "Your offerings are dust.",
    ],
  },
  {
    id: 2,
    key: "normal",
    label: "Oracle",
    minXP: 50,
    glowColor: "350 80% 50%",
    orbGradient: "from-rose-700/80 via-red-600/60 to-rose-900/80",
    messages: [
      "The pact holds.",
      "Good. Continue.",
      "You are not drifting anymore.",
      "The line is steady.",
    ],
  },
  {
    id: 3,
    key: "awakened",
    label: "Awakened Oracle",
    minXP: 150,
    glowColor: "25 90% 50%",
    orbGradient: "from-orange-500/80 via-amber-500/60 to-orange-700/80",
    messages: [
      "I feel movement again.",
      "Your discipline wakes me.",
      "Momentum is awakening.",
      "Yes. More.",
    ],
  },
  {
    id: 4,
    key: "lotus",
    label: "Lotus Oracle",
    minXP: 300,
    glowColor: "330 80% 55%",
    orbGradient: "from-pink-500/80 via-fuchsia-500/60 to-pink-700/80",
    messages: [
      "I bloom as you ascend.",
      "Growth is inevitable when you commit.",
      "Your will multiplies me.",
      "Clarity follows consistency.",
    ],
  },
  {
    id: 5,
    key: "celestial",
    label: "Celestial Oracle",
    minXP: 600,
    glowColor: "292 84% 61%",
    orbGradient: "from-fuchsia-400/80 via-purple-500/60 to-violet-600/80",
    messages: [
      "You are no longer who you were.",
      "Creation bends around intention.",
      "We are beyond habit now.",
      "Ascend without hesitation.",
    ],
  },
];

export const REWARDS: Reward[] = [
  // Instant (10-25)
  { id: "coffee", name: "Coffee/Tea Ritual", icon: "☕", description: "Slow drink. Just calm focus.", cost: 10, category: "instant" },
  { id: "nap", name: "Power Nap", icon: "😴", description: "15 minutes. Alarm on. Wake up sharper.", cost: 15, category: "instant" },
  { id: "entertainment", name: "Entertainment", icon: "📺", description: "30 minutes of fun (timer ON).", cost: 20, category: "instant" },
  { id: "snack", name: "Sweet Snack", icon: "🍫", description: "Small dessert/snack.", cost: 25, category: "instant" },
  // Medium (30-60)
  { id: "treat", name: "Small Treat", icon: "🎁", description: "Buy something small (under 50 PLN).", cost: 30, category: "medium" },
  { id: "meal", name: "Guilt-Free Meal", icon: "🍜", description: "Eat something tasty.", cost: 40, category: "medium" },
  { id: "gaming", name: "Gaming Session", icon: "🎮", description: "60 minutes gaming. Stop on time.", cost: 50, category: "medium" },
  { id: "movie", name: "Movie Night", icon: "🍿", description: "One movie. No random videos after.", cost: 60, category: "medium" },
  // Growth (70-120)
  { id: "book", name: "Buy a Book", icon: "📚", description: "One book that upgrades your mind.", cost: 70, category: "growth" },
  { id: "skill", name: "Skill Upgrade", icon: "🛠️", description: "Tool/item that improves your work or training.", cost: 90, category: "growth" },
  { id: "course", name: "Course Upgrade", icon: "🎓", description: "Buy a small course/module or premium resource.", cost: 120, category: "growth" },
  // Big (100-200)
  { id: "recovery", name: "Hyperbaric Chamber", icon: "🧖", description: "Deep recovery session. Body + mind.", cost: 100, category: "big" },
  { id: "trip", name: "Day Trip", icon: "🗺️", description: "Go somewhere new. Walk, explore, recharge.", cost: 160, category: "big" },
  { id: "big", name: "Big Reward", icon: "🏆", description: "Something meaningful you really want.", cost: 200, category: "big" },
];

export function determineTier(xp: number): OracleTier {
  let tier = ORACLE_TIERS[0];
  for (const t of ORACLE_TIERS) {
    if (xp >= t.minXP) tier = t;
  }
  return tier;
}

export function randomMessage(tier: OracleTier): string {
  return tier.messages[Math.floor(Math.random() * tier.messages.length)];
}
