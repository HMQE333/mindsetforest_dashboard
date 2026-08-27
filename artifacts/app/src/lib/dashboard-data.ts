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
  daysOfWeek?: number[]; // [0..6] Sun..Sat; undefined or full week = every day
  /** Internal: index into the original (unfiltered) mission list. Set by getMissions when filtering. */
  __originalIndex?: number;
}

export interface Category {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  iconUrl?: string;
  color: string;
  lightColor: string;
  colorVar: string;
  missions: Mission[];
}

export const CATEGORIES: Category[] = [
  {
    id: "mind",
    name: "Mind",
    tagline: "Learning & Programming",
    icon: "🧠",
    color: "#8B5CF6",
    lightColor: "#A78BFA",
    colorVar: "cat-mind",
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
    color: "#F97316",
    lightColor: "#FB923C",
    colorVar: "cat-body",
    missions: [
      { title: "Push-ups + Warm-up", description: "Warm-up (joints + shoulders) then push-up sets (good form).", duration: "15 min", xp: 25 },
      { title: "Wing Chun Practice", description: "Technique + basics + 1 focused combo. No rush, clean movement.", duration: "30 min", xp: 40 },
      { title: "Fuel & Hydration Rule", description: "Hit protein + water baseline. Quick check-in, simple tracking.", duration: "5 min", xp: 15 },
    ],
  },
  {
    id: "expression",
    name: "Expression",
    tagline: "Create & Express",
    icon: "🎨",
    color: "#EF4444",
    lightColor: "#F87171",
    colorVar: "cat-creation",
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
    color: "#6366F1",
    lightColor: "#818CF8",
    colorVar: "cat-exploration",
    missions: [
      { title: "Curiosity Walk (Observe)", description: "Walk and notice details. Bonus: take 1 photo of something interesting.", duration: "10 min", xp: 20 },
      { title: "Skill Block", description: "Pick one: language, coding lesson, or drawing practice.", duration: "20 min", xp: 30 },
      { title: "Small Discovery Note", description: "Write 3 lines: what I noticed + what it might mean + question.", duration: "5 min", xp: 15 },
    ],
  },
  {
    id: "people",
    name: "People",
    tagline: "Connect & Lead",
    icon: "👑",
    color: "#FBBF24",
    lightColor: "#FCD34D",
    colorVar: "cat-networking",
    missions: [
      { title: "Message 1", description: "Short, human opener. Curiosity + value, no selling.", duration: "10 min", xp: 25 },
      { title: "Maintain 1 Contact", description: "Follow-up / check-in / voice note. Strengthen the bond.", duration: "10 min", xp: 25 },
      { title: "New Networking Way", description: "Try a new channel: comment, group post, intro, community thread.", duration: "15 min", xp: 30 },
    ],
  },
  {
    id: "money",
    name: "Money",
    tagline: "Wealth & Income",
    icon: "💰",
    color: "#10B981",
    lightColor: "#34D399",
    colorVar: "cat-trading",
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
    color: "#FBBF24",
    lightColor: "#FCD34D",
    colorVar: "cat-spirit",
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
    color: "#A1A1AA",
    lightColor: "#D4D4D8",
    colorVar: "cat-order",
    missions: [
      { title: "Daily Reset Zone", description: "Fast cleanup: desk/room/clothes/kitchen/files/inbox. Restore clean baseline.", duration: "10 min", xp: 20 },
      { title: "Plan Tomorrow", description: "Top 3 outcomes + first action for each. Keep it simple.", duration: "7 min", xp: 20 },
      { title: "Close 1 Loop", description: "Finish one lingering task (admin, message, setup, cleanup).", duration: "15 min", xp: 30 },
    ],
  },
];
