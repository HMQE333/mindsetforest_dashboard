/**
 * Devices in the computer-time view. A computer's id is a random UUID made
 * when the tracker is first installed, a phone's is "android:<model>:<id>".
 * Names live in tracker_devices: `name` is chosen in the dashboard and wins,
 * `reported_name` is what the device calls itself (the tracker's device name).
 */

export interface DeviceNameRow {
  device_id: string;
  name: string | null;
  reported_name: string | null;
}

export interface DeviceSummary {
  device_id: string;
  sessions: number;
  seconds: number;
  first_at: string;
  last_at: string;
}

export type DeviceNames = Record<string, string>;

export const isPhone = (id: string) => id.startsWith("android:");

/** The name to show per device id: the dashboard's, else the device's own. */
export function deviceNames(rows: DeviceNameRow[]): DeviceNames {
  const out: DeviceNames = {};
  for (const r of rows) {
    const name = (r.name || "").trim() || (r.reported_name || "").trim();
    if (name) out[r.device_id] = name;
  }
  return out;
}

/** "📱 Telefon", "💻 Laptop"; without a name "📱 Pixel 8" (the phone's model) or "💻 a1b2c3d4…". */
export function deviceLabel(id: string, names?: DeviceNames): string {
  const icon = isPhone(id) ? "📱" : "💻";
  const name = names?.[id];
  if (name) return `${icon} ${name}`;
  if (isPhone(id)) return `${icon} ${id.split(":")[1] || "Telefon"}`;
  return `${icon} ${id.length > 10 ? `${id.slice(0, 8)}…` : id}`;
}

/** 345600 s -> "96 h", 5400 -> "1,5 h", 600 -> "10 min". */
export function hoursLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1).replace(".", ",")} h`;
}

/** Devices that can take another one's history: the same kind (computer or phone), not itself. */
export function mergeTargets(id: string, devices: DeviceSummary[]): DeviceSummary[] {
  return devices.filter((d) => d.device_id !== id && isPhone(d.device_id) === isPhone(id));
}

/** A name as typed: trimmed, at most 60 characters, "" clears it. */
export function cleanDeviceName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 60);
}
