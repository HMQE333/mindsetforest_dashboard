// Forerunner 165 daily watch metrics — model, readiness scoring, and the
// field-guide voice (each number is a *signal*, mint = healthy direction,
// amber = act on it). See attached_assets/forerunner-165-field-guide.
//
// The 165 does NOT produce Training Load / Training Status / Training Readiness.
// Body Battery + Recovery Time do that job here — do not invent those fields.

export type WatchCluster = "A" | "B" | "C";

export type SignalTone = "good" | "watch" | "info";

/** Field-guide signal colours (mint = healthy direction, amber = act on it). */
export const SIGNAL = {
  good: "hsl(168, 66%, 52%)", // mint
  watch: "hsl(38, 92%, 60%)", // amber
  info: "hsl(203, 55%, 66%)", // cool slate
  rest: "hsl(0, 72%, 62%)", // deep — recover
} as const;

export const CLUSTER_META: Record<WatchCluster, { num: string; title: string; sub: string }> = {
  A: {
    num: "A",
    title: "Recovery & readiness",
    sub: "The “should I go hard today?” cluster — read before you pick the workout.",
  },
  B: {
    num: "B",
    title: "Fitness & output",
    sub: "The “am I actually getting better?” cluster — slow trend lines, judged over weeks.",
  },
  C: {
    num: "C",
    title: "Everyday movement",
    sub: "The base layer under everything above — cheap, and easy to neglect.",
  },
};

export interface WatchMetricDef {
  id: string; // primary column / logical id
  label: string;
  cluster: WatchCluster;
  unit: string;
  tag: string; // e.g. "Overnight · bpm"
  icon: string; // emoji
  color: string; // accent hsl
  whatIs: string;
  good: { arrow: string; small: string; text: string };
  watch: { arrow: string; small: string; text: string };
  soIDo: string;
  payoff: string;
  betterDirection: "lower" | "higher" | "neutral";
}

