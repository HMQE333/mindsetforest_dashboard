export interface Mission {
  title: string;
  description: string;
  duration: string;
  xp: number;
  persistent?: boolean;
}

export interface Category {
  id: string;
  name: string;
  tagline: string;
  icon: string;
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
      { title: "Code 25-min Session", description: "JavaScript or PHP focused learning. Pick one concept, build or understand it.", duration: "25 min", xp: 35 },
      { title: "Review Trading Pattern", description: "Study one chart pattern or trading concept. Take 2-3 notes.", duration: "15 min", xp: 25 },
      { title: "Solve Logic Problem", description: "One coding challenge or mental math puzzle. Push boundaries slightly.", duration: "20 min", xp: 30 },
    ],
  },
  {
    id: "body",
    name: "Body",
    tagline: "Health & Fitness",
    icon: "💪",
    color: "#EF4444",
    lightColor: "#F87171",
    colorVar: "cat-body",
    missions: [
      { title: "Wing Chun Training", description: "20-min focused session. Forms, drills, or combinations.", duration: "20 min", xp: 40 },
      { title: "Nature Walk/Hike", description: "30+ minutes outdoors. Observe, breathe, reset mind.", duration: "30 min", xp: 35 },
      { title: "Stretch & Breathe", description: "Mobility work and breathing exercises for clarity.", duration: "15 min", xp: 25 },
    ],
  },
  {
    id: "creation",
    name: "Creation",
    tagline: "Build & Express",
    icon: "🎨",
    color: "#F97316",
    lightColor: "#FB923C",
    colorVar: "cat-creation",
    missions: [
      { title: "Build One Feature", description: "Work on your side project or business. One complete feature or section.", duration: "45 min", xp: 50 },
      { title: "Update Second Brain", description: "Add 500+ words to your notes, insights, or learning repository.", duration: "30 min", xp: 40 },
      { title: "Design UI Element", description: "Create or improve one visual component. Beauty and function.", duration: "25 min", xp: 35 },
    ],
  },
  {
    id: "exploration",
    name: "Exploration",
    tagline: "Discover & Aware",
    icon: "🔭",
    color: "#06B6D4",
    lightColor: "#22D3EE",
    colorVar: "cat-exploration",
    missions: [
      { title: "Research New Topic", description: "Deep dive into trading, tech, or philosophy. Learn something new.", duration: "30 min", xp: 35 },
      { title: "Educational Content", description: "Watch or listen to 20-30 min of high-quality educational material.", duration: "30 min", xp: 30 },
      { title: "Explore New Tool", description: "Test one new platform, library, or framework. Document first impressions.", duration: "20 min", xp: 25 },
    ],
  },
  {
    id: "networking",
    name: "Networking",
    tagline: "Connect & Lead",
    icon: "👑",
    color: "#FBBF24",
    lightColor: "#FCD34D",
    colorVar: "cat-networking",
    missions: [
      { title: "Network/Outreach", description: "One meaningful conversation with peer, client, or mentor.", duration: "20 min", xp: 35 },
      { title: "Help Someone", description: "Share expertise or solve someone's problem. Add value.", duration: "15 min", xp: 30 },
      { title: "Share Your Insight", description: "Document and share one lesson learned or breakthrough today.", duration: "10 min", xp: 20 },
    ],
  },
  {
    id: "trading",
    name: "Trading",
    tagline: "Trade & Journal",
    icon: "📊",
    color: "#6366F1",
    lightColor: "#818CF8",
    colorVar: "cat-trading",
    missions: [
      { title: "Daily Review", description: "What worked? What didn't? 3-5 bullet points. Be honest.", duration: "15 min", xp: 25 },
      { title: "Plan Tomorrow", description: "Set 5 priority tasks for tomorrow. Maximum 5. Clear and actionable.", duration: "10 min", xp: 20 },
      { title: "Organize System", description: "Clean up notes, code, or workspace. One focused cleanup.", duration: "20 min", xp: 30 },
    ],
  },
  {
    id: "spirit",
    name: "Spirit",
    tagline: "Philosophy & Meaning",
    icon: "✨",
    color: "#D946EF",
    lightColor: "#E879F9",
    colorVar: "cat-spirit",
    missions: [
      { title: "Philosophical Read", description: "Spend 15 min with philosophical text or deep ideas.", duration: "15 min", xp: 25 },
      { title: "Journaling", description: "Write freely about purpose, meaning, or current challenges.", duration: "15 min", xp: 25 },
      { title: "Contemplation", description: "Meditation or quiet reflection. 10 minutes minimum.", duration: "10 min", xp: 20 },
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
      { title: "Organize Workspace", description: "Digital or physical. Make one space cleaner and more functional.", duration: "20 min", xp: 25 },
      { title: "Update System", description: "Improve one process, template, or workflow. Document changes.", duration: "25 min", xp: 30 },
      { title: "Archive & Clean", description: "Clear completed tasks, old notes, or clutter. One focused area.", duration: "15 min", xp: 20 },
    ],
  },
];
