import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { WatchEntry, WatchEntryInput } from "@/lib/watch-data";
import { generateSampleWatchEntries } from "@/lib/watch-data";

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const NUM_COLS = [
  "resting_hr", "hrv_ms", "sleep_score", "sleep_deep_min", "sleep_rem_min",
  "sleep_light_min", "sleep_awake_min", "body_battery", "stress_level", "recovery_time_hrs",
  "vo2max", "run_pace_sec", "run_distance_km", "run_kcal", "run_cadence_spm",
  "run_power_w", "run_avg_hr", "race_5k_sec", "race_10k_sec", "race_half_sec",
  "race_marathon_sec", "fitness_age", "steps", "intensity_minutes",
] as const;

function normalize(row: any): WatchEntry {
  const out: any = { ...row };
  for (const c of NUM_COLS) out[c] = toNum(row[c]);
  out.hrv_status = row.hrv_status ?? null;
  out.source = row.source ?? "manual";
  out.notes = row.notes ?? "";
  return out as WatchEntry;
}

/** PostgREST hides a missing table behind PGRST205 ("could not find the table"). */
function isMissingTable(error: any): boolean {
  return error?.code === "PGRST205" || /find the table/i.test(error?.message ?? "");
}

export function useWatchEntries() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(true);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase.from("watch_entries") as any)
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false });
      if (cancelled) return;
      if (error) {
        if (isMissingTable(error)) {
          setTableReady(false);
        } else {
          console.error("Watch load error:", error);
          toast.error("Couldn't load watch entries");
        }
        setEntries([]);
      } else {
        setTableReady(true);
        setEntries((data ?? []).map(normalize));
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const guardTable = (error: any): boolean => {
    if (isMissingTable(error)) {
      setTableReady(false);
      toast.error("Watch tracking isn't switched on yet. Apply the database update first.");
      return true;
    }
    return false;
  };

  const addEntry = useCallback(
    async (input: WatchEntryInput): Promise<WatchEntry | null> => {
      if (!user) return null;
      // Upsert on (user_id, entry_date) so re-logging a day updates it.
      const { data, error } = await (supabase.from("watch_entries") as any)
        .upsert([{ ...input, user_id: user.id }], { onConflict: "user_id,entry_date" })
        .select()
        .single();
      if (error) {
        if (!guardTable(error)) {
          console.error("Watch insert error:", error);
          toast.error("Failed to save watch entry");
        }
        return null;
      }
      const row = normalize(data);
      setEntries(prev =>
        [row, ...prev.filter(e => e.id !== row.id && e.entry_date !== row.entry_date)].sort((a, b) =>
          b.entry_date.localeCompare(a.entry_date),
        ),
      );
      toast.success("Watch entry saved");
      return row;
    },
    [user],
  );

  const addEntries = useCallback(
    async (inputs: WatchEntryInput[]): Promise<number> => {
      if (!user || inputs.length === 0) return 0;
      const payload = inputs.map(i => ({ ...i, user_id: user.id }));
      const { data, error } = await (supabase.from("watch_entries") as any)
        .upsert(payload, { onConflict: "user_id,entry_date" })
        .select();
      if (error) {
        if (!guardTable(error)) {
          console.error("Watch bulk import error:", error);
          toast.error("Failed to import watch data");
        }
        return 0;
      }
      const rows = (data ?? []).map(normalize) as WatchEntry[];
      setEntries(prev => {
        const byDate = new Map<string, WatchEntry>();
        for (const e of prev) byDate.set(e.entry_date, e);
        for (const r of rows) byDate.set(r.entry_date, r);
        return Array.from(byDate.values()).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
      });
      toast.success(`Imported ${rows.length} day${rows.length === 1 ? "" : "s"} ⌚`);
      return rows.length;
    },
    [user],
  );

  const updateEntry = useCallback(
    async (id: string, updates: Partial<WatchEntryInput>): Promise<boolean> => {
      if (!user) return false;
      const { data, error } = await (supabase.from("watch_entries") as any)
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) {
        if (!guardTable(error)) {
          console.error("Watch update error:", error);
          toast.error("Failed to update watch entry");
        }
        return false;
      }
      const row = normalize(data);
      setEntries(prev =>
        prev.map(e => (e.id === id ? row : e)).sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
      );
      toast.success("Watch entry updated");
      return true;
    },
    [user],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await (supabase.from("watch_entries") as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        if (!guardTable(error)) toast.error("Failed to delete");
        return;
      }
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success("Watch entry deleted");
    },
    [user],
  );

  const seedSampleData = useCallback(async () => {
    if (!user) return;
    // Non-destructive: only fill days that don't already have an entry, so
    // seeding never overwrites real data (and never hits the unique constraint).
    const existing = new Set(entries.map(e => e.entry_date));
    const samples = generateSampleWatchEntries().filter(s => !existing.has(s.entry_date));
    if (samples.length === 0) {
      toast.info("You already have entries across the sample range. Nothing to add");
      return;
    }
    const { data, error } = await (supabase.from("watch_entries") as any)
      .insert(samples.map(s => ({ ...s, user_id: user.id })))
      .select();
    if (error) {
      if (!guardTable(error)) toast.error("Failed to seed samples");
      return;
    }
    const rows = (data ?? []).map(normalize) as WatchEntry[];
    setEntries(prev => {
      const byDate = new Map<string, WatchEntry>();
      for (const e of prev) byDate.set(e.entry_date, e);
      for (const row of rows) byDate.set(row.entry_date, row);
      return Array.from(byDate.values()).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
    });
    toast.success(`Sample watch data added (${rows.length} days). Explore freely ⌚`);
  }, [user, entries]);

  return {
    entries,
    loading,
    tableReady,
    addEntry,
    addEntries,
    updateEntry,
    deleteEntry,
    seedSampleData,
    fetchEntries: () => {
      if (!user) return;
      supabase.from("watch_entries" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) setEntries((data ?? []).map(normalize));
        });
    },
    latest: entries[0] ?? null,
    previous: entries[1] ?? null,
  };
}
