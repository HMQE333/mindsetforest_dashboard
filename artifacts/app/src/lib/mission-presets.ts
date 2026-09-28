import { CATEGORIES, type Mission } from "@/lib/dashboard-data";

/**
 * A mission preset is a named snapshot of every mission list on Home
 * ("Monk mode", "High energy day", "Lock in"). Applying one replaces
 * dashboard_state.custom_missions wholesale, so a snapshot must be complete:
 * every pillar gets an explicit list (the defaults are copied in when the user
 * never customised that pillar) and project folders keep whatever they had.
 */
export type MissionMap = Record<string, Mission[]>;

export interface MissionPreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  missions: MissionMap;
  sortOrder: number;
  lastAppliedAt: string | null;
}

export const PRESET_NAME_MAX = 40;
export const DEFAULT_PRESET_EMOJI = "⚡";
/** Fired on window when a preset is changed outside useMissionPresets (e.g. by the assistant). */
export const MISSION_PRESETS_CHANGED_EVENT = "mission-presets-changed";

/** Drop runtime-only fields so a preset never carries `__originalIndex`. */
export function cleanMission(m: Mission): Mission {
  const { __originalIndex: _drop, ...rest } = m as Mission & { __originalIndex?: number };
  return {
    title: String(rest.title ?? "").trim(),
    description: String(rest.description ?? ""),
    duration: String(rest.duration ?? ""),
    xp: Number.isFinite(Number(rest.xp)) ? Math.max(0, Math.round(Number(rest.xp))) : 0,
    ...(rest.persistent !== undefined ? { persistent: rest.persistent } : {}),
    ...(rest.url ? { url: rest.url } : {}),
    ...(rest.variants && rest.variants.length > 0 ? { variants: rest.variants } : {}),
    ...(rest.daysOfWeek && rest.daysOfWeek.length > 0 && rest.daysOfWeek.length < 7 ? { daysOfWeek: rest.daysOfWeek } : {}),
  };
}

/**
 * The complete current mission map: customised pillars as they are, untouched
 * pillars filled with the built-in defaults, project folders as stored.
 */
export function snapshotMissions(custom: MissionMap, pillarIds: string[] = CATEGORIES.map((c) => c.id)): MissionMap {
  const out: MissionMap = {};
  for (const id of pillarIds) {
    const list = custom[id];
    const source = list && list.length > 0 ? list : CATEGORIES.find((c) => c.id === id)?.missions ?? [];
    out[id] = source.map(cleanMission);
  }
  for (const [key, list] of Object.entries(custom)) {
    if (key in out) continue;
    if (Array.isArray(list) && list.length > 0) out[key] = list.map(cleanMission);
  }
  return out;
}

/**
 * What gets written to Home when a preset is applied: every mission becomes
 * persistent so Reset Day keeps the chosen set, and empty lists are dropped so
 * getMissions() falls back to the defaults for pillars the preset left empty.
 */
export function missionsForApply(preset: MissionMap): MissionMap {
  const out: MissionMap = {};
  for (const [key, list] of Object.entries(preset)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    out[key] = list.map((m) => ({ ...cleanMission(m), persistent: true }));
  }
  return out;
}

/** Parse a JSON blob from the database into a MissionMap, ignoring garbage. */
export function parseMissionMap(raw: unknown): MissionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MissionMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const list = value.filter((m): m is Mission => !!m && typeof m === "object" && typeof (m as Mission).title === "string");
    if (list.length > 0) out[key] = list.map(cleanMission);
  }
  return out;
}

export function countMissions(map: MissionMap): number {
  return Object.values(map).reduce((n, list) => n + list.length, 0);
}

export function normalizePresetName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, PRESET_NAME_MAX);
}
