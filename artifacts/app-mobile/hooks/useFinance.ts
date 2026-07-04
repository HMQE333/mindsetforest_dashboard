import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { type FinanceTransaction } from "@/lib/data";
import { useAuth } from "./useAuth";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function useFinance() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    const { data, error } = await (supabase.from("finance_transactions") as any)
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false });
    if (data) setTransactions(data.map((d: any) => ({ ...d, amount: Number(d.amount) })));
    if (error) console.error("finance load error:", error.message);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const addTransaction = useCallback(
    async (tx: Omit<FinanceTransaction, "id" | "user_id" | "created_at">) => {
      if (!user) return;
      const { data, error } = await (supabase.from("finance_transactions") as any)
        .insert([{ ...tx, user_id: user.id }])
        .select()
        .single();
      if (error) {
        console.error("finance add error:", error.message);
        return;
      }
      if (data) setTransactions((prev) => [{ ...data, amount: Number(data.amount) }, ...prev]);
    },
    [user],
  );

  const deleteTransaction = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await (supabase.from("finance_transactions") as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        console.error("finance delete error:", error.message);
        return;
      }
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    },
    [user],
  );

  const currentMonth = monthKey(new Date());

  const monthlyData = useMemo(() => {
    const months: { month: string; income: number; expenses: number; savings: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = monthKey(d);
      const monthTxs = transactions.filter((t) => t.date.startsWith(key));
      const income = monthTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxs
        .filter((t) => t.type === "expense" || t.type === "subscription")
        .reduce((s, t) => s + t.amount, 0);
      months.push({ month: key, income, expenses, savings: income - expenses });
    }
    return months;
  }, [transactions]);

  const currentMonthTotals = useMemo(
    () => monthlyData.find((m) => m.month === currentMonth) || { month: currentMonth, income: 0, expenses: 0, savings: 0 },
    [monthlyData, currentMonth],
  );

  const activeSubscriptions = useMemo(
    () => transactions.filter((t) => t.type === "subscription" && t.is_recurring),
    [transactions],
  );

  const subscriptionTotal = useMemo(
    () => activeSubscriptions.reduce((s, t) => s + t.amount, 0),
    [activeSubscriptions],
  );

  const outstandingLoans = useMemo(
    () => transactions.filter((t) => (t.type === "loan_out" || t.type === "loan_in") && !t.is_settled),
    [transactions],
  );

  return {
    transactions,
    loading,
    addTransaction,
    deleteTransaction,
    monthlyData,
    currentMonthTotals,
    activeSubscriptions,
    subscriptionTotal,
    outstandingLoans,
    currentMonth,
  };
}
