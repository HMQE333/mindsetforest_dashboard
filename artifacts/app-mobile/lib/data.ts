import { CATEGORY_COLORS } from "@/constants/colors";

export interface MissionVariant {
  title: string;
  description: string;
  duration: string;
  xp: number;
  url?: string;
  weight: number;
}

export interface Mission {
  title: string;
  description: string;
  duration: string;
  xp: number;
  persistent?: boolean;
  url?: string;
  variants?: MissionVariant[];
  daysOfWeek?: number[];
  __originalIndex?: number;
}

export interface Category {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  missions: Mission[];
}

export const CATEGORIES: Category[] = [
  {
    id: "mind",
    name: "Mind",
    tagline: "Learning & Programming",
    icon: "🧠",
    color: CATEGORY_COLORS.mind,
    missions: [
      { title: "Memory Palace Practice", description: "Build/refresh a route and store 10-20 items. Speed + clarity.", duration: "15 min", xp: 25 },
      { title: "Creative Writing Drill", description: "One prompt. Write fast, then rewrite 3 sentences for style.", duration: "20 min", xp: 30 },
      { title: "Read 15 Pages", description: "Read with a pen: underline 3 insights + write 1 takeaway line.", duration: "20 min", xp: 25 },
    ],
  },
  {
    id: "body",
    name: "Body",
    tagline: "Health & Fitness",
    icon: "💪",
    color: CATEGORY_COLORS.body,
    missions: [
      { title: "Push-ups + Warm-up", description: "Warm-up (joints + shoulders) then push-up sets (good form).", duration: "15 min", xp: 25 },
      { title: "Wing Chun Practice", description: "Technique + basics + 1 focused combo. No rush, clean movement.", duration: "30 min", xp: 40 },
      { title: "Fuel & Hydration Rule", description: "Hit protein + water baseline. Quick check-in, simple tracking.", duration: "5 min", xp: 15 },
    ],
  },
  {
    id: "creation",
    name: "Creation",
    tagline: "Build & Express",
    icon: "🎨",
    color: CATEGORY_COLORS.creation,
    missions: [
      { title: "Deep Work Block", description: "2 hours of uninterrupted building. Phone off, one project, full immersion. Ship something real.", duration: "120 min", xp: 80 },
      { title: "Outreach / Customers / Ads Check", description: "Contact customers OR review ads briefly and note 1 improvement.", duration: "15 min", xp: 25 },
      { title: "Draft One Idea", description: "Turn 1 idea into a rough draft: structure, bullets, next steps.", duration: "20 min", xp: 30 },
    ],
  },
  {
    id: "exploration",
    name: "Exploration",
    tagline: "Discover & Aware",
    icon: "🔭",
    color: CATEGORY_COLORS.exploration,
    missions: [
      { title: "Curiosity Walk (Observe)", description: "Walk and notice details. Bonus: take 1 photo of something interesting.", duration: "10 min", xp: 20 },
      { title: "Skill Block", description: "Pick one: language, coding lesson, or drawing practice.", duration: "20 min", xp: 30 },
      { title: "Small Discovery Note", description: "Write 3 lines: what I noticed + what it might mean + question.", duration: "5 min", xp: 15 },
    ],
  },
  {
    id: "networking",
    name: "Networking",
    tagline: "Connect & Lead",
    icon: "👑",
    color: CATEGORY_COLORS.networking,
    missions: [
      { title: "Message 1", description: "Short, human opener. Curiosity + value, no selling.", duration: "10 min", xp: 25 },
      { title: "Maintain 1 Contact", description: "Follow-up / check-in / voice note. Strengthen the bond.", duration: "10 min", xp: 25 },
      { title: "New Networking Way", description: "Try a new channel: comment, group post, intro, community thread.", duration: "15 min", xp: 30 },
    ],
  },
  {
    id: "trading",
    name: "Trading",
    tagline: "Trade & Journal",
    icon: "📊",
    color: CATEGORY_COLORS.trading,
    missions: [
      { title: "Quick Macro Check", description: "Scan economic situation: headline + calendar + sentiment.", duration: "10 min", xp: 20 },
      { title: "Write 1 Trade Plan", description: "Levels + entry idea + invalidation + risk. Even if no trade.", duration: "10 min", xp: 20 },
      { title: "Journal", description: "What I saw, what I did, emotion level, one improvement.", duration: "10 min", xp: 20 },
    ],
  },
  {
    id: "spirit",
    name: "Spirit",
    tagline: "Philosophy & Meaning",
    icon: "✨",
    color: CATEGORY_COLORS.spirit,
    missions: [
      { title: "No Stimuli (Dark Focus)", description: "Close eyes, focus on the dark 'texture'. Train attention stability.", duration: "10 min", xp: 20 },
      { title: "Watch 1 Philosophy Video", description: "One video only. Capture 1 quote + 1 takeaway.", duration: "20 min", xp: 25 },
      { title: "Alignment Check", description: "Did I live by my rules today? 2-3 sentences, honest.", duration: "5 min", xp: 15 },
    ],
  },
  {
    id: "order",
    name: "Order",
    tagline: "Systems & Structure",
    icon: "⚙️",
    color: CATEGORY_COLORS.order,
    missions: [
      { title: "Daily Reset Zone", description: "Fast cleanup: desk/room/clothes/kitchen/files/inbox. Restore clean baseline.", duration: "10 min", xp: 20 },
      { title: "Plan Tomorrow", description: "Top 3 outcomes + first action for each. Keep it simple.", duration: "7 min", xp: 20 },
      { title: "Close 1 Loop", description: "Finish one lingering task (admin, message, setup, cleanup).", duration: "15 min", xp: 30 },
    ],
  },
];

