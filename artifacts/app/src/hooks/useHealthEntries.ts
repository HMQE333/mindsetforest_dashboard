import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import type { HealthEntry, HealthEntryInput } from "@/lib/health-data";
import { generateSampleEntries } from "@/lib/health-data";

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(row: any): HealthEntry {
  return {
    ...row,
    weight_kg: toNum(row.weight_kg),
    height_cm: toNum(row.height_cm),
    bp_systolic: toNum(row.bp_systolic),
    bp_diastolic: toNum(row.bp_diastolic),
    resting_hr: toNum(row.resting_hr),
    fasting_glucose_mgdl: toNum(row.fasting_glucose_mgdl),
    hba1c_pct: toNum(row.hba1c_pct),
    ldl_mgdl: toNum(row.ldl_mgdl),
    hdl_mgdl: toNum(row.hdl_mgdl),
    total_chol_mgdl: toNum(row.total_chol_mgdl),
    triglycerides_mgdl: toNum(row.triglycerides_mgdl),
    hemoglobin_gdl: toNum(row.hemoglobin_gdl),
    creatinine_mgdl: toNum(row.creatinine_mgdl),
    egfr: toNum(row.egfr),
    self_rating: Number(row.self_rating ?? 5),
    notes: row.notes ?? "",
  };
}

export function useHealthEntries() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data, error } = await (supabase.from("health_entries") as any)
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false });
      if (error) {
        console.error("Health load error:", error);
        toast.error("Couldn't load health entries");
      }
      if (data) setEntries(data.map(normalize));
      setLoading(false);
    };
    load();
  }, [user]);

  const addEntry = useCallback(
    async (input: HealthEntryInput): Promise<HealthEntry | null> => {
      if (!user) return null;
      const { data, error } = await (supabase.from("health_entries") as any)
        .insert([{ ...input, user_id: user.id }])
        .select()
        .single();
      if (error) {
        console.error("Health insert error:", error);
        toast.error("Failed to save entry");
        return null;
      }
      const row = normalize(data);
      setEntries(prev => [row, ...prev].sort((a, b) => b.entry_date.localeCompare(a.entry_date)));
      toast.success("Health entry saved");
      return row;
    },
    [user],
  );

  const updateEntry = useCallback(
    async (id: string, updates: Partial<HealthEntryInput>): Promise<void> => {
      if (!user) return;
      const { data, error } = await (supabase.from("health_entries") as any)
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) {
        console.error("Health update error:", error);
        toast.error("Failed to update entry");
        return;
      }
      const row = normalize(data);
      setEntries(prev =>
        prev.map(e => (e.id === id ? row : e)).sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
      );
      toast.success("Entry updated");
    },
    [user],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await (supabase.from("health_entries") as any)
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Failed to delete");
        return;
      }
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success("Entry deleted");
    },
    [user],
  );

  const seedSampleData = useCallback(async () => {
    if (!user) return;
    const samples = generateSampleEntries();
    const { data, error } = await (supabase.from("health_entries") as any)
      .insert(samples.map(s => ({ ...s, user_id: user.id })))
      .select();
    if (error) {
      toast.error("Failed to seed samples");
      return;
    }
    if (data) {
      const rows = data.map(normalize).sort((a: HealthEntry, b: HealthEntry) =>
        b.entry_date.localeCompare(a.entry_date),
      );
      setEntries(prev => [...rows, ...prev]);
      toast.success("Sample data added — explore freely 🌱");
    }
  }, [user]);

  /**
   * Upload a lab report file to the private health-labs bucket.
   * Returns the storage path on success, or null on failure.
   */
  const uploadLabReport = useCallback(
    async (file: File): Promise<string | null> => {
      if (!user) return null;
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("health-labs").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) {
        console.error("Lab upload error:", error);
        toast.error("Upload failed");
        return null;
      }
      return path;
    },
    [user],
  );

  /** Get a short-lived signed URL for a stored lab report. */
  const getSignedLabUrl = useCallback(async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from("health-labs").createSignedUrl(path, 60);
    if (error || !data) return null;
    return data.signedUrl;
  }, []);

  return {
    entries,
    loading,
    addEntry,
    updateEntry,
    deleteEntry,
    seedSampleData,
    uploadLabReport,
    getSignedLabUrl,
    latest: entries[0] ?? null,
    previous: entries[1] ?? null,
  };
}