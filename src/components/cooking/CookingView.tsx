import { useState } from "react";
import { motion } from "framer-motion";
import { useCookingState } from "@/hooks/useCookingState";
import RecipeJournal from "./RecipeJournal";
import AIRecipeProcessor from "./AIRecipeProcessor";
import MealPlanner from "./MealPlanner";
import { Skeleton } from "@/components/ui/skeleton";

type CookingTab = "journal" | "ai" | "planner";

const TABS: { id: CookingTab; label: string; icon: string }[] = [
  { id: "journal", label: "Recipe Journal", icon: "📖" },
  { id: "ai", label: "AI Processor", icon: "✨" },
  { id: "planner", label: "Meal Planner", icon: "📅" },
];

export default function CookingView() {
  const [activeTab, setActiveTab] = useState<CookingTab>("journal");
  const cooking = useCookingState();

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-1">🍳 Cooking Studio</h2>
        <p className="text-sm text-muted-foreground">Your recipes, AI-powered tools, and weekly meal planner</p>
      </motion.div>

      {/* Stats strip */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-3 gap-3">
        {cooking.loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="rounded-xl h-[72px]" />
          ))
        ) : [
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
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "gradient-purple text-primary-foreground glow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content — all panels stay mounted to preserve state */}
      <div className={activeTab === "journal" ? "" : "hidden"}>
        <RecipeJournal
          recipes={cooking.recipes}
          onSave={async (r) => { await cooking.saveRecipe(r); }}
          onDelete={cooking.deleteRecipe}
        />
      </div>
      <div className={activeTab === "ai" ? "" : "hidden"}>
        <AIRecipeProcessor />
      </div>
      <div className={activeTab === "planner" ? "" : "hidden"}>
        <MealPlanner
          planEntries={cooking.planEntries}
          recipes={cooking.recipes}
          onSave={cooking.savePlanEntry}
          onDelete={cooking.deletePlanEntry}
        />
      </div>
    </div>
  );
}
