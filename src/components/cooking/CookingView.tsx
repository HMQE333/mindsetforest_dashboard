import { useState } from "react";
import { motion } from "framer-motion";
import { useCookingState } from "@/hooks/useCookingState";
import RecipeJournal from "./RecipeJournal";
import AIRecipeProcessor from "./AIRecipeProcessor";
import MealPlanner from "./MealPlanner";

type CookingTab = "journal" | "ai" | "planner";

const TABS: { id: CookingTab; label: string; icon: string; desc: string }[] = [
  { id: "journal", label: "Recipe Journal", icon: "📖", desc: "Log & browse your recipe trials" },
  { id: "ai", label: "AI Processor", icon: "✨", desc: "Transform any recipe with AI" },
  { id: "planner", label: "Meal Planner", icon: "📅", desc: "Plan your meals for the week" },
];

export default function CookingView() {
  const [activeTab, setActiveTab] = useState<CookingTab>("journal");
  const cooking = useCookingState();

  if (cooking.loading) {
    return (
      <div className="text-center py-20 text-muted-foreground animate-pulse">Loading kitchen...</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-1">🍳 Cooking Studio</h2>
        <p className="text-sm text-muted-foreground">Your recipes, AI-powered tools, and weekly meal planner</p>
      </motion.div>

      {/* Stats strip */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-3 gap-3">
        {[
          { label: "Recipes", value: cooking.recipes.length, icon: "🍽" },
          { label: "Favourites", value: cooking.recipes.filter(r => r.status === "favourite").length, icon: "⭐" },
          { label: "Planned meals", value: cooking.planEntries.length, icon: "📅" },
        ].map((s, i) => (
          <div key={i} className="glass-card rounded-xl p-3 text-center border border-white/8">
            <div className="text-xl mb-0.5">{s.icon}</div>
            <div className="text-xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted/30 border border-white/8">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "gradient-purple text-primary-foreground glow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="hidden sm:block">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "journal" && (
          <RecipeJournal
            recipes={cooking.recipes}
            onSave={async (r) => { await cooking.saveRecipe(r); }}
            onDelete={cooking.deleteRecipe}
          />
        )}
        {activeTab === "ai" && <AIRecipeProcessor />}
        {activeTab === "planner" && (
          <MealPlanner
            planEntries={cooking.planEntries}
            recipes={cooking.recipes}
            onSave={cooking.savePlanEntry}
            onDelete={cooking.deletePlanEntry}
          />
        )}
      </motion.div>
    </div>
  );
}
