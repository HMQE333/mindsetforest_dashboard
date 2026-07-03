import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import type { FinanceTransaction } from "@/hooks/useFinanceState";

interface Props {
  subscriptions: FinanceTransaction[];
  total: number;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
}

export default function FinanceSubscriptions({ subscriptions, total, onDelete, onAdd }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Monthly total</p>
          <p className="text-2xl font-bold text-foreground">${total.toLocaleString()}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold glow-sm hover:opacity-90 transition-all">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <AnimatePresence>
          {subscriptions.length === 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full text-center text-sm text-muted-foreground py-8">
              No subscriptions yet
            </motion.p>
          )}
          {subscriptions.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.04 }}
              className="glass-card rounded-xl border border-border p-4 group relative"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-foreground">🔁 {s.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.category}</div>
                  {s.recurring_day && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">Bills on day {s.recurring_day}</div>
                  )}
                </div>
                <span className="text-lg font-bold text-red-400">${s.amount.toLocaleString()}</span>
              </div>
              <button
                onClick={() => onDelete(s.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
