import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

/**
 * The user's personal context, on three shelves ordered by how fast they change.
 *
 * One text box was the wrong shape. "I am a night owl" and "I broke my wrist in
 * March" have half-lives decades apart, and mixing them lets a bad fortnight
 * quietly rewrite a permanent self-description. Separating them also buys the
 * planner a conflict rule for free: when the fast shelf disagrees with the slow
 * one, the fast shelf is right about this week and the slow one is right about
 * the person.
 */
export interface ContextShelves {
  /** Decades. Who the user is. */
  notes: string;
  /** Years. How they think, what has repeatedly worked. */
  lenses: string;
  /** Weeks to months. What is true right now. */
  season: string;
}

const EMPTY: ContextShelves = { notes: "", lenses: "", season: "" };

export function useUserContext() {
  const { user } = useAuth();
  const [shelves, setShelves] = useState<ContextShelves>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await (supabase.from("user_context" as any) as any)
        .select("notes,lenses,season")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setShelves({
          notes: (data.notes as string) || "",
          // Absent until the follow-up migration runs; empty is a fine default.
          lenses: (data.lenses as string) || "",
          season: (data.season as string) || "",
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const save = useCallback(async (next: Partial<ContextShelves>) => {
    if (!user) return;
    setSaving(true);
    const merged = { ...shelves, ...next };
    setShelves(merged);
    const { error } = await (supabase.from("user_context" as any) as any).upsert(
      [{ user_id: user.id, ...merged, updated_at: new Date().toISOString() }],
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error("Could not save your context");
    else toast.success("Context saved");
  }, [user, shelves]);

  return { ...shelves, shelves, loading, saving, save };
}

export type SuggestionScope = "mission" | "path";

export interface LoggedSuggestion {
  scope: SuggestionScope;
  categoryId?: string | null;
  title: string;
  detail?: Record<string, unknown>;
  accepted: boolean;
}

/**
 * Records what the planner offered and what the user did with it. Without this,
 * every generation starts from zero knowledge of the user's taste; with it, the
 * next prompt can say "they rejected this shape of task eight times".
 */
export async function logSuggestions(userId: string, items: LoggedSuggestion[]): Promise<void> {
  if (items.length === 0) return;
  const now = new Date().toISOString();
  const rows = items.map(i => ({
    user_id: userId,
    scope: i.scope,
    category_id: i.categoryId ?? null,
    title: i.title,
    detail: i.detail || {},
    status: i.accepted ? "accepted" : "rejected",
    decided_at: now,
  }));
  // Best-effort: a missing table or a failed insert must never block the user
  // from applying the suggestions they just picked.
  try {
    await (supabase.from("ai_suggestion_log" as any) as any).insert(rows);
  } catch {
    /* ignore */
  }
}

/** The local "now" the server cannot infer. */
export function localMoment(): { date: string; hour: number } {
  const d = new Date();
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    hour: d.getHours(),
  };
}
