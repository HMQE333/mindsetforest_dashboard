import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Copy, Check, ChevronDown, X, Save, AlertTriangle, Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CookingRecipe } from "@/hooks/useCookingState";
import RecipeFormModal from "./RecipeFormModal";
import ShoppingPromptModal from "./ShoppingPromptModal";

const SUGGESTION_CHIPS = [
  { label: "✨ Clean & Simplify", prompt: "Clean and simplify this recipe completely. Strip all tips, backstory, alternatives, and commentary. Convert all quantities to grams. Pick one option when alternatives are listed. Output only: RECIPE NAME (uppercase), then Ingredients section (one item per line as '- Name: Xg'), then Instructions section (numbered, one action per step, max 15 words each). No blank lines within sections." },
  { label: "Convert to grams", prompt: "Convert all ingredient measurements to grams using standard conversions." },
  { label: "Scale to 2 portions", prompt: "Scale all ingredient quantities for exactly 2 portions." },
  { label: "Scale to 6 portions", prompt: "Scale all ingredient quantities for exactly 6 portions." },
  { label: "Suggest temperatures", prompt: "Add precise cooking temperatures in Celsius for every step that involves heat." },
  { label: "Simplify steps", prompt: "Rewrite only the instructions in simpler, shorter numbered steps. Keep ingredient list unchanged. Be concise — one action per step." },
  { label: "Calculate total cost", prompt: "If ingredient costs are known, estimate the total recipe cost and cost per serving. Otherwise, flag which ingredients need pricing." },
  { label: "Add nutritional estimate", prompt: "Provide a rough nutritional estimate per serving (calories, protein, carbs, fat)." },
  { label: "Make it healthier", prompt: "Suggest ingredient substitutions to make this recipe healthier while keeping the same dish." },
];

interface Props {
  recipes: CookingRecipe[];
  onSaveRecipe: (recipe: Partial<CookingRecipe> & { id?: string }) => Promise<CookingRecipe | null>;
}

type SaveMode = "choose" | "attach" | "new";

