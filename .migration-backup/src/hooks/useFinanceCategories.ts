import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export type CategoryKind = "expense" | "income";

export interface FinanceCategory {
  id: string;
  user_id: string;
  kind: CategoryKind;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

const DEFAULT_EXPENSE: Array<Omit<FinanceCategory, "id" | "user_id" | "created_at">> = [
  { kind: "expense", name: "Food",          icon: "🍔", color: "#F59E0B", sort_order: 0 },
  { kind: "expense", name: "Transport",     icon: "🚗", color: "#3B82F6", sort_order: 1 },
  { kind: "expense", name: "Entertainment", icon: "🎬", color: "#EC4899", sort_order: 2 },
  { kind: "expense", name: "Bills",         icon: "💡", color: "#EF4444", sort_order: 3 },
  { kind: "expense", name: "Health",        icon: "💊", color: "#10B981", sort_order: 4 },
  { kind: "expense", name: "Shopping",      icon: "🛍️", color: "#A855F7", sort_order: 5 },
  { kind: "expense", name: "Education",     icon: "📚", color: "#06B6D4", sort_order: 6 },
  { kind: "expense", name: "Other",         icon: "🔣", color: "#6B7280", sort_order: 7 },
];

const DEFAULT_INCOME: Array<Omit<FinanceCategory, "id" | "user_id" | "created_at">> = [
  { kind: "income", name: "Salary",     icon: "💼", color: "#10B981", sort_order: 0 },
  { kind: "income", name: "Freelance",  icon: "💻", color: "#3B82F6", sort_order: 1 },
  { kind: "income", name: "Investment", icon: "📈", color: "#F59E0B", sort_order: 2 },
  { kind: "income", name: "Gift",       icon: "🎁", color: "#EC4899", sort_order: 3 },
  { kind: "income", name: "Refund",     icon: "↩️", color: "#06B6D4", sort_order: 4 },
  { kind: "income", name: "Other",      icon: "🔣", color: "#6B7280", sort_order: 5 },
];

export function useFinanceCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    const load = async () => {
      const { data, error } = await (supabase.from("finance_categories") as any)
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });
      if (error) { console.error("Categories load error:", error); setLoading(false); return; }
      if (!data || data.length === 0) {
        // Seed defaults
        const seed = [...DEFAULT_EXPENSE, ...DEFAULT_INCOME].map(c => ({ ...c, user_id: user.id }));
        const { data: inserted, error: insErr } = await (supabase.from("finance_categories") as any)
          .insert(seed)
          .select();
        if (insErr) { console.error("Seed error:", insErr); setLoading(false); return; }
        setCategories(inserted || []);
      } else {
        setCategories(data);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const addCategory = useCallback(async (kind: CategoryKind, name: string, icon: string, color: string) => {
    if (!user) return;
    const sameKind = categories.filter(c => c.kind === kind);
    const sort_order = sameKind.length;
    const { data, error } = await (supabase.from("finance_categories") as any)
      .insert([{ user_id: user.id, kind, name: name.trim(), icon, color, sort_order }])
      .select()
      .single();
    if (error) { toast.error(error.code === "23505" ? "Category name already exists" : "Failed to add"); return; }
    if (data) {
      setCategories(prev => [...prev, data]);
      toast.success("Category added");
    }
  }, [user, categories]);

  const updateCategory = useCallback(async (id: string, patch: Partial<Omit<FinanceCategory, "id" | "user_id" | "created_at">>) => {
    if (!user) return;
    const { error } = await (supabase.from("finance_categories") as any)
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to update"); return; }
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }, [user]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await (supabase.from("finance_categories") as any)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) { toast.error("Failed to delete"); return; }
    setCategories(prev => prev.filter(c => c.id !== id));
    toast.success("Category deleted");
  }, [user]);

  const reorderCategories = useCallback(async (kind: CategoryKind, orderedIds: string[]) => {
    if (!user) return;
    const updates = orderedIds.map((id, idx) => ({ id, sort_order: idx }));
    setCategories(prev => prev.map(c => {
      if (c.kind !== kind) return c;
      const u = updates.find(x => x.id === c.id);
      return u ? { ...c, sort_order: u.sort_order } : c;
    }));
    await Promise.all(updates.map(u =>
      (supabase.from("finance_categories") as any)
        .update({ sort_order: u.sort_order })
        .eq("id", u.id)
        .eq("user_id", user.id)
    ));
  }, [user]);

  const expenseCategories = useMemo(
    () => categories.filter(c => c.kind === "expense").sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter(c => c.kind === "income").sort((a, b) => a.sort_order - b.sort_order),
    [categories]
  );

  const findByName = useCallback((name: string): FinanceCategory | undefined => {
    return categories.find(c => c.name.toLowerCase() === name.toLowerCase());
  }, [categories]);

  return {
    expenseCategories, incomeCategories, loading,
    addCategory, updateCategory, deleteCategory, reorderCategories, findByName,
  };
}
