import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Star, Trash2, Edit2, ChevronDown, ChevronUp, ImageIcon, X } from "lucide-react";
import { CookingRecipe } from "@/hooks/useCookingState";
import RecipeFormModal from "./RecipeFormModal";

const STATUS_COLORS: Record<string, string> = {
  tried: "text-green-400 bg-green-400/10 border-green-400/30",
  "want-to-try": "text-blue-400 bg-blue-400/10 border-blue-400/30",
  favourite: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  failed: "text-red-400 bg-red-400/10 border-red-400/30",
};
const STATUS_ACCENT: Record<string, string> = {
  tried: "bg-green-500",
  "want-to-try": "bg-blue-500",
  favourite: "bg-amber-400",
  failed: "bg-red-500",
};
const STATUS_LABELS: Record<string, string> = { tried: "✅ Tried", "want-to-try": "🔖 Want to Try", favourite: "⭐ Favourite", failed: "❌ Failed" };
const DIFF_COLORS: Record<string, string> = { easy: "text-green-400", medium: "text-yellow-400", hard: "text-orange-400", pro: "text-red-400" };

interface RecipeCardProps {
  recipe: CookingRecipe;
  onEdit: (r: CookingRecipe) => void;
  onDelete: (id: string) => void;
}

function RecipeCard({ recipe, onEdit, onDelete }: RecipeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const accent = STATUS_ACCENT[recipe.status] || STATUS_ACCENT.tried;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl border border-white/8 overflow-hidden flex"
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 ${accent} opacity-70`} />

      <div className="flex-1 min-w-0">
        {/* Photo banner */}
        {recipe.photoUrl && (
          <div className="w-full h-36 overflow-hidden">
            <img src={recipe.photoUrl} alt={recipe.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Header */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className="font-bold text-foreground text-base truncate">{recipe.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[recipe.status] || STATUS_COLORS.tried}`}>
                  {STATUS_LABELS[recipe.status] || recipe.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {recipe.cookTime && <span>⏱ {recipe.cookTime}</span>}
                <span>🍽 {recipe.servings} servings</span>
                {recipe.difficulty && <span className={`capitalize font-medium ${DIFF_COLORS[recipe.difficulty]}`}>{recipe.difficulty}</span>}
                {recipe.costPerServing && <span>💰 €{recipe.costPerServing.toFixed(2)}/serving</span>}
              </div>
              {recipe.rating ? (
                <div className="flex items-center gap-0.5 mt-1">
                  {[1,2,3,4,5].map(n => (
                    <Star key={n} className={`w-3.5 h-3.5 ${n <= recipe.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/20"}`} />
                  ))}
                </div>
              ) : null}
              {recipe.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {recipe.tags.slice(0, 4).map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/30 text-muted-foreground border border-white/5">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => onEdit(recipe)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(recipe.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
              <button onClick={() => setExpanded(p => !p)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-white/8 px-4 pb-4 pt-3 space-y-3"
          >
            {recipe.ingredients && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Ingredients</div>
                <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans">{recipe.ingredients}</pre>
              </div>
            )}
            {recipe.instructions && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Instructions</div>
                <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans">{recipe.instructions}</pre>
              </div>
            )}
            {recipe.notes && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">📝 Notes</div>
                <p className="text-sm text-foreground/80">{recipe.notes}</p>
              </div>
            )}
            {recipe.aiProcessedContent && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                <div className="text-xs font-semibold text-primary mb-1">✨ AI Processed Version</div>
                <pre className="text-sm text-foreground/80 whitespace-pre-wrap font-sans">{recipe.aiProcessedContent}</pre>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

interface RecipeJournalProps {
  recipes: CookingRecipe[];
  onSave: (r: Partial<CookingRecipe>) => Promise<void>;
  onDelete: (id: string) => void;
}

export default function RecipeJournal({ recipes, onSave, onDelete }: RecipeJournalProps) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CookingRecipe | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = recipes.filter(r => {
    const matchSearch = !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleEdit = (r: CookingRecipe) => {
    setEditing(r);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full pl-9 pr-3 py-2 bg-background/50 border border-white/10 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add Recipe
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {["all", "tried", "want-to-try", "favourite", "failed"].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize ${
              filterStatus === s
                ? "bg-primary/20 border border-primary/40 text-primary"
                : "bg-muted/20 border border-white/5 text-muted-foreground hover:border-white/20"
            }`}
          >
            {s === "all" ? "All" : s === "want-to-try" ? "Wishlist" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Recipe list */}
      {filtered.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground">
          <div className="text-4xl mb-3">🍳</div>
          <p className="font-medium">{search || filterStatus !== "all" ? "No recipes match your filters" : "No recipes yet — add your first one!"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <RecipeCard key={r.id} recipe={r} onEdit={handleEdit} onDelete={onDelete} />
          ))}
        </div>
      )}

      <RecipeFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={onSave}
        initial={editing}
      />
    </div>
  );
}