function extractTitle(raw: string): string {
  const firstLine = raw.split("\n").map(l => l.trim()).find(l => l.length > 2);
  return firstLine ? firstLine.replace(/^#+\s*/, "").slice(0, 80) : "New Recipe";
}

const buildShoppingPrompt = (text: string) =>
  `Here is a recipe. Please generate a clean, ordered shopping list with all ingredients grouped by category (produce, dairy, meat, dry goods, etc.) and exact amounts in grams. Do not include any instructions — only the shopping list.\n\n---\n${text.trim()}\n---`;

export default function AIRecipeProcessor({ recipes, onSaveRecipe }: Props) {
  const [recipe, setRecipe] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedShoppingRaw, setCopiedShoppingRaw] = useState(false);
  const [copiedShoppingResult, setCopiedShoppingResult] = useState(false);
  const [showChips, setShowChips] = useState(true);

  // Save-to-recipe state
  const [saveMode, setSaveMode] = useState<SaveMode | null>(null);
  const [search, setSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<CookingRecipe | null>(null);
  const [overwriteStep, setOverwriteStep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRecipeOpen, setNewRecipeOpen] = useState(false);

  const handleProcess = async () => {
    if (!recipe.trim() || !prompt.trim()) {
      toast.error("Please paste a recipe and describe what you want.");
      return;
    }
    setLoading(true);
    setResult("");
    setSaveMode(null);
    setSelectedRecipe(null);
    setOverwriteStep(false);
    try {
      const { data, error } = await supabase.functions.invoke("ai-recipe-process", {
        body: { recipe: recipe.trim(), prompt: prompt.trim() },
      });
      if (error) throw new Error(error.message);
      if (data?.error) { toast.error(data.error); return; }
      setResult(data.result || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI processing failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Copied to clipboard!");
  };

  const handleCopyShoppingRaw = () => {
    navigator.clipboard.writeText(buildShoppingPrompt(recipe));
    setCopiedShoppingRaw(true);
    setTimeout(() => setCopiedShoppingRaw(false), 2000);
    toast.success("Shopping prompt copied!");
  };

  const handleCopyShoppingResult = () => {
    navigator.clipboard.writeText(buildShoppingPrompt(result));
    setCopiedShoppingResult(true);
    setTimeout(() => setCopiedShoppingResult(false), 2000);
    toast.success("Shopping prompt copied!");
  };

  const appendChip = (chip: typeof SUGGESTION_CHIPS[0]) => {
    setPrompt(prev => prev ? `${prev}. ${chip.prompt}` : chip.prompt);
  };

  // Attach-to-existing flow
  const filteredRecipes = recipes.filter(r =>
    r.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleAttachSelect = (r: CookingRecipe) => {
    setSelectedRecipe(r);
    setOverwriteStep(!!r.aiProcessedContent);
  };

  const handleAttachConfirm = async () => {
    if (!selectedRecipe) return;
    setSaving(true);
    const saved = await onSaveRecipe({ ...selectedRecipe, aiProcessedContent: result });
    setSaving(false);
    if (saved) {
      toast.success(`AI content saved to "${selectedRecipe.title}"`);
      setSaveMode(null);
      setSelectedRecipe(null);
      setOverwriteStep(false);
      setSearch("");
    }
  };

  const closeSave = () => {
    setSaveMode(null);
    setSelectedRecipe(null);
    setOverwriteStep(false);
    setSearch("");
  };

  // Pre-filled new recipe
  const prefilledRecipe: Partial<CookingRecipe> = {
    title: extractTitle(recipe),
    ingredients: recipe,
    aiProcessedContent: result,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

        {/* LEFT — Recipe paste */}
        <div className="glass-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paste Your Recipe</label>
            {recipe && (
              <button onClick={() => setRecipe("")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <textarea
            value={recipe}
            onChange={e => setRecipe(e.target.value)}
            placeholder="Paste any recipe here — ingredient list, instructions, units, anything..."
            rows={14}
            className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground/50">{recipe.length} chars</div>
            {recipe.trim() && (
              <button
                onClick={handleCopyShoppingRaw}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/20 border border-white/10 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
              >
                {copiedShoppingRaw ? <Check className="w-3 h-3 text-primary" /> : <span>🛒</span>}
                {copiedShoppingRaw ? "Copied!" : "Copy shopping prompt"}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — Prompt + chips + result */}
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-5 space-y-4">
            {/* Suggestion chips */}
            <div>
              <button
                onClick={() => setShowChips(p => !p)}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Quick suggestions
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showChips ? "rotate-180" : ""}`} />
              </button>
              {showChips && (
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTION_CHIPS.map(chip => (
                    <button
                      key={chip.label}
                      onClick={() => appendChip(chip)}
                      className="px-2.5 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/15 hover:border-primary/60 transition-all"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">What do you want to do?</label>
                {prompt && (
                  <button onClick={() => setPrompt("")} className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Convert all quantities to grams and scale for 2 people"
                rows={4}
                className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
              />
            </div>

            <button
              onClick={handleProcess}
              disabled={loading || !recipe.trim() || !prompt.trim()}
              className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
              ) : (
                <><Sparkles className="w-4 h-4" />Process Recipe</>
              )}
            </button>
          </div>

          {/* Result */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-2xl p-5 space-y-3 border border-primary/30"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-bold text-foreground">✨ Processed Result</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleCopyShoppingResult}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/20 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
                  >
                    {copiedShoppingResult ? <Check className="w-3.5 h-3.5 text-primary" /> : <span>🛒</span>}
                    {copiedShoppingResult ? "Copied!" : "Shopping prompt"}
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => setSaveMode("choose")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/40 text-xs text-primary font-semibold hover:bg-primary/25 transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save to Recipe
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-[13px] text-foreground/90 font-sans leading-relaxed">{result}</pre>
            </motion.div>
          )}
        </div>
      </div>

      {/* Save-to-recipe inline modal */}
      <AnimatePresence>
        {saveMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeSave} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="text-base font-bold text-foreground">💾 Save AI Result</h2>
                <button onClick={closeSave} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {saveMode === "choose" && (
                  <>
                    <p className="text-sm text-muted-foreground">Where do you want to save this AI result?</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setSaveMode("attach")}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/10 bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all text-left"
                      >
                        <span className="text-2xl">📎</span>
                        <span className="text-sm font-semibold text-foreground">Attach to existing</span>
                        <span className="text-[11px] text-muted-foreground text-center">Add AI content to a recipe already in your journal</span>
                      </button>
                      <button
                        onClick={() => { closeSave(); setNewRecipeOpen(true); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-white/10 bg-muted/20 hover:bg-muted/40 hover:border-primary/40 transition-all text-left"
                      >
                        <span className="text-2xl">✨</span>
                        <span className="text-sm font-semibold text-foreground">Create new entry</span>
                        <span className="text-[11px] text-muted-foreground text-center">Open a pre-filled form with this result as a new recipe</span>
                      </button>
                    </div>
                  </>
                )}

                {saveMode === "attach" && !overwriteStep && (
                  <>
                    <p className="text-sm text-muted-foreground">Pick the recipe to attach this AI result to:</p>
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search recipes..."
                        autoFocus
                        className="w-full bg-background/50 border border-white/10 rounded-xl pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                      />
                    </div>
                    {/* Recipe list */}
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {filteredRecipes.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No recipes found</p>
                      )}
                      {filteredRecipes.map(r => (
                        <button
                          key={r.id}
                          onClick={() => handleAttachSelect(r)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all border ${
                            selectedRecipe?.id === r.id
                              ? "bg-primary/15 border-primary/50 text-foreground"
                              : "bg-muted/20 border-white/5 text-foreground hover:bg-muted/40 hover:border-white/15"
                          }`}
                        >
                          <span className="font-medium">{r.title}</span>
                          {r.aiProcessedContent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0 ml-2">
                              has AI content
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setSaveMode("choose")} className="flex-1 py-2 rounded-xl text-sm text-muted-foreground bg-muted/20 border border-white/10 hover:bg-muted/40 transition-all">
                        Back
                      </button>
                      <button
                        onClick={selectedRecipe ? (selectedRecipe.aiProcessedContent ? () => setOverwriteStep(true) : handleAttachConfirm) : undefined}
                        disabled={!selectedRecipe || saving}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold gradient-purple text-primary-foreground glow-sm disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                      >
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Attach</>}
                      </button>
                    </div>
                  </>
                )}

                {saveMode === "attach" && overwriteStep && selectedRecipe && (
                  <>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Overwrite existing AI content?</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="text-foreground/70">"{selectedRecipe.title}"</span> already has AI-processed content. This will replace it permanently.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setOverwriteStep(false)}
                        className="flex-1 py-2 rounded-xl text-sm text-muted-foreground bg-muted/20 border border-white/10 hover:bg-muted/40 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAttachConfirm}
                        disabled={saving}
                        className="flex-1 py-2 rounded-xl text-sm font-semibold bg-amber-500/20 border border-amber-500/50 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                      >
                        {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Overwrite"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New recipe form pre-filled */}
      <RecipeFormModal
        open={newRecipeOpen}
        onClose={() => setNewRecipeOpen(false)}
        onSave={async (r) => { await onSaveRecipe(r); setNewRecipeOpen(false); toast.success("Recipe created from AI result!"); }}
      initial={prefilledRecipe as unknown as CookingRecipe}
      />
    </div>
  );
}
