// Weekly bulk import — turn a multi-day CSV (one row per day) into WatchEntryInputs.
// Handles a filled-in template *or* a Garmin Connect date-range/report CSV export,
// with flexible column-name matching so header wording doesn't have to be exact.

import { parsePace, parseDuration, HRV_STATUS_OPTIONS, type WatchEntryInput } from "./watch-data";

// ── value helpers ──────────────────────────────────────────
const pad = (n: number | string) => String(n).padStart(2, "0");

const num = (s?: string | null): number | null => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** cadence stored per-leg (RPM ~85) → steps/min (~170). */
const toSpm = (c: number | null): number | null => (c == null ? null : c < 120 ? Math.round(c * 2) : Math.round(c));

const round = (n: number | null, d = 0): number | null => (n == null ? null : Number(n.toFixed(d)));

function normStatus(raw?: string | null): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase().trim();
  return HRV_STATUS_OPTIONS.find(s => t.includes(s)) ?? null;
}

/** Accepts ISO (YYYY-MM-DD / YYYY/MM/DD), US M/D/YYYY, or a parseable date string → "YYYY-MM-DD". */
export function parseCsvDate(raw?: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const mo = +m[2];
    const da = +m[3];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${m[1]}-${pad(mo)}-${pad(da)}`;
  }
  m = t.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})/);
  if (m) {
    const mo = +m[1];
    const da = +m[2];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${m[3]}-${pad(mo)}-${pad(da)}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    // Use the *local* calendar date — toISOString() converts to UTC and can shift the day.
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

// ── CSV parsing (quoted-field aware) ───────────────────────
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// ── column definitions (matching + template) ───────────────
type ColKind = "date" | "number" | "cadence" | "distance" | "vo2" | "pace" | "duration" | "status" | "text";

interface WatchCsvColumn {
  key: keyof WatchEntryInput;
  label: string; // template header + display
  aliases: string[]; // lowercased substrings that identify this column
  not?: string[]; // disqualifying substrings
  kind: ColKind;
  example: string; // sample value for the template
}

// Order matters: specific columns are matched before generic ones and each
// incoming header is consumed once, so e.g. "Avg HR" maps to the run field and
// "Resting HR" to resting_hr without collision.
export const WATCH_CSV_COLUMNS: WatchCsvColumn[] = [
  { key: "entry_date", label: "Date", aliases: ["date"], kind: "date", example: "" },
  { key: "resting_hr", label: "Resting HR", aliases: ["resting hr", "rhr", "resting heart"], kind: "number", example: "56" },
  { key: "hrv_status", label: "HRV Status", aliases: ["hrv status", "hrv state"], kind: "status", example: "balanced" },
  { key: "hrv_ms", label: "HRV (ms)", aliases: ["hrv"], not: ["status", "state"], kind: "number", example: "62" },
  { key: "sleep_score", label: "Sleep Score", aliases: ["sleep score", "sleep"], not: ["deep", "rem", "light", "awake"], kind: "number", example: "82" },
  { key: "sleep_deep_min", label: "Deep Sleep (min)", aliases: ["deep"], kind: "number", example: "74" },
  { key: "sleep_rem_min", label: "REM Sleep (min)", aliases: ["rem"], kind: "number", example: "96" },
  { key: "sleep_light_min", label: "Light Sleep (min)", aliases: ["light"], kind: "number", example: "210" },
  { key: "sleep_awake_min", label: "Awake (min)", aliases: ["awake"], kind: "number", example: "18" },
  { key: "body_battery", label: "Body Battery", aliases: ["body battery", "battery"], kind: "number", example: "88" },
  { key: "stress_level", label: "Stress", aliases: ["stress"], kind: "number", example: "28" },
  { key: "recovery_time_hrs", label: "Recovery Time (hrs)", aliases: ["recovery"], kind: "number", example: "8" },
  { key: "vo2max", label: "VO2 Max", aliases: ["vo2", "vo₂"], kind: "vo2", example: "49" },
  { key: "run_pace_sec", label: "Run Pace (/km)", aliases: ["pace"], kind: "pace", example: "5:18" },
  { key: "run_distance_km", label: "Run Distance (km)", aliases: ["distance"], kind: "distance", example: "8.2" },
  { key: "run_avg_hr", label: "Run Avg HR", aliases: ["avg hr", "average hr", "avg heart"], not: ["resting"], kind: "number", example: "148" },
  { key: "run_cadence_spm", label: "Run Cadence (spm)", aliases: ["cadence"], kind: "cadence", example: "176" },
  { key: "run_power_w", label: "Run Power (W)", aliases: ["power"], kind: "number", example: "268" },
  { key: "run_kcal", label: "Run Energy (kcal)", aliases: ["calorie", "kcal", "energy"], kind: "number", example: "560" },
  { key: "race_5k_sec", label: "Race 5K", aliases: ["5k"], kind: "duration", example: "22:30" },
  { key: "race_10k_sec", label: "Race 10K", aliases: ["10k"], kind: "duration", example: "47:00" },
  { key: "race_half_sec", label: "Race Half", aliases: ["half"], kind: "duration", example: "1:45:00" },
  { key: "race_marathon_sec", label: "Race Marathon", aliases: ["marathon"], kind: "duration", example: "3:45:00" },
  { key: "fitness_age", label: "Fitness Age", aliases: ["fitness age"], kind: "number", example: "32" },
  { key: "steps", label: "Steps", aliases: ["steps"], kind: "number", example: "11200" },
  { key: "intensity_minutes", label: "Intensity Minutes", aliases: ["intensity"], kind: "number", example: "165" },
  { key: "notes", label: "Notes", aliases: ["note"], kind: "text", example: "easy Z2 run" },
];

function parseValue(kind: ColKind, raw: string): number | string | null {
  if (raw == null || raw.trim() === "") return null;
  switch (kind) {
    case "date":
      return parseCsvDate(raw);
    case "status":
      return normStatus(raw);
    case "text":
      return raw.trim();
    case "pace":
      return round(parsePace(raw));
    case "duration":
      return round(parseDuration(raw));
    case "cadence":
      return toSpm(num(raw));
    case "distance":
      return round(num(raw), 2);
    case "vo2":
      return round(num(raw), 1);
    case "number":
    default:
      return round(num(raw));
  }
}

// ── public API ─────────────────────────────────────────────
/** A complete, all-null WatchEntryInput for a given day (source = "file"). */
export function emptyWatchInput(entry_date: string): WatchEntryInput {
  return {
    entry_date,
    source: "file",
    resting_hr: null, hrv_ms: null, hrv_status: null,
    sleep_score: null, sleep_deep_min: null, sleep_rem_min: null, sleep_light_min: null, sleep_awake_min: null,
    body_battery: null, stress_level: null, recovery_time_hrs: null,
    vo2max: null, run_pace_sec: null, run_distance_km: null, run_kcal: null,
    run_cadence_spm: null, run_power_w: null, run_avg_hr: null,
    race_5k_sec: null, race_10k_sec: null, race_half_sec: null, race_marathon_sec: null, fitness_age: null,
    steps: null, intensity_minutes: null, notes: "",
  };
}

/** How many meaningful metric fields a parsed day carries (excludes date/source/notes). */
function countFilled(input: WatchEntryInput): number {
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (k === "entry_date" || k === "source" || k === "notes") continue;
    if (v != null && v !== "") n++;
  }
  return n;
}

export interface ParsedWatchDay {
  input: WatchEntryInput;
  filled: number;
}

export interface WatchImportResult {
  days: ParsedWatchDay[];
  mappedColumns: string[]; // labels recognised in the file
  ignoredColumns: string[]; // headers we couldn't map
  skippedRows: number; // rows dropped for missing/invalid date
  error?: string;
}

export function parseWatchCsv(text: string): WatchImportResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) {
    return { days: [], mappedColumns: [], ignoredColumns: [], skippedRows: 0, error: "The file has no data rows." };
  }
  const header = splitCsvLine(lines[0]);
  const headerLc = header.map(h => h.toLowerCase());

  const used = new Set<number>();
  const colByKey = new Map<keyof WatchEntryInput, { index: number; kind: ColKind }>();
  const mappedColumns: string[] = [];

  for (const col of WATCH_CSV_COLUMNS) {
    let idx = -1;
    for (let i = 0; i < headerLc.length; i++) {
      if (used.has(i)) continue;
      const h = headerLc[i];
      if (col.aliases.some(a => h.includes(a)) && !(col.not?.some(n => h.includes(n)))) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      used.add(idx);
      colByKey.set(col.key, { index: idx, kind: col.kind });
      mappedColumns.push(col.label);
    }
  }

  const ignoredColumns = header.filter((_, i) => !used.has(i));

  const dateCol = colByKey.get("entry_date");
  if (!dateCol) {
    return { days: [], mappedColumns, ignoredColumns, skippedRows: 0, error: "No Date column found — a Date column is required." };
  }

  const days: ParsedWatchDay[] = [];
  const seen = new Map<string, number>(); // entry_date → index in days (last row wins)
  let skippedRows = 0;

  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const rawDate = cells[dateCol.index] ?? "";
    const date = parseCsvDate(rawDate);
    if (!date) {
      skippedRows++;
      continue;
    }
    const input = emptyWatchInput(date);
    for (const [key, { index, kind }] of colByKey) {
      if (key === "entry_date") continue;
      const parsed = parseValue(kind, cells[index] ?? "");
      if (parsed != null && parsed !== "") (input as any)[key] = parsed;
    }
    const day: ParsedWatchDay = { input, filled: countFilled(input) };
    if (seen.has(date)) days[seen.get(date)!] = day;
    else {
      seen.set(date, days.length);
      days.push(day);
    }
  }

  days.sort((a, b) => b.input.entry_date.localeCompare(a.input.entry_date));
  return { days, mappedColumns, ignoredColumns, skippedRows };
}

/** A ready-to-fill CSV template (header + two example rows for recent dates). */
export function buildWatchCsvTemplate(): string {
  const header = WATCH_CSV_COLUMNS.map(c => c.label).join(",");
  const isoDaysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split("T")[0];
  };
  const rowFor = (date: string) =>
    WATCH_CSV_COLUMNS.map(c => (c.key === "entry_date" ? date : c.example)).join(",");
  return [header, rowFor(isoDaysAgo(1)), rowFor(isoDaysAgo(0))].join("\n") + "\n";
}
