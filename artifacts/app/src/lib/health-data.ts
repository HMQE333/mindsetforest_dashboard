// Standard adult reference ranges (AHA / ADA / WHO).
// All thresholds use US units (mg/dL, %, kg, cm, mmHg, bpm) as in the database schema.

export type HealthStatus = "optimal" | "borderline" | "out" | "unknown";

export type HealthGroup = "metabolic" | "cardiovascular" | "blood" | "body";

export interface HealthMetricDef {
  id: string;            // matches a column on health_entries OR a derived id like 'bmi' / 'bp'
  label: string;
  shortLabel?: string;
  unit: string;
  icon: string;          // emoji
  group: HealthGroup;
  color: string;         // hsl token
  // For most metrics. Value-based status
  optimal?: [number, number];
  borderline?: [number, number];
  // Direction: which way is "good" (used for trend arrow color)
  betterDirection: "lower" | "higher" | "neutral";
  why: string;           // one-line "Why it matters"
  derived?: boolean;     // computed (e.g. BMI) instead of read from a column
  composite?: boolean;   // composite (e.g. Blood pressure pair)
}

export const HEALTH_METRICS: HealthMetricDef[] = [
  {
    id: "weight_kg",
    label: "Weight",
    unit: "kg",
    icon: "⚖️",
    group: "body",
    color: "hsl(var(--cat-body))",
    betterDirection: "neutral",
    why: "Stable weight over months reflects sustainable habits and metabolic balance.",
  },
  {
    id: "bmi",
    label: "BMI",
    unit: "kg/m²",
    icon: "📏",
    group: "body",
    color: "hsl(var(--cat-body))",
    optimal: [18.5, 24.9],
    borderline: [25, 29.9],
    betterDirection: "neutral",
    why: "Body Mass Index is a quick screen for healthy weight ranges (WHO).",
    derived: true,
  },
  {
    id: "bp",
    label: "Blood Pressure",
    shortLabel: "BP",
    unit: "mmHg",
    icon: "🫀",
    group: "cardiovascular",
    color: "hsl(0, 72%, 60%)",
    betterDirection: "lower",
    why: "Normal: <120/<80. Elevated long-term BP is the leading driver of cardiovascular risk (AHA).",
    composite: true,
  },
  {
    id: "resting_hr",
    label: "Resting Heart Rate",
    shortLabel: "RHR",
    unit: "bpm",
    icon: "💓",
    group: "cardiovascular",
    color: "hsl(330, 80%, 60%)",
    optimal: [50, 70],
    borderline: [71, 85],
    betterDirection: "lower",
    why: "Lower resting heart rate generally indicates better cardiovascular fitness (AHA).",
  },
  {
    id: "fasting_glucose_mgdl",
    label: "Fasting Glucose",
    unit: "mg/dL",
    icon: "🩸",
    group: "metabolic",
    color: "hsl(25, 95%, 55%)",
    optimal: [70, 99],
    borderline: [100, 125],
    betterDirection: "lower",
    why: "Fasting glucose ≥126 mg/dL on two occasions indicates diabetes (ADA).",
  },
  {
    id: "hba1c_pct",
    label: "HbA1c",
    unit: "%",
    icon: "🧬",
    group: "metabolic",
    color: "hsl(35, 95%, 55%)",
    optimal: [4.0, 5.6],
    borderline: [5.7, 6.4],
    betterDirection: "lower",
    why: "HbA1c reflects average blood sugar over ~3 months. <5.7% is normal (ADA).",
  },
  {
    id: "ldl_mgdl",
    label: "LDL Cholesterol",
    shortLabel: "LDL",
    unit: "mg/dL",
    icon: "🟡",
    group: "cardiovascular",
    color: "hsl(45, 95%, 55%)",
    optimal: [0, 99],
    borderline: [100, 129],
    betterDirection: "lower",
    why: "LDL is the main lipid driving plaque buildup. AHA optimal: <100 mg/dL.",
  },
  {
    id: "hdl_mgdl",
    label: "HDL Cholesterol",
    shortLabel: "HDL",
    unit: "mg/dL",
    icon: "🟢",
    group: "cardiovascular",
    color: "hsl(142, 70%, 45%)",
    optimal: [60, 200],
    borderline: [40, 59],
    betterDirection: "higher",
    why: 'HDL helps remove cholesterol. ≥60 mg/dL is "protective" (AHA).',
  },
  {
    id: "total_chol_mgdl",
    label: "Total Cholesterol",
    shortLabel: "Total",
    unit: "mg/dL",
    icon: "🧪",
    group: "cardiovascular",
    color: "hsl(280, 70%, 60%)",
    optimal: [0, 199],
    borderline: [200, 239],
    betterDirection: "lower",
    why: "Desirable: <200 mg/dL. Used together with HDL/LDL for risk assessment (AHA).",
  },
  {
    id: "triglycerides_mgdl",
    label: "Triglycerides",
    shortLabel: "Trig",
    unit: "mg/dL",
    icon: "💧",
    group: "cardiovascular",
    color: "hsl(200, 80%, 55%)",
    optimal: [0, 149],
    borderline: [150, 199],
    betterDirection: "lower",
    why: "High triglycerides increase cardiovascular risk. Optimal: <150 mg/dL (AHA).",
  },
  {
    id: "hemoglobin_gdl",
    label: "Hemoglobin",
    shortLabel: "Hb",
    unit: "g/dL",
    icon: "🔴",
    group: "blood",
    color: "hsl(0, 75%, 55%)",
    optimal: [13.0, 17.5],
    borderline: [12.0, 12.9],
    betterDirection: "neutral",
    why: "Carries oxygen to tissues. Low Hb may indicate anemia (WHO).",
  },
  {
    id: "creatinine_mgdl",
    label: "Creatinine",
    shortLabel: "Crea",
    unit: "mg/dL",
    icon: "🫘",
    group: "blood",
    color: "hsl(190, 70%, 50%)",
    optimal: [0.6, 1.3],
    borderline: [1.31, 1.5],
    betterDirection: "lower",
    why: "Waste product cleared by kidneys. Elevated values suggest reduced kidney function.",
  },
  {
    id: "egfr",
    label: "eGFR",
    unit: "mL/min/1.73m²",
    icon: "🧫",
    group: "blood",
    color: "hsl(160, 70%, 45%)",
    optimal: [90, 200],
    borderline: [60, 89],
    betterDirection: "higher",
    why: "Estimated kidney filtration rate. ≥90 is normal kidney function (KDIGO).",
  },
];

