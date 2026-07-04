import { useRef, useState } from "react";
import { Upload, FileText, X, Watch } from "lucide-react";
import { toast } from "sonner";
import { Decoder, Stream } from "@garmin/fitsdk";

/** Running-performance fields a Garmin export can auto-fill. */
export type RunFields = Partial<{
  run_pace_sec: number;
  run_distance_km: number;
  run_kcal: number;
  run_cadence_spm: number;
  run_power_w: number;
  run_avg_hr: number;
}>;

interface Props {
  onParsed: (fields: RunFields) => void;
}

// ── helpers ────────────────────────────────────────────────
const num = (s?: string | null): number | null => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const avg = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** cadence stored per-leg (RPM ~85) → steps/min (~170). */
const toSpm = (c: number | null): number | null => (c == null ? null : c < 120 ? Math.round(c * 2) : Math.round(c));

const round = (n: number | null, d = 0): number | null =>
  n == null ? null : Number(n.toFixed(d));

function localEls(root: Document | Element, local: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", local));
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function parseTCX(text: string): RunFields {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return {};
  const laps = localEls(doc, "Lap");
  let time = 0;
  let dist = 0;
  let kcal = 0;
  const hr: number[] = [];
  const cad: number[] = [];
  const pw: number[] = [];
  const scope = laps.length ? laps : [doc.documentElement];
  for (const lap of scope) {
    time += num(localEls(lap, "TotalTimeSeconds")[0]?.textContent) ?? 0;
    dist += num(localEls(lap, "DistanceMeters")[0]?.textContent) ?? 0;
    kcal += num(localEls(lap, "Calories")[0]?.textContent) ?? 0;
    const lapHr = num(localEls(lap, "AverageHeartRateBpm")[0]?.getElementsByTagNameNS("*", "Value")[0]?.textContent);
    if (lapHr) hr.push(lapHr);
    const lapCad = num(localEls(lap, "AvgRunCadence")[0]?.textContent);
    if (lapCad) cad.push(lapCad);
    const lapPw = num(localEls(lap, "AvgWatts")[0]?.textContent);
    if (lapPw) pw.push(lapPw);
  }
  const distKm = dist / 1000;
  const out: RunFields = {};
  if (distKm > 0) out.run_distance_km = round(distKm, 2)!;
  if (time > 0 && distKm > 0) out.run_pace_sec = Math.round(time / distKm);
  if (kcal > 0) out.run_kcal = Math.round(kcal);
  const h = avg(hr);
  if (h) out.run_avg_hr = Math.round(h);
  const cd = toSpm(avg(cad));
  if (cd) out.run_cadence_spm = cd;
  const p = avg(pw);
  if (p) out.run_power_w = Math.round(p);
  return out;
}

function parseGPX(text: string): RunFields {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) return {};
  const pts = localEls(doc, "trkpt");
  if (pts.length < 2) return {};
  let dist = 0;
  let t0: number | null = null;
  let t1: number | null = null;
  const hr: number[] = [];
  const cad: number[] = [];
  const pw: number[] = [];
  let prev: { lat: number; lon: number } | null = null;
  for (const pt of pts) {
    const lat = parseFloat(pt.getAttribute("lat") || "");
    const lon = parseFloat(pt.getAttribute("lon") || "");
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (prev) dist += haversine(prev.lat, prev.lon, lat, lon);
      prev = { lat, lon };
    }
    const ts = localEls(pt, "time")[0]?.textContent;
    if (ts) {
      const ms = Date.parse(ts);
      if (Number.isFinite(ms)) {
        if (t0 == null) t0 = ms;
        t1 = ms;
      }
    }
    const h = num(localEls(pt, "hr")[0]?.textContent);
    if (h) hr.push(h);
    const c = num(localEls(pt, "cad")[0]?.textContent);
    if (c) cad.push(c);
    const p = num(localEls(pt, "power")[0]?.textContent);
    if (p) pw.push(p);
  }
  const distKm = dist / 1000;
  const time = t0 != null && t1 != null ? (t1 - t0) / 1000 : 0;
  const out: RunFields = {};
  if (distKm > 0) out.run_distance_km = round(distKm, 2)!;
  if (time > 0 && distKm > 0) out.run_pace_sec = Math.round(time / distKm);
  const ah = avg(hr);
  if (ah) out.run_avg_hr = Math.round(ah);
  const cd = toSpm(avg(cad));
  if (cd) out.run_cadence_spm = cd;
  const ap = avg(pw);
  if (ap) out.run_power_w = Math.round(ap);
  return out;
}

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

function hmsToSec(raw: string): number | null {
  const t = raw.trim();
  if (!t || !t.includes(":")) return num(t);
  const parts = t.split(":").map(Number);
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((a, n) => a * 60 + n, 0);
}

function parseCSV(text: string): RunFields {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return {};
  const header = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const find = (...keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)));
  const idx = {
    dist: find("distance"),
    kcal: find("calorie"),
    time: find("time"),
    hr: find("avg hr", "average hr", "avg heart"),
    cad: find("avg run cadence", "avg cadence", "cadence"),
    pw: find("avg power", "power"),
    pace: find("avg pace", "pace"),
  };
  // Prefer a "Summary"/"Totals" row if present (Garmin split exports).
  const rows = lines.slice(1).map(splitCsvLine);
  const summary = rows.find(r => /summary|total/i.test(r[0] ?? ""));
  const row = summary ?? rows[0];
  const get = (i: number) => (i >= 0 && i < row.length ? row[i] : null);

  const out: RunFields = {};
  const distKm = num(get(idx.dist));
  if (distKm && distKm > 0) out.run_distance_km = round(distKm, 2)!;
  const kcal = num(get(idx.kcal));
  if (kcal && kcal > 0) out.run_kcal = Math.round(kcal);
  const hr = num(get(idx.hr));
  if (hr) out.run_avg_hr = Math.round(hr);
  const cad = toSpm(num(get(idx.cad)));
  if (cad) out.run_cadence_spm = cad;
  const pw = num(get(idx.pw));
  if (pw) out.run_power_w = Math.round(pw);
  const paceStr = get(idx.pace);
  const paceSec = paceStr ? hmsToSec(paceStr) : null;
  if (paceSec) out.run_pace_sec = Math.round(paceSec);
  else {
    const timeSec = idx.time >= 0 ? hmsToSec(get(idx.time) ?? "") : null;
    if (timeSec && out.run_distance_km) out.run_pace_sec = Math.round(timeSec / out.run_distance_km);
  }
  return out;
}

