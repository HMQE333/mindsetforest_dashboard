import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { format, subMonths } from "date-fns";

export type TransactionType = "income" | "expense" | "subscription" | "loan_out" | "loan_in";

export interface FinanceTransaction {
  id: string;
  user_id: string;
  type: TransactionType;
  title: string;
  amount: number;
  category: string;
  date: string;
  is_recurring: boolean;
  recurring_day: number | null;
  person_name: string;
  is_settled: boolean;
  notes: string;
  created_at: string;
}

export interface MonthlyTotals {
  month: string; // YYYY-MM
  income: number;
  expenses: number;
  savings: number;
}

const EXPENSE_CATEGORIES = ["food", "transport", "entertainment", "bills", "health", "shopping", "education", "other"];
const INCOME_CATEGORIES = ["salary", "freelance", "investment", "gift", "refund", "other"];

export { EXPENSE_CATEGORIES, INCOME_CATEGORIES };

export function useFinanceState() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      const { data, error } = await (supabase.from("finance_transactions") as any)
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false });
      if (data) setTransactions(data.map((d: any) => ({ ...d, amount: Number(d.amount) })));
      if (error) console.error("Finance load error:", error);
      setLoading(false);
    };
    load();
  }, [user]);

  const addTransaction = useCallback(async (tx: Omit<FinanceTransaction, "id" | "user_id" | "created_at">) => {
    if (!user) return;
    const { data, error } = await (supabase.from("finance_transactions") as any)
      .insert([{ ...tx, user_id: user.id }])
      .select()
      .single();
    if (error) { toast.error("Failed to add transaction"); return; }
    if (data) {
      setTransactions(prev => [{ ...data, amount: Number(data.amount) }, ...prev]);
      toast.success("Transaction added");
    }
  }, [user]);

  // Bulk insert (bank statement import). Returns count inserted.
  const addTransactions = useCallback(async (rows: Array<Omit<FinanceTransaction, "id" | "user_id" | "created_at">>): Promise<number> => {
    if (!user || rows.length === 0) return 0;
    const payload = rows.map(tx => ({ ...tx, user_id: user.id }));
    const { data, error } = await (supabase.from("finance_transactions") as any)
      .insert(payload)
      .select();
    if (error) { toast.error("Failed to import transactions"); return 0; }
    const inserted = (data || []) as any[];
    if (inserted.length > 0) {
      setTransactions(prev => [...inserted.map((d: any) => ({ ...d, amount: Number(d.amount) })), ...prev]);
    }
    return inserted.length;
  }, [user]);

  const updateTransaction = useCallback(async (id: string, updates: Partial<FinanceTransaction>) => {
    if (!user) return;
    const { error } = await (supabase.from("finance_transactions") as any)
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update"); return; }
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates, amount: Number(updates.amount ?? t.amount) } : t));
    toast.success("Updated");
  }, [user]);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await (supabase.from("finance_transactions") as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to delete"); return; }
    setTransactions(prev => prev.filter(t => t.id !== id));
    toast.success("Deleted");
  }, [user]);

  const currentMonth = format(new Date(), "yyyy-MM");

  const monthlyData = useMemo((): MonthlyTotals[] => {
    const months: MonthlyTotals[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const monthTxs = transactions.filter(t => t.date.startsWith(key));
      const income = monthTxs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expenses = monthTxs.filter(t => t.type === "expense" || t.type === "subscription").reduce((s, t) => s + t.amount, 0);
      months.push({ month: key, income, expenses, savings: income - expenses });
    }
    return months;
  }, [transactions]);

  const currentMonthTotals = useMemo(() => {
    return monthlyData.find(m => m.month === currentMonth) || { month: currentMonth, income: 0, expenses: 0, savings: 0 };
  }, [monthlyData, currentMonth]);

  const activeSubscriptions = useMemo(() => {
    return transactions.filter(t => t.type === "subscription" && t.is_recurring);
  }, [transactions]);

  const subscriptionTotal = useMemo(() => {
    return activeSubscriptions.reduce((s, t) => s + t.amount, 0);
  }, [activeSubscriptions]);

  const outstandingLoans = useMemo(() => {
    return transactions.filter(t => (t.type === "loan_out" || t.type === "loan_in") && !t.is_settled);
  }, [transactions]);

  const biggestExpenseCategory = useMemo(() => {
    const monthTxs = transactions.filter(t => t.date.startsWith(currentMonth) && (t.type === "expense" || t.type === "subscription"));
    const catMap: Record<string, number> = {};
    monthTxs.forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
    let max = 0, cat = ".";
    Object.entries(catMap).forEach(([k, v]) => { if (v > max) { max = v; cat = k; } });
    return cat;
  }, [transactions, currentMonth]);

  return {
    transactions, loading, addTransaction, addTransactions, updateTransaction, deleteTransaction,
    monthlyData, currentMonthTotals, activeSubscriptions, subscriptionTotal,
    outstandingLoans, biggestExpenseCategory, currentMonth,
  };
}