export const METRIC_BY_ID: Record<string, HealthMetricDef> = HEALTH_METRICS.reduce(
  (acc, m) => ({ ...acc, [m.id]: m }),
  {},
);

/** Compute BMI from weight (kg) and height (cm). */
export function computeBMI(weight_kg?: number | null, height_cm?: number | null): number | null {
  if (!weight_kg || !height_cm || height_cm <= 0) return null;
  const m = height_cm / 100;
  return Number((weight_kg / (m * m)).toFixed(1));
}

/** Status for a single value-based metric. */
export function getStatus(value: number | null | undefined, def: HealthMetricDef): HealthStatus {
  if (value === null || value === undefined || Number.isNaN(value)) return "unknown";
  if (def.optimal && value >= def.optimal[0] && value <= def.optimal[1]) return "optimal";
  if (def.borderline && value >= def.borderline[0] && value <= def.borderline[1]) return "borderline";
  if (!def.optimal) return "unknown";
  return "out";
}

/** Status for blood pressure (worse of systolic/diastolic). */
export function getBPStatus(sys?: number | null, dia?: number | null): HealthStatus {
  if (sys == null || dia == null) return "unknown";
  const sysStatus: HealthStatus =
    sys < 120 ? "optimal" : sys < 130 ? "borderline" : "out";
  const diaStatus: HealthStatus =
    dia < 80 ? "optimal" : dia < 85 ? "borderline" : "out";
  // Worst wins
  const order: HealthStatus[] = ["optimal", "borderline", "out"];
  return order[Math.max(order.indexOf(sysStatus), order.indexOf(diaStatus))];
}

export const STATUS_LABEL: Record<HealthStatus, string> = {
  optimal: "Optimal",
  borderline: "Borderline",
  out: "Out of Range",
  unknown: "No Data",
};

export const STATUS_COLORS: Record<HealthStatus, { bg: string; text: string; border: string }> = {
  optimal: { bg: "hsl(142, 70%, 45% / 0.15)", text: "hsl(142, 70%, 55%)", border: "hsl(142, 70%, 45% / 0.4)" },
  borderline: { bg: "hsl(38, 92%, 50% / 0.15)", text: "hsl(38, 92%, 60%)", border: "hsl(38, 92%, 50% / 0.4)" },
  out: { bg: "hsl(0, 72%, 51% / 0.15)", text: "hsl(0, 72%, 60%)", border: "hsl(0, 72%, 51% / 0.4)" },
  unknown: { bg: "hsl(var(--muted))", text: "hsl(var(--muted-foreground))", border: "hsl(var(--border))" },
};

export const STATUS_SCORE: Record<HealthStatus, number> = {
  optimal: 1,
  borderline: 0.5,
  out: 0,
  unknown: 0.5, // neutral when missing
};