export function categoryColor(id: string): string {
  return CATEGORY_COLORS[id] || "#8b5cf6";
}

// ---------------- Tracker ----------------

export interface TrackerMetric {
  id: string;
  label: string;
  unit: string;
  icon: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
}

export const TRACKER_METRICS: TrackerMetric[] = [
  { id: "hours-mind", label: "Study Hours", unit: "hrs", icon: "📖", categoryId: "mind", categoryName: "Mind", categoryIcon: "🧠" },
  { id: "pages-read", label: "Pages Read", unit: "pages", icon: "📄", categoryId: "mind", categoryName: "Mind", categoryIcon: "🧠" },
  { id: "pushups", label: "Push-ups", unit: "reps", icon: "💥", categoryId: "body", categoryName: "Body", categoryIcon: "💪" },
  { id: "hours-body", label: "Training Hours", unit: "hrs", icon: "⏱️", categoryId: "body", categoryName: "Body", categoryIcon: "💪" },
  { id: "clients-outreached", label: "Clients Outreached", unit: "clients", icon: "📨", categoryId: "creation", categoryName: "Creation", categoryIcon: "🎨" },
  { id: "hours-creation", label: "Creation Hours", unit: "hrs", icon: "🛠️", categoryId: "creation", categoryName: "Creation", categoryIcon: "🎨" },
  { id: "good-trade-setups", label: "Good Trade Setups", unit: "setups", icon: "🎯", categoryId: "trading", categoryName: "Trading", categoryIcon: "📊" },
  { id: "hours-trading", label: "Trading Hours", unit: "hrs", icon: "📈", categoryId: "trading", categoryName: "Trading", categoryIcon: "📊" },
  { id: "people-contacted", label: "People Contacted", unit: "people", icon: "🤝", categoryId: "networking", categoryName: "Networking", categoryIcon: "👑" },
  { id: "hours-exploration", label: "Exploration Hours", unit: "hrs", icon: "🔭", categoryId: "exploration", categoryName: "Exploration", categoryIcon: "🔭" },
];

// ---------------- Oracle ----------------

export interface OracleTier {
  id: number;
  key: string;
  label: string;
  minXP: number;
  glow: string;
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
  { id: 1, key: "broken", label: "Broken Oracle", minXP: 0, glow: "#3a7d44", messages: ["…feed me…", "I remember power. Give me more.", "Do not leave me like this.", "Your offerings are dust."] },
  { id: 2, key: "normal", label: "Oracle", minXP: 50, glow: "#e11d48", messages: ["The pact holds.", "Good. Continue.", "You are not drifting anymore.", "The line is steady."] },
  { id: 3, key: "awakened", label: "Awakened Oracle", minXP: 150, glow: "#f97316", messages: ["I feel movement again.", "Your discipline wakes me.", "Momentum is awakening.", "Yes. More."] },
  { id: 4, key: "lotus", label: "Lotus Oracle", minXP: 300, glow: "#ec4899", messages: ["I bloom as you ascend.", "Growth is inevitable when you commit.", "Your will multiplies me.", "Clarity follows consistency."] },
  { id: 5, key: "celestial", label: "Celestial Oracle", minXP: 600, glow: "#d948ef", messages: ["You are no longer who you were.", "Creation bends around intention.", "We are beyond habit now.", "Ascend without hesitation."] },
];

