import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus, X, Utensils } from "lucide-react";
import { format, startOfWeek, addDays, addWeeks, subWeeks, isSameDay } from "date-fns";
import { CookingPlanEntry, CookingRecipe } from "@/hooks/useCookingState";

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_ICONS: Record<string, string> = { breakfast: "🌅", lunch: "☀️", dinner: "🌙", snack: "🍎" };

interface PlanEntryModalProps {
  open: boolean;
  onClose: () => void;
  date: Date;
  recipes: CookingRecipe[];
  onSave: (e: Partial<CookingPlanEntry>) => Promise<unknown>;
  existing?: CookingPlanEntry | null;
}
...
  planEntries: CookingPlanEntry[];
  recipes: CookingRecipe[];
  onSave: (e: Partial<CookingPlanEntry>) => Promise<unknown>;
  onDelete: (id: string) => void;
}

export default function MealPlanner({ planEntries, recipes, onSave, onDelete }: MealPlannerProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [addModalDate, setAddModalDate] = useState<Date | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const entriesForDate = (date: Date) =>
    planEntries.filter(e => e.planDate === format(date, "yyyy-MM-dd"))
      .sort((a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType));

  const today = new Date();

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between glass-card rounded-xl p-3">
        <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-foreground">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
        </span>
        <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map(day => {
          const isToday = isSameDay(day, today);
          const dayEntries = entriesForDate(day);
          return (
            <div key={day.toISOString()} className={`rounded-xl border transition-all ${isToday ? "border-primary/40 bg-primary/5" : "border-white/8 bg-muted/10"}`}>
              {/* Day header */}
              <div className={`text-center py-1.5 px-1 border-b ${isToday ? "border-primary/20" : "border-white/5"}`}>
                <div className="text-[10px] font-medium text-muted-foreground">{format(day, "EEE")}</div>
                <div className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</div>
              </div>
              {/* Meals */}
              <div className="p-1 space-y-1 min-h-[80px]">
                {dayEntries.map(entry => {
                  const recipe = recipes.find(r => r.id === entry.recipeId);
                  const label = entry.customLabel || recipe?.title || entry.mealType;
                  return (
                    <div key={entry.id} className="group relative">
                      <div className="text-[10px] bg-primary/10 border border-primary/20 rounded-md px-1.5 py-1 text-foreground leading-tight flex items-start gap-1">
                        <span className="shrink-0">{MEAL_ICONS[entry.mealType]}</span>
                        <span className="truncate flex-1">{label}</span>
                      </div>
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[9px] items-center justify-center hidden group-hover:flex z-10"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => setAddModalDate(day)}
                  className="w-full flex items-center justify-center py-1 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center flex-wrap">
        {MEAL_TYPES.map(m => (
          <div key={m} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{MEAL_ICONS[m]}</span><span className="capitalize">{m}</span>
          </div>
        ))}
      </div>

      {/* No entries prompt */}
      {planEntries.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <Utensils className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Click <strong>+</strong> on any day to plan your meals!</p>
        </div>
      )}

      {addModalDate && (
        <PlanEntryModal
          open={true}
          onClose={() => setAddModalDate(null)}
          date={addModalDate}
          recipes={recipes}
          onSave={onSave}
        />
      )}
    </div>
  );
}
