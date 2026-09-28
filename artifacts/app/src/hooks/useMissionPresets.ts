import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  DEFAULT_PRESET_EMOJI,
  normalizePresetName,
  parseMissionMap,
  type MissionMap,
  type MissionPreset,
} from "@/lib/mission-presets";
import type { Tables } from "@/integrations/supabase/types";

type Row = Tables<"mission_presets">;

function rowToPreset(r: Row): MissionPreset {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji || DEFAULT_PRESET_EMOJI,
    description: r.description || "",
    missions: parseMissionMap(r.missions),
    sortOrder: r.sort_order,
    lastAppliedAt: r.last_applied_at,
  };
}

const MISSING_TABLE = /PGRST205|42P01/;

/**
 * Named snapshots of the Home mission lists. Page-scoped like the other data
 * hooks; the only writer is this hook, so no cross-hook event is needed.
 */
export function useMissionPresets() {
  const { user } = useAuth();
  const [presets, setPresets] = useState<MissionPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableReady, setTableReady] = useState(true);
  const req = useRef(0);

  const refetch = useCallback(async () => {
    if (!user) { setPresets([]); setLoading(false); return; }
    const id = ++req.current;
    const { data, error } = await supabase
      .from("mission_presets")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (id !== req.current) return;
    if (error) {
      if (MISSING_TABLE.test(`${error.code} ${error.message}`)) setTableReady(false);
      else toast.error("Nie udało się wczytać presetów");
      setLoading(false);
      return;
    }
    setTableReady(true);
    setPresets((data || []).map(rowToPreset));
    setLoading(false);
  }, [user]);

  useEffect(() => { void refetch(); }, [refetch]);

  const createPreset = useCallback(async (input: { name: string; emoji?: string; description?: string; missions: MissionMap }) => {
    if (!user) return null;
    const name = normalizePresetName(input.name);
    if (!name) { toast.error("Podaj nazwę presetu"); return null; }
    const sortOrder = presets.length ? Math.max(...presets.map((p) => p.sortOrder)) + 1 : 0;
    const { data, error } = await supabase
      .from("mission_presets")
      .insert({
        user_id: user.id,
        name,
        emoji: (input.emoji || DEFAULT_PRESET_EMOJI).trim().slice(0, 8) || DEFAULT_PRESET_EMOJI,
        description: (input.description || "").trim().slice(0, 200),
        missions: input.missions as unknown as Row["missions"],
        sort_order: sortOrder,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.code === "23505" ? "Preset o tej nazwie już istnieje" : "Nie udało się zapisać presetu");
      return null;
    }
    const preset = rowToPreset(data);
    setPresets((prev) => [...prev, preset]);
    return preset;
  }, [user, presets]);

  const updatePreset = useCallback(async (id: string, patch: { name?: string; emoji?: string; description?: string; missions?: MissionMap }) => {
    if (!user) return false;
    const update: Partial<Row> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) {
      const name = normalizePresetName(patch.name);
      if (!name) { toast.error("Podaj nazwę presetu"); return false; }
      update.name = name;
    }
    if (patch.emoji !== undefined) update.emoji = patch.emoji.trim().slice(0, 8) || DEFAULT_PRESET_EMOJI;
    if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 200);
    if (patch.missions !== undefined) update.missions = patch.missions as unknown as Row["missions"];
    const { data, error } = await supabase
      .from("mission_presets")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.code === "23505" ? "Preset o tej nazwie już istnieje" : "Nie udało się zapisać zmian");
      return false;
    }
    const preset = rowToPreset(data);
    setPresets((prev) => prev.map((p) => (p.id === id ? preset : p)));
    return true;
  }, [user]);

  const deletePreset = useCallback(async (id: string) => {
    if (!user) return false;
    const { error } = await supabase.from("mission_presets").delete().eq("id", id).eq("user_id", user.id);
    if (error) { toast.error("Nie udało się usunąć presetu"); return false; }
    setPresets((prev) => prev.filter((p) => p.id !== id));
    return true;
  }, [user]);

  const markApplied = useCallback(async (id: string) => {
    if (!user) return;
    const at = new Date().toISOString();
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, lastAppliedAt: at } : p)));
    await supabase.from("mission_presets").update({ last_applied_at: at }).eq("id", id).eq("user_id", user.id);
  }, [user]);

  const movePreset = useCallback(async (id: string, direction: -1 | 1) => {
    if (!user) return;
    const idx = presets.findIndex((p) => p.id === id);
    const target = idx + direction;
    if (idx < 0 || target < 0 || target >= presets.length) return;
    const reordered = [...presets];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const withOrder = reordered.map((p, i) => ({ ...p, sortOrder: i }));
    setPresets(withOrder);
    await Promise.all(withOrder.map((p) => supabase.from("mission_presets").update({ sort_order: p.sortOrder }).eq("id", p.id).eq("user_id", user.id)));
  }, [user, presets]);

  return { presets, loading, tableReady, refetch, createPreset, updatePreset, deletePreset, markApplied, movePreset };
}
