import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Copy, Check, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUGGESTION_CHIPS = [
  { label: "Convert to grams", prompt: "Convert all ingredient measurements to grams using standard conversions." },
  { label: "Scale to 2 portions", prompt: "Scale all ingredient quantities for exactly 2 portions." },
  { label: "Scale to 6 portions", prompt: "Scale all ingredient quantities for exactly 6 portions." },
  { label: "Suggest temperatures", prompt: "Add precise cooking temperatures in Celsius for every step that involves heat." },
  { label: "Simplify steps", prompt: "Rewrite the instructions in simpler, numbered steps. Be concise and clear." },
  { label: "Calculate total cost", prompt: "If ingredient costs are known, estimate the total recipe cost and cost per serving. Otherwise, flag which ingredients need pricing." },
  { label: "Add nutritional estimate", prompt: "Provide a rough nutritional estimate per serving (calories, protein, carbs, fat)." },
  { label: "Make it healthier", prompt: "Suggest ingredient substitutions to make this recipe healthier while keeping the same dish." },
];

export default function AIRecipeProcessor() {
  const [recipe, setRecipe] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showChips, setShowChips] = useState(true);

  const handleProcess = async () => {
    if (!recipe.trim() || !prompt.trim()) {
      toast.error("Please paste a recipe and describe what you want.");
      return;
    }
    setLoading(true);
    setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-recipe-process", {
        body: { recipe: recipe.trim(), prompt: prompt.trim() },
      });
      if (error) throw new Error(error.message);
      if (data?.error) {
        toast.error(data.error);
        return;
      }
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

  const appendChip = (chip: typeof SUGGESTION_CHIPS[0]) => {
    setPrompt(prev => prev ? `${prev}. ${chip.prompt}` : chip.prompt);
  };

  return (
    <div className="space-y-5">
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

        {/* Recipe input */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Paste Your Recipe</label>
          <textarea
            value={recipe}
            onChange={e => setRecipe(e.target.value)}
            placeholder="Paste any recipe here — ingredient list, instructions, units, anything..."
            rows={7}
            className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
          />
        </div>

        {/* Prompt */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">What do you want to do with it?</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. Convert all quantities to grams and scale for 2 people"
            rows={3}
            className="w-full bg-background/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
          />
        </div>

        <button
          onClick={handleProcess}
          disabled={loading || !recipe.trim() || !prompt.trim()}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Process Recipe
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">✨ Processed Result</h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/30 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans leading-relaxed">{result}</pre>
        </motion.div>
      )}
    </div>
  );
}
