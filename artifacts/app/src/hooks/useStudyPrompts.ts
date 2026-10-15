import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import {
  ARCHIVE_PATTERN,
  EMPTY_STUDY_PROMPTS,
  isChatGptUrl,
  pickArchivePrompt,
  type StudyPromptKind,
  type StudyPrompts,
} from "@/lib/study-prompts";

const COLUMNS = "learning_mode, primer_prompt, chatgpt_project_url";

/** 42703: undefined column, before migration 20261015180000_study_prompts is applied. */
const missingColumns = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || /learning_mode|primer_prompt|chatgpt_project_url/.test(e.message ?? ""));

async function loadStudyPrompts(userId: string): Promise<{ prompts: StudyPrompts; available: boolean }> {
  const { data, error } = await supabase.from("user_context").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (missingColumns(error)) return { prompts: EMPTY_STUDY_PROMPTS, available: false };
  if (error) throw error;
  return {
    prompts: {
      learning_mode: data?.learning_mode ?? "",
      primer_prompt: data?.primer_prompt ?? "",
      chatgpt_project_url: data?.chatgpt_project_url ?? "",
    },
    available: true,
  };
}

/**
 * Settings > AI Context > Nauka: the learning mode, the Primer prompt and the
 * ChatGPT project link (user_context). Kept apart from the context shelves,
 * so a database without these columns still loads and saves the shelves.
 */
export function useStudyPrompts(enabled = true) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["study-prompts", user?.id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => loadStudyPrompts(user!.id),
    enabled: enabled && !!user,
    staleTime: 60_000,
  });

  /** Saves only these three columns; the shelves in the same row stay as they are. */
  const save = useCallback(
    async (next: StudyPrompts): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!user) return { ok: false, error: "Nie jesteś zalogowany." };
      const url = next.chatgpt_project_url.trim();
      if (url && !isChatGptUrl(url)) return { ok: false, error: "Link musi zaczynać się od https://chatgpt.com/" };
      const row = { ...next, chatgpt_project_url: url };
      const { error } = await supabase
        .from("user_context")
        .upsert([{ user_id: user.id, ...row, updated_at: new Date().toISOString() }], { onConflict: "user_id" });
      if (error) {
        return {
          ok: false,
          error: missingColumns(error) ? "Baza nie ma jeszcze tych pól (migracja 20261015180000_study_prompts)." : "Nie udało się zapisać.",
        };
      }
      qc.setQueryData(["study-prompts", user.id], { prompts: row, available: true });
      return { ok: true };
    },
    [user, qc],
  );

  /** The newest Archive note that is this prompt (see matchesArchivePrompt), or null. */
  const findInArchive = useCallback(
    async (kind: StudyPromptKind): Promise<{ content: string; created_at: string } | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("archive_blocks")
        .select("content, created_at")
        .eq("user_id", user.id)
        .ilike("content", ARCHIVE_PATTERN[kind])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return pickArchivePrompt(kind, data ?? []);
    },
    [user],
  );

  return {
    prompts: q.data?.prompts ?? EMPTY_STUDY_PROMPTS,
    /** False until the migration adds the columns. */
    available: q.data?.available ?? true,
    loading: q.isLoading && enabled && !!user,
    error: q.error,
    save,
    findInArchive,
  };
}
