import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import type { FinanceTransaction } from "@/hooks/useFinanceState";
import { useFinanceCategories } from "@/hooks/useFinanceCategories";
import { format, parse } from "date-fns";

interface Props {
  transactions: FinanceTransaction[];
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
  currentMonth: string;
}

const TYPE_FALLBACK_ICONS: Record<string, string> = {
  income: "💰", expense: "💸", subscription: "🔁", loan_out: "🤝", loan_in: "📥",
};

export default function FinanceTransactions({ transactions, onDelete, onAdd, currentMonth }: Props) {
  const { findByName } = useFinanceCategories();
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterType, setFilterType] = useState<string>("all");

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filterMonth && !t.date.startsWith(filterMonth)) return false;
      if (filterType !== "all" && t.type !== filterType) return false;
      // Exclude subs and loans — they have their own tabs
      if (t.type === "subscription" || t.type === "loan_out" || t.type === "loan_in") return false;
      return true;
    });
  }, [transactions, filterMonth, filterType]);

  const months = useMemo(() => {
    const set = new Set(transactions.map(t => t.date.substring(0, 7)));
    set.add(currentMonth);
    return Array.from(set).sort().reverse();
  }, [transactions, currentMonth]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs text-foreground focus:outline-none"
        >
          <option value="">All months</option>
          {months.map(m => {
            const label = (() => { try { return format(parse(m + "-01", "yyyy-MM-dd", new Date()), "MMMM yyyy"); } catch { return m; } })();
            return <option key={m} value={m}>{label}</option>;
          })}
        </select>
        <select
          value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs text-foreground focus:outline-none"
        >
          <option value="all">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <button onClick={onAdd} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-xs font-bold glow-sm hover:opacity-90 transition-all">
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>

      {/* Transaction list */}
      <div className="space-y-1.5">
        <AnimatePresence>
          {filtered.length === 0 && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-sm text-muted-foreground py-8">
              No transactions yet
            </motion.p>
          )}
          {filtered.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center gap-3 p-3 rounded-xl glass-card border border-border hover:border-white/10 transition-all group"
            >
              <span className="text-lg">{TYPE_ICONS[t.type] || "💸"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-foreground truncate">{t.title}</div>
                <div className="text-[11px] text-muted-foreground">{t.category} • {t.date}</div>
              </div>
              <span className={`text-sm font-bold ${t.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                {t.type === "income" ? "+" : "-"}${t.amount.toLocaleString()}
              </span>
              <button
                onClick={() => onDelete(t.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-all"
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