export const WATCH_METRICS: WatchMetricDef[] = [
  // ── A · Recovery & readiness ─────────────────────────────
  {
    id: "resting_hr",
    label: "Resting Heart Rate",
    cluster: "A",
    unit: "bpm",
    tag: "Overnight · bpm",
    icon: "💓",
    color: "hsl(330, 80%, 62%)",
    whatIs: "Your heart's beats per minute at complete rest, measured while you sleep — a simple window into fitness and recovery.",
    good: { arrow: "↓", small: "Trends down", text: "Drifting 58 → 52 over weeks: a stronger, fitter, well-recovered heart." },
    watch: { arrow: "↑", small: "Spikes up", text: "5–10 bpm over your normal one morning: poor sleep, alcohol, stress — or a bug moving in." },
    soIDo: "On a spiked morning, downgrade the hard session to an easy jog or rest. Water, food, early night.",
    payoff: "You catch fatigue and illness a day or two before you feel them.",
    betterDirection: "lower",
  },
  {
    id: "hrv_ms",
    label: "HRV Status",
    cluster: "A",
    unit: "ms",
    tag: "Baseline · ms",
    icon: "〰️",
    color: "hsl(168, 66%, 52%)",
    whatIs: "Timing differences between heartbeats overnight vs your own baseline — how recovered your nervous system is. Needs ~3 weeks to calibrate; it's a trend.",
    good: { arrow: "↑", small: "Balanced", text: "Sitting in your normal range: the body is coping well. Green light for a hard effort." },
    watch: { arrow: "↓", small: "Unbalanced / Low", text: "Below your range: accumulated fatigue, stress, under-sleep, or illness incoming." },
    soIDo: "Save hard sessions for Balanced days; keep it easy or rest when it reads Low. Don't fight a Low reading.",
    payoff: "You train hard exactly when your body can absorb it — steadier progress, fewer burnout weeks.",
    betterDirection: "higher",
  },
  {
    id: "sleep_score",
    label: "Sleep Score",
    cluster: "A",
    unit: "/100",
    tag: "Nightly · 0–100",
    icon: "😴",
    color: "hsl(255, 70%, 68%)",
    whatIs: "How long and how well you slept. Deep sleep repairs the body; REM restores the brain. Everything else here depends on it.",
    good: { arrow: "↑", small: "Rises", text: "7–9 h with solid deep sleep: the recovery engine runs and every downstream number improves." },
    watch: { arrow: "↓", small: "Drops", text: "Short nights or thin deep sleep: muscles and mind under-repaired — tomorrow's HRV, RHR and pace all suffer." },
    soIDo: "Treat a low score as a signal to protect tonight: same bedtime, no late screens/caffeine/alcohol, cool dark room.",
    payoff: "The cheapest performance drug you own. Fix it and HRV, energy, focus and pace all rise — for free.",
    betterDirection: "higher",
  },
  {
    id: "body_battery",
    label: "Body Battery",
    cluster: "A",
    unit: "/100",
    tag: "Live · 5–100",
    icon: "🔋",
    color: "hsl(142, 60%, 55%)",
    whatIs: "An “energy in the tank” gauge from HRV, stress, sleep and activity. Charges when you rest, drains when you exert — your everyday readiness dial.",
    good: { arrow: "↑", small: "Wakes high", text: "85–100 in the morning: fully charged — spend it on your hardest workout or biggest work block." },
    watch: { arrow: "↓", small: "Bottoms early", text: "Flat by mid-afternoon day after day: chronic under-recovery, not just one tired afternoon." },
    soIDo: "Put demanding tasks where the battery actually is (usually morning). Draining fast daily? A walk, breathing, an earlier night.",
    payoff: "You stop fighting your own physiology and schedule effort where the energy already exists.",
    betterDirection: "higher",
  },
  {
    id: "stress_level",
    label: "Stress Level",
    cluster: "A",
    unit: "/100",
    tag: "Live · 0–100",
    icon: "🌡️",
    color: "hsl(24, 90%, 60%)",
    whatIs: "Daytime “fight-or-flight” load read from your HRV — and not only workouts. Emails, deadlines, caffeine and bad sleep all push it up.",
    good: { arrow: "↓", small: "Dips through day", text: "Regular low-stress rest windows: a healthy, well-balanced nervous system." },
    watch: { arrow: "↑", small: "Pinned high", text: "Long stretches high with no dips: your day has no recovery windows built into it." },
    soIDo: "On a long high stretch, insert 5 min of slow breathing, a short walk, or step off the screen.",
    payoff: "Makes invisible burnout visible before it wrecks your sleep and training.",
    betterDirection: "lower",
  },
  {
    id: "recovery_time_hrs",
    label: "Recovery Time",
    cluster: "A",
    unit: "hrs",
    tag: "Post-run · hrs",
    icon: "⏳",
    color: "hsl(203, 55%, 66%)",
    whatIs: "A countdown to when you're ready for another hard effort. On the 165 this pairs with Body Battery as your recovery read — there's no Training Load here.",
    good: { arrow: "↓", small: "Reads short", text: "Near zero: you're fresh and cleared to load up again." },
    watch: { arrow: "↑", small: "Reads long", text: "36–48 h+ after a session: that workout hit hard and the adaptation needs real time." },
    soIDo: "Don't stack another hard session inside the window — fill it with easy running, mobility or rest.",
    payoff: "You actually get fitter — adaptation happens during recovery, not during the workout.",
    betterDirection: "lower",
  },
  // ── B · Fitness & output ─────────────────────────────────
  {
    id: "vo2max",
    label: "VO₂ Max",
    cluster: "B",
    unit: "ml/kg/min",
    tag: "Trend · ml/kg/min",
    icon: "🫁",
    color: "hsl(168, 66%, 52%)",
    whatIs: "An estimate of your aerobic engine — how well your body pulls in and uses oxygen. Higher is fitter. Moves slowly; judge it monthly.",
    good: { arrow: "↑", small: "Climbs", text: "Ticks up over weeks: the training is working and your aerobic base is genuinely growing." },
    watch: { arrow: "↓", small: "Slides", text: "Drifts down: usually under-recovery, too much intensity, illness or heat — not lost fitness overnight." },
    soIDo: "Keep ~80% of runs genuinely easy (talk-in-full-sentences pace) and add just one hard session a week.",
    payoff: "Race times fall, everyday effort feels easier, and your resting HR quietly drops with it.",
    betterDirection: "higher",
  },
  {
    id: "run_pace_sec",
    label: "Running Performance",
    cluster: "B",
    unit: "/km",
    tag: "Per run · pace · dist · kcal",
    icon: "🏃",
    color: "hsl(210, 90%, 62%)",
    whatIs: "The raw output of each run — plus wrist Running Power and cadence on the 165. Read pace against effort, not on its own.",
    good: { arrow: "↑", small: "Pace @ lower HR", text: "Same pace at a lower heart rate than a month ago: the clearest sign fitness is rising." },
    watch: { arrow: "↓", small: "Slips / cadence drops", text: "Pace fading at the same effort, or cadence falling as you tire: fatigue or form breaking down." },
    soIDo: "Track pace-at-heart-rate, aim cadence ~170–180, and pace by effort — let the numbers confirm it after.",
    payoff: "Smarter pacing → faster races and fewer injuries, because you stop redlining easy days.",
    betterDirection: "neutral",
  },
  {
    id: "race_5k_sec",
    label: "Race Predictor & Fitness Age",
    cluster: "B",
    unit: "",
    tag: "Trend · time · yrs",
    icon: "🏅",
    color: "hsl(45, 95%, 60%)",
    whatIs: "Predicted 5K–marathon times from your data, plus a “fitness age” set against your real age. Equal parts reality-check and motivation.",
    good: { arrow: "↓", small: "Times / age fall", text: "Predicted times quicker and fitness age dropping: the trend line points the right way." },
    watch: { arrow: "↑", small: "Stalls / creeps up", text: "Predictions flat or fitness age creeping: a nudge to check consistency, sleep and load." },
    soIDo: "Set goal-race paces off the predictor, not ego. Use fitness age as a long-term north star.",
    payoff: "Realistic targets you actually hit — plus a motivating scoreboard for months of quiet work.",
    betterDirection: "lower",
  },
  // ── C · Everyday movement ────────────────────────────────
  {
    id: "steps",
    label: "Steps & Intensity Minutes",
    cluster: "C",
    unit: "steps",
    tag: "Daily · weekly ~150 min",
    icon: "👣",
    color: "hsl(142, 60%, 55%)",
    whatIs: "All-day movement, plus weekly minutes of moderate-to-vigorous activity. The quiet foundation that decides how fast you recover between runs.",
    good: { arrow: "↑", small: "Consistent movement", text: "Daily steps up and intensity minutes met: a strong health baseline that speeds recovery." },
    watch: { arrow: "↓", small: "Run then sit", text: "Big runs but otherwise glued to a chair — the “active couch potato” trap dulls recovery." },
    soIDo: "Hold a daily step floor (~7–8k) with easy walks, and use that movement as active recovery.",
    payoff: "Better recovery between runs, steadier energy and metabolic health — the cheapest win there is.",
    betterDirection: "higher",
  },
];

