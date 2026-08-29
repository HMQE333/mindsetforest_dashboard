import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

/**
 * The user's personal context: one free-text block describing who they are,
 * what they are working on and what to avoid. It is sent with every AI planning
 * request, and it is the single biggest difference between a planner that
 * guesses and one that knows.
 */
export function useUserContext() {
  const { user } = useAuth();
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await (supabase.from("user_context" as any) as any)
        .select("notes")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.notes) setNotes(data.notes as string);
      setLoading(false);
    })();
  }, [user]);

  const save = useCallback(async (next: string) => {
    if (!user) return;
    setSaving(true);
    setNotes(next);
    const { error } = await (supabase.from("user_context" as any) as any).upsert(
      [{ user_id: user.id, notes: next, updated_at: new Date().toISOString() }],
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) toast.error("Could not save your context");
    else toast.success("Context saved");
  }, [user]);

  return { notes, loading, saving, save };
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
