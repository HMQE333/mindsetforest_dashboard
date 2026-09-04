import { Check, Sparkles } from "lucide-react";
import { AI_MODEL_CHOICES, DEFAULT_AI_MODEL, AIModelChoice } from "@/lib/ai-model";
import { UserPreferences } from "@/hooks/useUserSettings";

interface Props {
  preferences: UserPreferences;
  onSave: (prefs: UserPreferences) => void;
}

export default function AITab({ preferences, onSave }: Props) {
  const current: AIModelChoice = preferences.aiModel || DEFAULT_AI_MODEL;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Planning model
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Which model builds your plan simulations and answers in the plan chat. The rest of the app's
          smaller AI features are unaffected.
        </p>
      </div>

      <div className="space-y-2">
        {AI_MODEL_CHOICES.map((choice) => {
          const active = current === choice.id;
          return (
            <button
              key={choice.id}
              onClick={() => onSave({ ...preferences, aiModel: choice.id })}
              className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                active ? "border-primary/50 bg-primary/10" : "border-white/10 bg-muted/30 hover:bg-white/5"
              }`}
            >
              <span className={`mt-0.5 h-5 w-5 rounded-full border shrink-0 flex items-center justify-center ${
                active ? "gradient-purple border-transparent" : "border-muted-foreground/30"
              }`}>
                {active && <Check className="h-3 w-3 text-primary-foreground" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-foreground">{choice.label}</span>
                <span className="block text-xs text-muted-foreground mt-0.5">{choice.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Both run through OpenRouter with the same key. Switching applies to your next generation or message.
      </p>
    </div>
  );
}
