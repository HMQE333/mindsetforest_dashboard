import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  recipeText: string;
  recipeTitle?: string;
  defaultServings?: number;
}

function buildAuchanPrompt(recipeText: string, servings: number): string {
  return `I need you to act as my shopping assistant for auchan.pl

Here is a recipe scaled to ${servings} serving${servings !== 1 ? "s" : ""}:

---
${recipeText.trim()}
---

Instructions:
1. Extract ALL ingredients from the recipe above and convert quantities to ${servings} servings
2. Go to auchan.pl and add each ingredient to my cart
3. If an exact product is not available, find the closest alternative and add that instead
4. Make sure every ingredient is accounted for. Nothing should be missing
5. Group items by category (produce, dairy, meat, dry goods, spices, etc.)
6. Once done, confirm the full cart list so I can review before checkout

Let's go. Start adding items to the cart.`;
}

export default function ShoppingPromptModal({ open, onClose, recipeText, recipeTitle, defaultServings = 2 }: Props) {
  const [servings, setServings] = useState(defaultServings);
  const [copied, setCopied] = useState(false);

  const prompt = buildAuchanPrompt(recipeText, servings);

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Shopping prompt copied. Paste it into ChatGPT!");
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">Shopping Prompt</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {recipeTitle && (
              <p className="text-xs text-muted-foreground">
                Recipe: <span className="text-foreground font-medium">{recipeTitle}</span>
              </p>
            )}

            {/* Servings selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                How many servings?
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 6, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setServings(n)}
                    className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                      servings === n
                        ? "bg-primary/20 border border-primary/50 text-primary"
                        : "bg-muted/20 border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={servings}
                  onChange={e => setServings(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 h-9 rounded-xl bg-background/50 border border-white/10 text-center text-sm text-foreground focus:outline-none focus:border-primary/40"
                />
              </div>
            </div>

            {/* Prompt preview */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Prompt preview
              </label>
              <div className="max-h-40 overflow-y-auto rounded-xl bg-background/50 border border-white/10 p-3">
                <pre className="text-[11px] text-foreground/70 whitespace-pre-wrap font-sans leading-relaxed">
                  {prompt}
                </pre>
              </div>
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              {copied ? (
                <><Check className="w-4 h-4" /> Copied. Paste into ChatGPT!</>
              ) : (
                <><Copy className="w-4 h-4" /> Copy Shopping Prompt</>
              )}
            </button>

            <p className="text-[10px] text-muted-foreground/60 text-center">
              Paste this prompt into ChatGPT to order ingredients from auchan.pl
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
