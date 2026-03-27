import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Wallet, CreditCard } from "lucide-react";
import type { MonthlyTotals } from "@/hooks/useFinanceState";
import { format, parse } from "date-fns";

interface Props {
  monthlyData: MonthlyTotals[];
  currentMonthTotals: MonthlyTotals;
  subscriptionTotal: number;
  biggestExpenseCategory: string;
  outstandingLoansTotal: number;
}

export default function FinanceOverview({ monthlyData, currentMonthTotals, subscriptionTotal, biggestExpenseCategory, outstandingLoansTotal }: Props) {
  const maxVal = Math.max(...monthlyData.flatMap(m => [m.income, m.expenses]), 1);

  const stats = [
    { label: "Income", value: currentMonthTotals.income, icon: TrendingUp, color: "hsl(142, 71%, 45%)" },
    { label: "Expenses", value: currentMonthTotals.expenses, icon: TrendingDown, color: "hsl(0, 72%, 51%)" },
    { label: "Savings", value: currentMonthTotals.savings, icon: Wallet, color: "hsl(var(--primary))" },
    { label: "Subscriptions", value: subscriptionTotal, icon: CreditCard, color: "hsl(45, 97%, 56%)" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card rounded-xl p-4 border border-border"
          >
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
              <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
            </div>
            <div className="text-xl font-bold text-foreground" style={{ color: s.label === "Savings" && s.value < 0 ? "hsl(0, 72%, 51%)" : undefined }}>
              {s.value < 0 ? "-" : ""}${Math.abs(s.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick info */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border">
          📊 Top expense: <span className="text-foreground font-medium">{biggestExpenseCategory}</span>
        </span>
        {outstandingLoansTotal > 0 && (
          <span className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border">
            🤝 Outstanding loans: <span className="text-foreground font-medium">${outstandingLoansTotal.toLocaleString()}</span>
          </span>
        )}
      </div>

      {/* 6-month savings chart */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-card rounded-2xl border border-border p-5"
      >
        <h3 className="text-sm font-bold text-foreground mb-4">📈 6-Month Overview</h3>
        <div className="space-y-3">
          {monthlyData.map((m, i) => {
            const label = (() => {
              try {
                const d = parse(m.month + "-01", "yyyy-MM-dd", new Date());
                return format(d, "MMM yy");
              } catch { return m.month; }
            })();
            return (
              <div key={m.month} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium w-14">{label}</span>
                  <span className="text-muted-foreground">
                    <span style={{ color: "hsl(142, 71%, 45%)" }}>${m.income.toLocaleString()}</span>
                    {" / "}
                    <span style={{ color: "hsl(0, 72%, 51%)" }}>${m.expenses.toLocaleString()}</span>
                    {" → "}
                    <span className="font-bold" style={{ color: m.savings >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 72%, 51%)" }}>
                      {m.savings >= 0 ? "+" : "-"}${Math.abs(m.savings).toLocaleString()}
                    </span>
                  </span>
                </div>
                <div className="flex gap-1 h-5">
                  {/* Income bar */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((m.income / maxVal) * 100, m.income > 0 ? 4 : 0)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08 }}
                    className="h-full rounded-md"
                    style={{ background: "hsl(142, 71%, 45%)", opacity: 0.7 }}
                  />
                  {/* Expense bar */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((m.expenses / maxVal) * 100, m.expenses > 0 ? 4 : 0)}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08 + 0.1 }}
                    className="h-full rounded-md"
                    style={{ background: "hsl(0, 72%, 51%)", opacity: 0.7 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(142, 71%, 45%)", opacity: 0.7 }} /> Income</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(0, 72%, 51%)", opacity: 0.7 }} /> Expenses</span>
        </div>
      </motion.div>
    </div>
  );
}
