import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface CookingRecipe {
  id: string;
  title: string;
  description: string;
  ingredients: string;
  instructions: string;
  notes: string;
  tags: string[];
  rating: number | null;
  servings: number;
  cookTime: string;
  difficulty: string;
  status: string;
  costPerServing: number | null;
  aiProcessedContent: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CookingPlanEntry {
  id: string;
  recipeId: string | null;
  planDate: string;
  mealType: string;
  customLabel: string;
  notes: string;
  createdAt: string;
}

export interface IngredientCost {
  id: string;
  ingredientName: string;
  costPerUnit: number;
  unit: string;
}

function mapRecipe(r: Record<string, unknown>): CookingRecipe {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    ingredients: r.ingredients as string,
    instructions: r.instructions as string,
    notes: r.notes as string,
    tags: (r.tags as string[]) || [],
    rating: r.rating as number | null,
    servings: (r.servings as number) || 4,
    cookTime: (r.cook_time as string) || "",
    difficulty: (r.difficulty as string) || "medium",
    status: (r.status as string) || "tried",
    costPerServing: r.cost_per_serving as number | null,
    aiProcessedContent: r.ai_processed_content as string | null,
    photoUrl: (r.photo_url as string) || null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapPlanEntry(e: Record<string, unknown>): CookingPlanEntry {
  return {
    id: e.id as string,
    recipeId: e.recipe_id as string | null,
    planDate: e.plan_date as string,
    mealType: (e.meal_type as string) || "dinner",
    customLabel: (e.custom_label as string) || "",
    notes: (e.notes as string) || "",
    createdAt: e.created_at as string,
  };
}

export function useCookingState() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<CookingRecipe[]>([]);
  const [planEntries, setPlanEntries] = useState<CookingPlanEntry[]>([]);
  const [ingredientCosts, setIngredientCosts] = useState<IngredientCost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    const [recipesRes, planRes, costsRes] = await Promise.all([
      (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { order: (c: string, o: object) => Promise<{ data: Record<string, unknown>[] | null }> } } } }).from("cooking_recipes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Record<string, unknown>[] | null }> } } }).from("cooking_plan_entries").select("*").eq("user_id", user.id),
      (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Record<string, unknown>[] | null }> } } }).from("cooking_ingredient_costs").select("*").eq("user_id", user.id),
    ]);
    if (recipesRes.data) setRecipes(recipesRes.data.map(mapRecipe));
    if (planRes.data) setPlanEntries(planRes.data.map(mapPlanEntry));
    if (costsRes.data) setIngredientCosts(costsRes.data.map(r => ({
      id: r.id as string,
      ingredientName: r.ingredient_name as string,
      costPerUnit: r.cost_per_unit as number,
      unit: r.unit as string,
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const saveRecipe = useCallback(async (recipe: Partial<CookingRecipe> & { id?: string }): Promise<CookingRecipe | null> => {
    if (!user) return null;
    const row = {
      user_id: user.id,
      title: recipe.title || "",
      description: recipe.description || "",
      ingredients: recipe.ingredients || "",
      instructions: recipe.instructions || "",
      notes: recipe.notes || "",
      tags: recipe.tags || [],
      rating: recipe.rating ?? null,
      servings: recipe.servings || 4,
      cook_time: recipe.cookTime || "",
      difficulty: recipe.difficulty || "medium",
      status: recipe.status || "tried",
      cost_per_serving: recipe.costPerServing ?? null,
      ai_processed_content: recipe.aiProcessedContent ?? null,
      photo_url: recipe.photoUrl ?? null,
    };

    if (recipe.id) {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { update: (r: object) => { eq: (k: string, v: string) => { eq: (k2: string, v2: string) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } } } } } }).from("cooking_recipes").update(row).eq("id", recipe.id).eq("user_id", user.id).select().single();
      if (error) { toast.error("Failed to save recipe"); return null; }
      const mapped = mapRecipe(data as Record<string, unknown>);
      setRecipes(prev => prev.map(r => r.id === recipe.id ? mapped : r));
      return mapped;
    } else {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { insert: (r: object) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } } } }).from("cooking_recipes").insert(row).select().single();
      if (error) { toast.error("Failed to save recipe"); return null; }
      const mapped = mapRecipe(data as Record<string, unknown>);
      setRecipes(prev => [mapped, ...prev]);
      return mapped;
    }
  }, [user]);

  const deleteRecipe = useCallback(async (id: string) => {
    if (!user) return;
    const { error } = await (supabase as unknown as { from: (t: string) => { delete: () => { eq: (k: string, v: string) => { eq: (k2: string, v2: string) => Promise<{ error: unknown }> } } } }).from("cooking_recipes").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error("Failed to delete recipe"); return; }
    setRecipes(prev => prev.filter(r => r.id !== id));
    toast.success("Recipe deleted");
  }, [user]);

  const savePlanEntry = useCallback(async (entry: Partial<CookingPlanEntry>): Promise<CookingPlanEntry | null> => {
    if (!user) return null;
    const row = {
      user_id: user.id,
      recipe_id: entry.recipeId || null,
      plan_date: entry.planDate || "",
      meal_type: entry.mealType || "dinner",
      custom_label: entry.customLabel || "",
      notes: entry.notes || "",
    };
    if (entry.id) {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { update: (r: object) => { eq: (k: string, v: string) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } } } } }).from("cooking_plan_entries").update(row).eq("id", entry.id).select().single();
      if (error) { toast.error("Failed to save plan entry"); return null; }
      const mapped = mapPlanEntry(data as Record<string, unknown>);
      setPlanEntries(prev => prev.map(e => e.id === entry.id ? mapped : e));
      return mapped;
    } else {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { insert: (r: object) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } } } }).from("cooking_plan_entries").insert(row).select().single();
      if (error) { toast.error("Failed to save plan entry"); return null; }
      const mapped = mapPlanEntry(data as Record<string, unknown>);
      setPlanEntries(prev => [...prev, mapped]);
      return mapped;
    }
  }, [user]);

  const deletePlanEntry = useCallback(async (id: string) => {
    if (!user) return;
    await (supabase as unknown as { from: (t: string) => { delete: () => { eq: (k: string, v: string) => Promise<unknown> } } }).from("cooking_plan_entries").delete().eq("id", id);
    setPlanEntries(prev => prev.filter(e => e.id !== id));
  }, [user]);

  const saveIngredientCost = useCallback(async (cost: Omit<IngredientCost, "id"> & { id?: string }) => {
    if (!user) return;
    const row = {
      user_id: user.id,
      ingredient_name: cost.ingredientName,
      cost_per_unit: cost.costPerUnit,
      unit: cost.unit,
    };
    const { data, error } = await (supabase as unknown as { from: (t: string) => { upsert: (r: object, o: object) => { select: () => { single: () => Promise<{ data: Record<string, unknown> | null; error: unknown }> } } } }).from("cooking_ingredient_costs").upsert(row, { onConflict: "user_id,ingredient_name" }).select().single();
    if (error) { toast.error("Failed to save cost"); return; }
    const mapped = { id: (data as Record<string, unknown>).id as string, ingredientName: (data as Record<string, unknown>).ingredient_name as string, costPerUnit: (data as Record<string, unknown>).cost_per_unit as number, unit: (data as Record<string, unknown>).unit as string };
    setIngredientCosts(prev => {
      const exists = prev.find(c => c.ingredientName.toLowerCase() === cost.ingredientName.toLowerCase());
      if (exists) return prev.map(c => c.ingredientName.toLowerCase() === cost.ingredientName.toLowerCase() ? mapped : c);
      return [...prev, mapped];
    });
  }, [user]);

  const deleteIngredientCost = useCallback(async (id: string) => {
    if (!user) return;
    await (supabase as unknown as { from: (t: string) => { delete: () => { eq: (k: string, v: string) => Promise<unknown> } } }).from("cooking_ingredient_costs").delete().eq("id", id);
    setIngredientCosts(prev => prev.filter(c => c.id !== id));
  }, [user]);

  return {
    recipes, planEntries, ingredientCosts, loading,
    saveRecipe, deleteRecipe,
    savePlanEntry, deletePlanEntry,
    saveIngredientCost, deleteIngredientCost,
    reload: load,
  };
}