export const WATCH_METRIC_BY_ID: Record<string, WatchMetricDef> = WATCH_METRICS.reduce(
  (acc, m) => ({ ...acc, [m.id]: m }),
  {},
);

export const HRV_STATUS_OPTIONS = ["balanced", "unbalanced", "low"] as const;
export type HrvStatus = (typeof HRV_STATUS_OPTIONS)[number];

// ── Entry types ────────────────────────────────────────────
export interface WatchEntry {
  id: string;
  user_id: string;
  entry_date: string;
  source: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  hrv_status: string | null;
  sleep_score: number | null;
  sleep_deep_min: number | null;
  sleep_rem_min: number | null;
  sleep_light_min: number | null;
  sleep_awake_min: number | null;
  body_battery: number | null;
  stress_level: number | null;
  recovery_time_hrs: number | null;
  vo2max: number | null;
  run_pace_sec: number | null;
  run_distance_km: number | null;
  run_kcal: number | null;
  run_cadence_spm: number | null;
  run_power_w: number | null;
  run_avg_hr: number | null;
  race_5k_sec: number | null;
  race_10k_sec: number | null;
  race_half_sec: number | null;
  race_marathon_sec: number | null;
  fitness_age: number | null;
  steps: number | null;
  intensity_minutes: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type WatchEntryInput = Omit<WatchEntry, "id" | "user_id" | "created_at" | "updated_at">;

// ── Formatters & parsers ──────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

/** seconds → "m:ss" (pace, per km). */
export function fmtPace(sec?: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${pad(s)}`;
}

/** seconds → "h:mm:ss" or "mm:ss". */
export function fmtDuration(sec?: number | null): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "5:30" or "5:30.5" → seconds. Bare number treated as seconds. */
export function parsePace(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    if (parts.some(n => !Number.isFinite(n))) return null;
    const [m, s] = parts;
    return m * 60 + s;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "1:45:00", "22:30" or bare seconds → seconds. */
export function parseDuration(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.includes(":")) {
    const parts = t.split(":").map(Number);
    if (parts.some(n => !Number.isFinite(n))) return null;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── Readiness scoring ─────────────────────────────────────
// Sleep sits at the top of the loop (sleep → HRV·RHR·Battery → effort),
// so it carries the most weight; recovery-time long-reads cap the verdict.
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const lerp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

export type Verdict = "hard" | "easy" | "rest";

export interface Readiness {
  score: number; // 0-100
  verdict: Verdict;
  hasData: boolean;
  contributors: number; // how many recovery signals fed the score
}

interface Signal {
  weight: number;
  norm: number; // 0..1 good-ness
}

function recoverySignals(e: WatchEntry, prev?: WatchEntry | null): Signal[] {
  const out: Signal[] = [];
  // Sleep — top of the loop.
  if (e.sleep_score != null) out.push({ weight: 0.3, norm: lerp(e.sleep_score, 35, 90) });
  // HRV status (preferred) or raw ms as a weak proxy.
  if (e.hrv_status) {
    const map: Record<string, number> = { balanced: 1, unbalanced: 0.45, low: 0.15 };
    out.push({ weight: 0.22, norm: map[e.hrv_status] ?? 0.5 });
  }
  // Resting HR — lower is better; a spike vs yesterday drags it down.
  if (e.resting_hr != null) {
    let norm = lerp(78 - e.resting_hr, 0, 30); // 48bpm→1, 78bpm→0
    if (prev?.resting_hr != null && e.resting_hr - prev.resting_hr >= 5) {
      norm = Math.min(norm, 0.35);
    }
    out.push({ weight: 0.2, norm });
  }
  // Body Battery (morning reading).
  if (e.body_battery != null) out.push({ weight: 0.18, norm: lerp(e.body_battery, 15, 90) });
  // Stress — lower is better.
  if (e.stress_level != null) out.push({ weight: 0.1, norm: 1 - lerp(e.stress_level, 20, 80) });
  // Recovery time — long reads sap readiness.
  if (e.recovery_time_hrs != null) out.push({ weight: 0.1, norm: 1 - lerp(e.recovery_time_hrs, 0, 48) });
  return out;
}

export function computeReadiness(e?: WatchEntry | null, prev?: WatchEntry | null): Readiness {
  if (!e) return { score: 0, verdict: "easy", hasData: false, contributors: 0 };
  const signals = recoverySignals(e, prev);
  if (signals.length === 0) return { score: 0, verdict: "easy", hasData: false, contributors: 0 };
  const totalW = signals.reduce((s, x) => s + x.weight, 0);
  const raw = signals.reduce((s, x) => s + x.weight * x.norm, 0) / totalW;
  let score = Math.round(clamp01(raw) * 100);

  // Base verdict by score.
  let verdict: Verdict = score >= 70 ? "hard" : score >= 45 ? "easy" : "rest";

  // Guardrails — the loop's cautionary caps (worst wins).
  const cap = (v: Verdict) => {
    const order: Verdict[] = ["hard", "easy", "rest"];
    if (order.indexOf(v) > order.indexOf(verdict)) verdict = v;
  };
  if (e.hrv_status === "low") cap("easy");
  if (e.hrv_status === "unbalanced" && verdict === "hard") cap("easy");
  if (e.sleep_score != null && e.sleep_score < 50) cap("easy");
  if (e.recovery_time_hrs != null && e.recovery_time_hrs >= 36) cap("easy");
  if (e.recovery_time_hrs != null && e.recovery_time_hrs >= 60) cap("rest");
  if (prev?.resting_hr != null && e.resting_hr != null && e.resting_hr - prev.resting_hr >= 8) cap("easy");

  return { score, verdict, hasData: true, contributors: signals.length };
}

export const VERDICT_META: Record<Verdict, { word: string; line: string; color: string; emoji: string }> = {
  hard: {
    word: "GO HARD",
    line: "Fully charged — spend it on your hardest session or biggest block.",
    color: SIGNAL.good,
    emoji: "🔥",
  },
  easy: {
    word: "EASY",
    line: "Keep it light — an easy jog, mobility, or a walk. Don't dig a hole.",
    color: SIGNAL.watch,
    emoji: "🌤️",
  },
  rest: {
    word: "REST",
    line: "Recover today — protect sleep, hydrate, gentle movement only.",
    color: SIGNAL.rest,
    emoji: "🌙",
  },
};

// ── "What to improve" — words-first actions from amber signals ─
export interface Improvement {
  id: string;
  tone: SignalTone;
  text: string;
}

export function whatToImprove(e?: WatchEntry | null, prev?: WatchEntry | null): Improvement[] {
  if (!e) return [];
  const out: Improvement[] = [];

  // Sleep first — it's the top of the loop.
  if (e.sleep_score != null && e.sleep_score < 70) {
    out.push({
      id: "sleep_score",
      tone: "watch",
      text: `Sleep score ${Math.round(e.sleep_score)} — protect tonight: same bedtime, no late screens/caffeine, cool dark room.`,
    });
  }
  if (e.resting_hr != null) {
    const up = prev?.resting_hr != null ? e.resting_hr - prev.resting_hr : 0;
    if (up >= 5) {
      out.push({
        id: "resting_hr",
        tone: "watch",
        text: `Resting HR up ${Math.round(up)} bpm (${Math.round(e.resting_hr)}) — make today an easy jog, hydrate, early night.`,
      });
    } else if (e.resting_hr > 72) {
      out.push({
        id: "resting_hr",
        tone: "watch",
        text: `Resting HR ${Math.round(e.resting_hr)} bpm is above your easy range — keep effort light and rebuild sleep.`,
      });
    }
  }
  if (e.hrv_status === "low" || e.hrv_status === "unbalanced") {
    out.push({
      id: "hrv_ms",
      tone: "watch",
      text: `HRV reading ${e.hrv_status} — save hard efforts for a balanced day; keep it easy and don't fight it.`,
    });
  }
  if (e.body_battery != null && e.body_battery < 40) {
    out.push({
      id: "body_battery",
      tone: "watch",
      text: `Body Battery woke at ${Math.round(e.body_battery)} — front-load demanding tasks, then a walk and an earlier night.`,
    });
  }
  if (e.stress_level != null && e.stress_level > 55) {
    out.push({
      id: "stress_level",
      tone: "watch",
      text: `Stress pinned at ${Math.round(e.stress_level)} — insert 5 min of slow breathing or a short walk to reset.`,
    });
  }
  if (e.recovery_time_hrs != null && e.recovery_time_hrs >= 24) {
    out.push({
      id: "recovery_time_hrs",
      tone: "info",
      text: `Recovery Time ${Math.round(e.recovery_time_hrs)} h left — no hard stacking; easy running, mobility, or rest.`,
    });
  }
  // Everyday movement — a quiet nudge if intensity target is missed.
  if (e.intensity_minutes != null && e.intensity_minutes < 150) {
    out.push({
      id: "steps",
      tone: "info",
      text: `Intensity minutes ${Math.round(e.intensity_minutes)}/150 this week — a couple of brisk walks close the gap.`,
    });
  }

  return out.slice(0, 3);
}

