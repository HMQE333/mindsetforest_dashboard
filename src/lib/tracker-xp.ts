import { TrackerMetric } from "@/lib/tracker-data";
import { ACHIEVEMENTS, TIER_DEFAULT_XP } from "@/lib/tracker-achievements";

export interface MetricXpRule {
  perUnit: number; // XP per unit (e.g. per hour, per push-up)
  perLog: number;  // flat XP per log
  cap?: number;    // optional max XP from a single log
}

export interface TrackerXpConfig {
  enabled: boolean;
  dailyCap: number;       // 0 = no cap
  retroactive: boolean;   // award milestone XP for already-unlocked achievements
  perMetric: Record<string, MetricXpRule>;
  milestones: Record<string, number>;
}

// Sensible defaults by unit
function defaultRuleForUnit(unit: string): MetricXpRule {
  switch (unit) {
    case "hrs":     return { perUnit: 10, perLog: 2, cap: 60 };
    case "pages":   return { perUnit: 0.5, perLog: 2, cap: 40 };
    case "reps":    return { perUnit: 0.2, perLog: 2, cap: 40 };
    case "clients": return { perUnit: 5, perLog: 2, cap: 50 };
    case "setups":  return { perUnit: 8, perLog: 2, cap: 50 };
    case "people":  return { perUnit: 4, perLog: 2, cap: 40 };
    default:        return { perUnit: 1, perLog: 2, cap: 40 };
  }
}

export function defaultMilestoneMap(): Record<string, number> {
  const out: Record<string, number> = {};
  ACHIEVEMENTS.forEach(a => { out[a.id] = TIER_DEFAULT_XP[a.tier]; });
  return out;
}

export function defaultPerMetricMap(metrics: TrackerMetric[]): Record<string, MetricXpRule> {
  const out: Record<string, MetricXpRule> = {};
  metrics.forEach(m => { out[m.id] = defaultRuleForUnit(m.unit); });
  return out;
}

export const DEFAULT_TRACKER_XP_CONFIG: TrackerXpConfig = {
  enabled: true,
  dailyCap: 300,
  retroactive: false,
  perMetric: {},
  milestones: defaultMilestoneMap(),
};

export function mergeConfig(
  cfg: Partial<TrackerXpConfig> | null | undefined,
  metrics: TrackerMetric[],
): TrackerXpConfig {
  const base: TrackerXpConfig = {
    ...DEFAULT_TRACKER_XP_CONFIG,
    perMetric: defaultPerMetricMap(metrics),
    milestones: defaultMilestoneMap(),
  };
  if (!cfg) return base;
  return {
    enabled: cfg.enabled ?? base.enabled,
    dailyCap: cfg.dailyCap ?? base.dailyCap,
    retroactive: cfg.retroactive ?? base.retroactive,
    perMetric: { ...base.perMetric, ...(cfg.perMetric || {}) },
    milestones: { ...base.milestones, ...(cfg.milestones || {}) },
  };
}

export function computeEntryXp(
  metric: TrackerMetric | undefined,
  value: number,
  cfg: TrackerXpConfig,
): number {
  if (!metric || !cfg.enabled) return 0;
  const rule = cfg.perMetric[metric.id] ?? defaultRuleForUnit(metric.unit);
  const raw = rule.perLog + rule.perUnit * value;
  const capped = rule.cap && rule.cap > 0 ? Math.min(raw, rule.cap) : raw;
  return Math.max(0, Math.round(capped));
}