export const REWARDS: Reward[] = [
  { id: "coffee", name: "Coffee/Tea Ritual", icon: "☕", description: "Slow drink. Just calm focus.", cost: 10, category: "instant" },
  { id: "nap", name: "Power Nap", icon: "😴", description: "15 minutes. Alarm on. Wake up sharper.", cost: 15, category: "instant" },
  { id: "entertainment", name: "Entertainment", icon: "📺", description: "30 minutes of fun (timer ON).", cost: 20, category: "instant" },
  { id: "snack", name: "Sweet Snack", icon: "🍫", description: "Small dessert/snack.", cost: 25, category: "instant" },
  { id: "treat", name: "Small Treat", icon: "🎁", description: "Buy something small for yourself.", cost: 30, category: "medium" },
  { id: "meal", name: "Guilt-Free Meal", icon: "🍜", description: "Eat something tasty.", cost: 40, category: "medium" },
  { id: "gaming", name: "Gaming Session", icon: "🎮", description: "60 minutes gaming. Stop on time.", cost: 50, category: "medium" },
  { id: "movie", name: "Movie Night", icon: "🍿", description: "One movie. No random videos after.", cost: 60, category: "medium" },
  { id: "book", name: "Buy a Book", icon: "📚", description: "One book that upgrades your mind.", cost: 70, category: "growth" },
  { id: "skill", name: "Skill Upgrade", icon: "🛠️", description: "Tool/item that improves your work or training.", cost: 90, category: "growth" },
  { id: "course", name: "Course Upgrade", icon: "🎓", description: "Buy a small course/module or premium resource.", cost: 120, category: "growth" },
  { id: "recovery", name: "Hyperbaric Chamber", icon: "🧖", description: "Deep recovery session. Body + mind.", cost: 100, category: "big" },
  { id: "rest-therapy", name: "REST Therapy", icon: "🧘", description: "Sensory deprivation float. Total reset.", cost: 130, category: "big" },
  { id: "massage", name: "Massage Session", icon: "💆", description: "Professional massage. Release tension, restore flow.", cost: 140, category: "big" },
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

// ---------------- Ladder ----------------

export interface LadderTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface LadderLevels {
  [level: number]: LadderTask[];
}

export interface CategoryLadder {
  levels: LadderLevels;
}

export interface AllLadders {
  [categoryId: string]: CategoryLadder;
}

export const LADDER_LEVELS = [
  { level: 0, title: "Foundation", color: "#8b5cf6" },
  { level: 1, title: "System", color: "#22c55e" },
  { level: 2, title: "Output", color: "#3b82f6" },
  { level: 3, title: "Feedback", color: "#f59e0b" },
  { level: 4, title: "Optimization", color: "#ef4444" },
  { level: 5, title: "Mastery", color: "#a855f7" },
];

export function createEmptyLadders(): AllLadders {
  const obj: AllLadders = {};
  CATEGORIES.forEach((cat) => {
    obj[cat.id] = { levels: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [] } };
  });
  return obj;
}

// ---------------- Finance ----------------

export type TransactionType = "income" | "expense" | "subscription" | "loan_out" | "loan_in";

export interface FinanceTransaction {
  id: string;
  user_id: string;
  type: TransactionType;
  title: string;
  amount: number;
  category: string;
  date: string;
  is_recurring: boolean;
  recurring_day: number | null;
  person_name: string;
  is_settled: boolean;
  notes: string;
  created_at: string;
}

export const EXPENSE_CATEGORIES = ["food", "transport", "entertainment", "bills", "health", "shopping", "education", "other"];
export const INCOME_CATEGORIES = ["salary", "freelance", "investment", "gift", "refund", "other"];

// ---------------- Library ----------------

export type BookStatus = "to-read" | "reading" | "finished";
export type BookFormat = "owned" | "borrowed" | "ebook" | "audiobook";

export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string;
  total_pages: number;
  pages_read: number;
  rating: number | null;
  status: BookStatus;
  notes: string;
  cover_color: string;
  tags: string[];
  pillars: string[];
  directions: string[];
  format: BookFormat;
  url: string;
  created_at: string;
  updated_at: string;
}

export const STATUS_LABELS: Record<BookStatus, string> = {
  "to-read": "To Read",
  reading: "Reading",
  finished: "Finished",
};

export const COVER_COLORS = [
  "#8B5CF6", "#3B82F6", "#EF4444", "#F97316", "#10B981",
  "#EC4899", "#6366F1", "#14B8A6", "#F59E0B", "#64748B",
];

// ---------------- Archive ----------------

export interface ArchiveBlock {
  id: string;
  user_id: string;
  title: string;
  content: string;
  pillars: string[];
  directions: string[];
  tags: string[];
  source_url: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}