// ── Trend read for a single metric (good / watch / steady) ──
export function watchTrend(
  def: WatchMetricDef,
  current?: number | null,
  previous?: number | null,
): { tone: SignalTone; rising: boolean; delta: number } | null {
  if (current == null || previous == null || previous === 0) return null;
  const delta = current - previous;
  if (Math.abs(delta) < previous * 0.01) return { tone: "info", rising: false, delta: 0 };
  const rising = delta > 0;
  const good =
    def.betterDirection === "higher" ? rising : def.betterDirection === "lower" ? !rising : null;
  return { tone: good == null ? "info" : good ? "good" : "watch", rising, delta };
}

// ── Sample data (first-load demo) ─────────────────────────
// Twelve weeks of realistic daily data telling a "getting fitter" story:
// resting HR & recovery-time drift down, HRV / VO₂ max / sleep drift up, race
// predictions fall, all with day-to-day noise and the odd rough night. Four
// runs a week (easy / tempo / long / easy) sit on top of the daily wellness.
export function generateSampleWatchEntries(): WatchEntryInput[] {
  const DAYS = 84; // 12 weeks
  const dayOffset = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const pad = (x: number) => String(x).padStart(2, "0");
    // Local calendar date — toISOString() shifts the day across timezones.
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Deterministic PRNG (mulberry32) so the demo looks the same every load.
  let seed = 20260704;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noise = (amp: number) => (rand() * 2 - 1) * amp;
  const r = (n: number, d = 0) => Number(n.toFixed(d));
  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

  const base = (): Omit<WatchEntryInput, "entry_date"> => ({
    source: "manual",
    resting_hr: null, hrv_ms: null, hrv_status: null,
    sleep_score: null, sleep_deep_min: null, sleep_rem_min: null, sleep_light_min: null, sleep_awake_min: null,
    body_battery: null, stress_level: null, recovery_time_hrs: null,
    vo2max: null, run_pace_sec: null, run_distance_km: null, run_kcal: null,
    run_cadence_spm: null, run_power_w: null, run_avg_hr: null,
    race_5k_sec: null, race_10k_sec: null, race_half_sec: null, race_marathon_sec: null, fitness_age: null,
    steps: null, intensity_minutes: null, notes: "",
  });

  const out: WatchEntryInput[] = [];
  let carryRecovery = 6; // hours of recovery still owed, decays daily

  // Walk oldest → newest so trends and recovery carry-over read chronologically.
  for (let i = DAYS - 1; i >= 0; i--) {
    const p = (DAYS - 1 - i) / (DAYS - 1); // 0 (oldest) → 1 (today)
    const date = dayOffset(i);
    const dow = new Date(`${date}T00:00:00`).getDay(); // 0 Sun … 6 Sat
    const bad = rand() < 0.13; // ~1 rough night a week

    // ── Recovery & readiness ──
    const sleepScore = clamp(r(78 + p * 6 + noise(6) - (bad ? 22 : 0) - (dow === 6 ? 3 : 0)), 45, 96);
    const restingHr = clamp(r(62 - p * 9 + noise(1.5) + (bad ? 5 : 0)), 48, 70);
    const hrv = clamp(r(48 + p * 18 + noise(4) - (bad ? 12 : 0)), 30, 78);
    const hrvStatus = bad ? (rand() < 0.5 ? "low" : "unbalanced") : hrv < 46 ? "unbalanced" : "balanced";
    const battery = clamp(r(55 + p * 10 + (sleepScore - 70) * 0.6 + noise(6) - (bad ? 20 : 0)), 25, 98);
    const stress = clamp(r(45 - p * 8 - (sleepScore - 70) * 0.3 + noise(6) + (bad ? 15 : 0)), 18, 72);

    const deep = clamp(r(sleepScore * 0.85 + noise(8) - (bad ? 15 : 0)), 25, 105);
    const rem = clamp(r(sleepScore * 1.05 + noise(10) - (bad ? 12 : 0)), 40, 125);
    const awake = clamp(r(42 - sleepScore * 0.28 + noise(6) + (bad ? 18 : 0)), 4, 70);
    const light = clamp(r(200 + noise(18) - (bad ? 20 : 0)), 150, 245);

    // ── Training schedule: Tue easy · Thu tempo · Sat long · Sun easy ──
    let runType: "easy" | "tempo" | "long" | null =
      dow === 2 || dow === 0 ? "easy" : dow === 4 ? "tempo" : dow === 6 ? "long" : null;
    if (bad && runType === "tempo") runType = "easy"; // back off hard days after a rough night

    const easyPace = 345 - p * 30; // sec/km, improving over the block
    let pace: number | null = null,
      dist: number | null = null,
      avgHr: number | null = null,
      cad: number | null = null,
      pow: number | null = null,
      kcal: number | null = null;

    carryRecovery = Math.max(0, carryRecovery - 22 + noise(2));
    if (runType === "easy") {
      pace = r(easyPace + 6 + noise(5));
      dist = r(clamp(6.5 + noise(1.5), 4, 10), 1);
      avgHr = r(144 + noise(4));
      carryRecovery += 8;
    } else if (runType === "tempo") {
      pace = r(easyPace - 34 + noise(4));
      dist = r(clamp(9 + noise(1), 7, 12), 1);
      avgHr = r(165 + noise(4));
      carryRecovery += 30;
    } else if (runType === "long") {
      pace = r(easyPace + 12 + noise(5));
      dist = r(clamp(15 + p * 5 + noise(2), 12, 24), 1);
      avgHr = r(150 + noise(4));
      carryRecovery += 34;
    }
    if (runType) {
      cad = r(clamp(170 + p * 6 + (runType === "tempo" ? 4 : 0) + noise(2), 164, 182));
      pow = r(clamp(245 + p * 20 + (runType === "tempo" ? 15 : 0) + noise(6), 230, 300));
      kcal = r((dist ?? 0) * 62 + noise(25));
    }
    const recovery = r(clamp(carryRecovery, 0, 60));

    // ── Fitness & output (slow trends) ──
    const vo2 = r(clamp(46 + p * 5 + noise(0.4), 44, 53), 1);
    const fitnessAge = r(clamp(34 - p * 3 + noise(0.4), 29, 36));

    // ── Everyday movement ──
    const steps = r(clamp(7000 + p * 1500 + (runType ? 2500 : 0) + noise(1500), 4000, 16000));
    const intensity = r(clamp(150 + p * 40 + noise(20), 90, 220));

    out.push({
      ...base(),
      entry_date: date,
      resting_hr: restingHr, hrv_ms: hrv, hrv_status: hrvStatus,
      sleep_score: sleepScore, sleep_deep_min: deep, sleep_rem_min: rem, sleep_light_min: light, sleep_awake_min: awake,
      body_battery: battery, stress_level: stress, recovery_time_hrs: recovery,
      vo2max: vo2,
      run_pace_sec: pace, run_distance_km: dist, run_kcal: kcal,
      run_cadence_spm: cad, run_power_w: pow, run_avg_hr: avgHr,
      race_5k_sec: r(1410 - p * 110 + noise(8)),
      race_10k_sec: r(2940 - p * 240 + noise(15)),
      race_half_sec: r(6540 - p * 600 + noise(30)),
      race_marathon_sec: r(13800 - p * 1200 + noise(60)),
      fitness_age: fitnessAge,
      steps, intensity_minutes: intensity,
      notes: bad ? "rough night's sleep" : runType === "long" ? "weekend long run" : runType === "tempo" ? "threshold session" : "",
    });
  }
  return out;
}
