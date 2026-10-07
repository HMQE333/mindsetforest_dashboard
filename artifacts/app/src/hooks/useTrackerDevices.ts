import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { cleanDeviceName, deviceNames, type DeviceNameRow, type DeviceSummary } from "@/lib/tracker-devices";

/**
 * Every device that recorded time (over all time, not just the loaded weeks)
 * with its name, plus renaming, merging two ids of one machine, and removing
 * a device with its history. Loads once `enabled`.
 */
export function useTrackerDevices(enabled: boolean) {
  const { user } = useAuth();
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [rows, setRows] = useState<DeviceNameRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [summary, names] = await Promise.all([
      supabase.rpc("tracker_device_summary"),
      supabase.from("tracker_devices").select("device_id, name, reported_name"),
    ]);
    if (!summary.error) {
      setDevices((summary.data ?? []).map((d) => ({ ...d, sessions: Number(d.sessions), seconds: Number(d.seconds) })));
    }
    if (!names.error) setRows(names.data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const names = useMemo(() => deviceNames(rows), [rows]);

  const rename = useCallback(
    async (deviceId: string, raw: string): Promise<string | null> => {
      if (!user) return "Nie jesteś zalogowany.";
      const name = cleanDeviceName(raw) || null;
      const { error } = await supabase
        .from("tracker_devices")
        .upsert({ user_id: user.id, device_id: deviceId, name, updated_at: new Date().toISOString() }, { onConflict: "user_id,device_id" });
      if (error) return "Nie udało się zapisać nazwy.";
      await refresh();
      return null;
    },
    [user, refresh],
  );

  const merge = useCallback(
    async (fromId: string, intoId: string): Promise<string | null> => {
      const { error } = await supabase.rpc("merge_tracker_devices", { from_device: fromId, into_device: intoId });
      if (error) return "Nie udało się połączyć urządzeń.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const forget = useCallback(
    async (deviceId: string): Promise<string | null> => {
      const { error } = await supabase.rpc("forget_tracker_device", { device: deviceId });
      if (error) return "Nie udało się usunąć urządzenia.";
      await refresh();
      return null;
    },
    [refresh],
  );

  return { devices, names, loading, refresh, rename, merge, forget };
}
