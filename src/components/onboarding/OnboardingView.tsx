import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CATEGORIES } from "@/lib/dashboard-data";
import { CustomCategory } from "@/hooks/useOnboarding";

const DEFAULT_ICONS = ["🧠", "💪", "🎨", "🔭", "👑", "📊", "✨", "⚙️"];

interface Props {
  onComplete: (categories?: CustomCategory[]) => void;
}

export default function OnboardingView({ onComplete }: Props) {
  const [step, setStep] = useState<"choice" | "custom">("choice");
  const [customs, setCustoms] = useState<CustomCategory[]>(
    CATEGORIES.map((c, i) => ({
      id: c.id,
      name: c.name,
      tagline: c.tagline,
      icon: DEFAULT_ICONS[i] || "📌",
    }))
  );

  const updateCustom = (index: number, field: keyof CustomCategory, value: string) => {
    setCustoms(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />

      <AnimatePresence mode="wait">
        {step === "choice" ? (
          <motion.div
            key="choice"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 w-full max-w-md text-center"
          >
            <div className="text-5xl mb-6">🌲</div>
            <h1 className="text-2xl font-bold text-gradient-purple mb-2">Welcome to MindsetForest</h1>
            <p className="text-sm text-muted-foreground mb-10">
              How would you like to set up your life categories?
            </p>

            <div className="space-y-4">
              <button
                onClick={() => onComplete()}
                className="w-full glass-card p-5 border-white/15 hover:border-primary/40 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">⚡</span>
                  <div>
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">Use defaults</p>
                    <p className="text-xs text-muted-foreground">8 pre-configured life categories with ready-to-go missions</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setStep("custom")}
                className="w-full glass-card p-5 border-white/15 hover:border-primary/40 transition-all text-left group"
              >
                <div className="flex items-center gap-4">
                  <span className="text-3xl">✏️</span>
                  <div>
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">Customize my own</p>
                    <p className="text-xs text-muted-foreground">Define your own 8 life pillars and what they mean to you</p>
                  </div>
                </div>
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="custom"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 w-full max-w-lg"
          >
            <button
              onClick={() => setStep("choice")}
              className="text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              ← Back
            </button>

            <h2 className="text-xl font-bold text-foreground mb-1">Your 8 Life Pillars</h2>
            <p className="text-xs text-muted-foreground mb-6">
              Name each category and describe what it means to you. You can change these later.
            </p>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {customs.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-4 border-white/10"
                >
                  <div className="flex items-start gap-3">
                    <input
                      value={cat.icon}
                      onChange={e => updateCustom(i, "icon", e.target.value)}
                      className="w-10 h-10 text-center text-xl bg-muted/50 rounded-lg border border-border outline-none focus:border-primary transition-colors flex-shrink-0"
                      maxLength={2}
                    />
                    <div className="flex-1 space-y-2">
                      <input
                        value={cat.name}
                        onChange={e => updateCustom(i, "name", e.target.value)}
                        placeholder="Category name"
                        className="w-full bg-transparent text-sm font-bold text-foreground outline-none border-b border-border/50 focus:border-primary pb-1 transition-colors"
                        maxLength={20}
                      />
                      <input
                        value={cat.tagline}
                        onChange={e => updateCustom(i, "tagline", e.target.value)}
                        placeholder="What does this mean to you?"
                        className="w-full bg-transparent text-xs text-muted-foreground outline-none border-b border-border/30 focus:border-primary/50 pb-1 transition-colors"
                        maxLength={40}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={() => onComplete(customs)}
              className="w-full mt-6 py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground hover:opacity-90 transition-all glow-sm"
            >
              Start My Journey 🚀
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