/** Decode Garmin's native binary .FIT export (Forerunner etc.) via the official FIT SDK. */
function parseFIT(buf: ArrayBuffer): RunFields {
  const stream = Stream.fromArrayBuffer(buf);
  if (!Decoder.isFIT(stream)) return {};
  const { messages } = new Decoder(stream).read();

  const sessions = (messages.sessionMesgs ?? []) as any[];
  // Prefer a running session, else the one that covered the most distance.
  const session =
    sessions.find(s => typeof s.sport === "string" && s.sport.toLowerCase().includes("running")) ??
    sessions.slice().sort((a, b) => (b.totalDistance ?? 0) - (a.totalDistance ?? 0))[0];

  const out: RunFields = {};

  if (session) {
    const distM = num(session.totalDistance);
    const distKm = distM != null ? distM / 1000 : null;
    if (distKm && distKm > 0) out.run_distance_km = round(distKm, 2)!;

    // Pace: prefer avgSpeed (m/s → sec/km); fall back to timer time / distance.
    const speed = num(session.avgSpeed);
    if (speed && speed > 0) out.run_pace_sec = Math.round(1000 / speed);
    else {
      const time = num(session.totalTimerTime) ?? num(session.totalElapsedTime);
      if (time && time > 0 && distKm && distKm > 0) out.run_pace_sec = Math.round(time / distKm);
    }

    const kcal = num(session.totalCalories);
    if (kcal && kcal > 0) out.run_kcal = Math.round(kcal);
    const hr = num(session.avgHeartRate);
    if (hr && hr > 0) out.run_avg_hr = Math.round(hr);
    const cad = toSpm(num(session.avgRunningCadence) ?? num(session.avgCadence));
    if (cad) out.run_cadence_spm = cad;
    const pw = num(session.avgPower);
    if (pw && pw > 0) out.run_power_w = Math.round(pw);
  }

  // Fallback: aggregate the per-second record messages when no session summary
  // provided a given field (older/partial FIT files).
  const records = (messages.recordMesgs ?? []) as any[];
  if (records.length) {
    if (out.run_distance_km == null) {
      const last = num(records[records.length - 1]?.distance);
      if (last && last > 0) out.run_distance_km = round(last / 1000, 2)!;
    }
    if (out.run_avg_hr == null) {
      const h = avg(records.map(r => num(r.heartRate)).filter((n): n is number => n != null && n > 0));
      if (h) out.run_avg_hr = Math.round(h);
    }
    if (out.run_cadence_spm == null) {
      const c = toSpm(avg(records.map(r => num(r.cadence)).filter((n): n is number => n != null && n > 0)));
      if (c) out.run_cadence_spm = c;
    }
    if (out.run_power_w == null) {
      const p = avg(records.map(r => num(r.power)).filter((n): n is number => n != null && n > 0));
      if (p) out.run_power_w = Math.round(p);
    }
  }

  return out;
}

export default function GarminDropzone({ onParsed }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = async (f: File) => {
    setFile(f);
    const name = f.name.toLowerCase();
    let fields: RunFields = {};
    try {
      if (name.endsWith(".fit")) {
        fields = parseFIT(await f.arrayBuffer());
      } else {
        const text = await f.text();
        if (name.endsWith(".tcx")) fields = parseTCX(text);
        else if (name.endsWith(".gpx")) fields = parseGPX(text);
        else if (name.endsWith(".csv")) fields = parseCSV(text);
        else fields = text.includes("<TrainingCenterDatabase") ? parseTCX(text) : text.includes("<gpx") ? parseGPX(text) : parseCSV(text);
      }
    } catch (e) {
      console.error("Garmin parse error:", e);
    }
    const count = Object.values(fields).filter(v => v != null).length;
    if (count === 0) {
      toast.warning(
        name.endsWith(".fit")
          ? "Couldn't read that .FIT file — try exporting the run as TCX/GPX, or enter the numbers below."
          : "Couldn't read run data from that file — enter the numbers manually below.",
      );
      return;
    }
    onParsed(fields);
    toast.success(`Filled ${count} field${count === 1 ? "" : "s"} from your run ⌚`);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) process(f);
  };

  return (
    <div
      onDragOver={e => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
        dragOver ? "border-primary/60 bg-primary/5" : file ? "border-primary/30 bg-muted/20" : "border-border bg-muted/10 hover:border-primary/40"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".fit,.tcx,.gpx,.csv"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) process(f);
        }}
      />
      {file ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-primary" />
          <span className="font-semibold text-foreground truncate max-w-[220px]">{file.name}</span>
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setFile(null);
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove file"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
          <Watch className="w-5 h-5" />
          <div className="text-xs">
            <span className="font-semibold text-foreground">Drop a Garmin Connect export</span> or click to browse
          </div>
          <div className="text-[10px] opacity-70 inline-flex items-center gap-1">
            <Upload className="w-3 h-3" /> .TCX · .GPX · .CSV · .FIT — auto-fills the run below
          </div>
        </div>
      )}
    </div>
  );
}