/** Aggregate health score 0-100. Weighted from latest entry's metric statuses + self-rating. */
export function computeAggregateScore(latest: {
  metricStatuses: HealthStatus[]; // pre-computed from latest entry
  selfRating?: number | null;
}): number {
  const known = latest.metricStatuses.filter(s => s !== "unknown");
  const metricAvg = known.length > 0
    ? known.reduce((s, st) => s + STATUS_SCORE[st], 0) / known.length
    : 0.5;
  const ratingPart = latest.selfRating ? latest.selfRating / 10 : 0.5;
  return Math.round((metricAvg * 0.7 + ratingPart * 0.3) * 100);
}

/** Trend: percent change between current and previous values. */
export function getTrend(current?: number | null, previous?: number | null): { delta: number; direction: "up" | "down" | "flat" } | null {
  if (current == null || previous == null || previous === 0) return null;
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 0.5) return { delta: 0, direction: "flat" };
  return { delta: Number(delta.toFixed(1)), direction: delta > 0 ? "up" : "down" };
}

export const RATING_LABELS: Record<number, string> = {
  1: "Very Poor",
  5: "Average",
  10: "Peak",
};

export interface HealthEntry {
  id: string;
  user_id: string;
  entry_date: string;
  self_rating: number;
  weight_kg: number | null;
  height_cm: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  resting_hr: number | null;
  fasting_glucose_mgdl: number | null;
  hba1c_pct: number | null;
  ldl_mgdl: number | null;
  hdl_mgdl: number | null;
  total_chol_mgdl: number | null;
  triglycerides_mgdl: number | null;
  hemoglobin_gdl: number | null;
  creatinine_mgdl: number | null;
  egfr: number | null;
  notes: string;
  lab_report_url: string | null;
  created_at: string;
  updated_at: string;
}

export type HealthEntryInput = Omit<HealthEntry, "id" | "user_id" | "created_at" | "updated_at">;

/** Generate sample seed entries for first-load demo data. */
export function generateSampleEntries(): HealthEntryInput[] {
  const today = new Date();
  const dayOffset = (n: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - n);
    return d.toISOString().split("T")[0];
  };
  return [
    {
      entry_date: dayOffset(6), self_rating: 6,
      weight_kg: 78.5, height_cm: 178, bp_systolic: 128, bp_diastolic: 84, resting_hr: 72,
      fasting_glucose_mgdl: 104, hba1c_pct: 5.8, ldl_mgdl: 132, hdl_mgdl: 48,
      total_chol_mgdl: 215, triglycerides_mgdl: 168, hemoglobin_gdl: 14.8,
      creatinine_mgdl: 1.0, egfr: 92,
      notes: "Starting baseline. Felt tired, slept poorly.", lab_report_url: null,
    },
    {
      entry_date: dayOffset(4), self_rating: 7,
      weight_kg: 77.0, height_cm: 178, bp_systolic: 124, bp_diastolic: 80, resting_hr: 68,
      fasting_glucose_mgdl: 98, hba1c_pct: 5.6, ldl_mgdl: 118, hdl_mgdl: 52,
      total_chol_mgdl: 198, triglycerides_mgdl: 142, hemoglobin_gdl: 15.0,
      creatinine_mgdl: 0.95, egfr: 95,
      notes: "Walked 8k steps daily. Cut sugar.", lab_report_url: null,
    },
    {
      entry_date: dayOffset(2), self_rating: 8,
      weight_kg: 75.5, height_cm: 178, bp_systolic: 118, bp_diastolic: 76, resting_hr: 64,
      fasting_glucose_mgdl: 92, hba1c_pct: 5.4, ldl_mgdl: 102, hdl_mgdl: 56,
      total_chol_mgdl: 184, triglycerides_mgdl: 128, hemoglobin_gdl: 15.2,
      creatinine_mgdl: 0.9, egfr: 98,
      notes: "Regular training. Feeling much better.", lab_report_url: null,
    },
    {
      entry_date: dayOffset(0), self_rating: 8,
      weight_kg: 74.8, height_cm: 178, bp_systolic: 116, bp_diastolic: 74, resting_hr: 60,
      fasting_glucose_mgdl: 88, hba1c_pct: 5.3, ldl_mgdl: 94, hdl_mgdl: 62,
      total_chol_mgdl: 178, triglycerides_mgdl: 110, hemoglobin_gdl: 15.4,
      creatinine_mgdl: 0.88, egfr: 100,
      notes: "Best month. Consistent sleep, fasting 14h.", lab_report_url: null,
    },
  ];
}