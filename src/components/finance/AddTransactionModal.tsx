import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { TransactionType, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/hooks/useFinanceState";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (tx: any) => Promise<void>;
  defaultType?: TransactionType;
}

const TYPE_OPTIONS: { value: TransactionType; label: string; icon: string }[] = [
  { value: "income", label: "Income", icon: "💰" },
  { value: "expense", label: "Expense", icon: "💸" },
  { value: "subscription", label: "Subscription", icon: "🔁" },
  { value: "loan_out", label: "Lent (they owe you)", icon: "🤝" },
  { value: "loan_in", label: "Borrowed (you owe)", icon: "📥" },
];

export default function AddTransactionModal({ open, onClose, onAdd, defaultType }: Props) {
  const [type, setType] = useState<TransactionType>(defaultType || "expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("other");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [personName, setPersonName] = useState("");
  const [recurringDay, setRecurringDay] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isLoan = type === "loan_out" || type === "loan_in";
  const isSub = type === "subscription";
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSubmit = async () => {
    if (!title.trim() || !amount) return;
    setSaving(true);
    await onAdd({
      type,
      title: title.trim(),
      amount: parseFloat(amount),
      category,
      date,
      is_recurring: isSub,
      recurring_day: isSub && recurringDay ? parseInt(recurringDay) : null,
      person_name: isLoan ? personName.trim() : "",
      is_settled: false,
      notes: notes.trim(),
    });
    setSaving(false);
    onClose();
    setTitle(""); setAmount(""); setCategory("other"); setPersonName(""); setRecurringDay(""); setNotes("");
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md glass-card rounded-2xl border border-border p-5 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">Add Transaction</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted/50 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>

            {/* Type selector */}
            <div className="flex flex-wrap gap-1.5">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    type === opt.value ? "bg-primary/20 border border-primary/50 text-foreground" : "bg-muted/30 border border-border text-muted-foreground hover:border-white/20"
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            {/* Title */}
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Title..." className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Amount" className="px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Category */}
            {!isLoan && (
              <select
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                {cats.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            )}

            {/* Person name for loans */}
            {isLoan && (
              <input
                value={personName} onChange={e => setPersonName(e.target.value)}
                placeholder="Person name..." className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            )}

            {/* Recurring day for subscriptions */}
            {isSub && (
              <input
                type="number" min={1} max={31} value={recurringDay} onChange={e => setRecurringDay(e.target.value)}
                placeholder="Billing day (1-31)" className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            )}

            {/* Notes */}
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Notes (optional)..." rows={2}
              className="w-full px-3 py-2.5 rounded-xl bg-muted/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
            />

            <button
              onClick={handleSubmit}
              disabled={!title.trim() || !amount || saving}
              className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : "Add Transaction"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
