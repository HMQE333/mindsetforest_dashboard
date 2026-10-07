import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { asSegments, indexVault, type RecordingRow, type Segment, type VaultFile } from "@/lib/kos-vault";

const PAGE = 1000;

async function loadVaultFiles(): Promise<VaultFile[]> {
  const out: VaultFile[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("kos_vault_files")
      .select("path, vault, content, modified_at")
      .order("path")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** The vault's Knowledge/ and Sessions/ notes as the tracker mirrors them, parsed. Loads once `enabled`. */
export function useKosVault(enabled: boolean) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["kos", "vault", user?.id],
    queryFn: loadVaultFiles,
    enabled: enabled && !!user,
    staleTime: 60_000,
  });
  const index = useMemo(() => (q.data ? indexVault(q.data) : null), [q.data]);
  return { index, loading: q.isLoading && enabled, error: q.error, refetch: q.refetch, fetching: q.isFetching };
}

/** Every recording's details, newest first, without the transcripts (those load one at a time). */
export function useKosRecordings(enabled: boolean) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["kos", "recordings", user?.id],
    queryFn: async (): Promise<RecordingRow[]> => {
      const { data, error } = await supabase
        .from("kos_recordings")
        .select("id, file_name, note_name, recorded_at, duration_seconds, session_key, part, language, model")
        .order("recorded_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, duration_seconds: Number(r.duration_seconds) }));
    },
    enabled: enabled && !!user,
    staleTime: 60_000,
  });
  return { rows: q.data ?? [], loading: q.isLoading && enabled, error: q.error, refetch: q.refetch };
}

/** One recording's transcript; it never changes, so it is fetched once. */
export function useRecordingSegments(id: string | null) {
  const q = useQuery({
    queryKey: ["kos", "segments", id],
    queryFn: async (): Promise<Segment[]> => {
      const { data, error } = await supabase.from("kos_recordings").select("segments").eq("id", id!).single();
      if (error) throw error;
      return asSegments(data?.segments);
    },
    enabled: !!id,
    staleTime: Infinity,
  });
  return { segments: q.data ?? null, loading: q.isLoading && !!id, error: q.error };
}

/** Recordings whose transcript contains the words, with their segments (to show where). */
export function useTranscriptSearch(term: string) {
  const { user } = useAuth();
  const t = term.trim();
  const q = useQuery({
    queryKey: ["kos", "search", user?.id, t.toLowerCase()],
    queryFn: async () => {
      const pattern = `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await supabase
        .from("kos_recordings")
        .select("id, segments")
        .ilike("raw_text", pattern)
        .order("recorded_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, segments: asSegments(r.segments) }));
    },
    enabled: !!user && t.length >= 3,
    staleTime: 60_000,
  });
  return { results: t.length >= 3 ? q.data ?? null : null, loading: q.isFetching };
}
