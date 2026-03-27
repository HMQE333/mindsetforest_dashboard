import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Trash2 } from "lucide-react";
import type { FinanceTransaction } from "@/hooks/useFinanceState";

interface Props {
  loans: FinanceTransaction[];
  onSettle: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
}

export default function FinanceLoans({ loans, onSettle, onDelete, onAdd }: Props) {
  const theyOwe = loans.filter(l => l.type === "loan_out");
  const youOwe = loans.filter(l => l.type === "loan_in");
  const theyOweTotal = theyOwe.reduce((s, l) => s + l.amount, 0);
  const youOweTotal = youOwe.reduce((s, l) => s + l.amount, 0);

  const renderList = (items: FinanceTransaction[], label: string, color: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</h4>
        <span className="text-sm font-bold" style={{ color }}>${items.reduce((s, l) => s + l.amount, 0).toLocaleString()}</span>
      </div>
      <AnimatePresence>
        {items.length === 0 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted-foreground py-4 text-center">None</motion.p>
        )}
        {items.map((l, i) => (
          <motion.div
            key={l.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-3 p-3 rounded-xl glass-card border border-border group"
          >
            <span className="text-lg">{l.type === "loan_out" ? "🤝" : "📥"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">{l.person_name || l.title}</div>
              <div className="text-[11px] text-muted-foreground">{l.title} • {l.date}</div>
            </div>
            <span className="text-sm font-bold" style={{ color }}>${l.amount.toLocaleString()}</span>
            <button
              onClick={() => onSettle(l.id)}
              className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400 transition-all"
              title="Mark settled"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(l.id)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold glow-sm hover:opacity-90 transition-all">
          <Plus className="w-3.5 h-3.5" /> Add Loan
        </button>
      </div>

      {renderList(theyOwe, "They owe you", "hsl(142, 71%, 45%)")}
      {renderList(youOwe, "You owe them", "hsl(0, 72%, 51%)")}
    </div>
  );
}
