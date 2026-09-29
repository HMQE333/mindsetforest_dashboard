import { supabase } from "@/integrations/supabase/client";
import { aggregateUsage, classifyAll, type UsageSession } from "@/lib/app-usage-classify";
import { DAILY_COLUMNS, dailyRowToSession, rowToClass, rowToRule } from "@/lib/app-usage-rows";
import { loadMetrics } from "@/lib/assistant-writes";
import type { TrackerMetric } from "@/lib/tracker-data";
import { todayKey } from "@/lib/today";
import { emptySnapshot, monthRange, withinDays, type ReviewKind, type ReviewSnapshot } from "@/lib/review-data";

/**
 * Reads everything the review summary shows for one day or one month. Each
 * source is optional: a missing table or an empty source just leaves its tile
 * out, so a new account still gets a (short) review.
 */
export async function loadReviewSnapshot(userId: string, kind: ReviewKind, period: string): Promise<ReviewSnapshot> {
  const range = kind === "monthly" ? monthRange(period) : { from: period, to: period, days: 1 };
  const snap = emptySnapshot(kind, period, range.days);
  const { from, to } = range;

  const [completions, pathLogs, entries, metrics, watch, spend, events, computer] = await Promise.all([
    supabase.from("daily_completions").select("date,xp_earned,missions_completed,completed_mission_titles").eq("user_id", userId).gte("date", from).lte("date", to),
    supabase.from("path_step_logs").select("step_id,path_id,date").eq("user_id", userId).gte("date", from).lte("date", to),
    supabase.from("tracker_entries").select("metric_id,value,date").eq("user_id", userId).gte("date", from).lte("date", to),
    loadMetrics(userId).catch((): TrackerMetric[] => []),
    // For the morning review the most useful sleep is last night's, filed under today.
    kind === "daily"
      ? supabase.from("watch_entries").select("*").eq("user_id", userId).in("entry_date", [todayKey(), period]).order("entry_date", { ascending: false })
      : supabase.from("watch_entries").select("*").eq("user_id", userId).gte("entry_date", from).lte("entry_date", to),
    supabase.from("finance_transactions").select("title,amount,category,type,date").eq("user_id", userId).gte("date", from).lte("date", to),
    kind === "daily"
      ? supabase.from("calendar_events").select("title,date").eq("user_id", userId).eq("date", period)
      : Promise.resolve({ data: [] as { title: string }[] }),
    loadComputer(userId, from, to).catch(() => null),
  ]);

  // Missions and XP (the daily rollup Home writes).
  const done = completions.data || [];
  snap.xp = done.reduce((n, d) => n + (d.xp_earned || 0), 0);
  snap.missions = done.reduce((n, d) => n + (d.missions_completed || 0), 0);
  snap.activeDays = done.filter((d) => (d.missions_completed || 0) > 0 || (d.xp_earned || 0) > 0).length;
  const titleCount = new Map<string, number>();
  for (const d of done) for (const t of d.completed_mission_titles || []) titleCount.set(t, (titleCount.get(t) || 0) + 1);
  snap.missionTitles = [...titleCount.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (n > 1 ? `${t} (${n}x)` : t)).slice(0, 12);

  // Paths: days logged per path, steps finished in the period.
  const logs = pathLogs.data || [];
  if (logs.length > 0 || kind === "monthly") {
    const [{ data: paths }, { data: steps }] = await Promise.all([
      supabase.from("paths").select("id,name").eq("user_id", userId),
      supabase.from("path_steps").select("id,path_id,title,done,done_at").eq("user_id", userId),
    ]);
    const pathRows = (paths as unknown as { id: string; name: string }[] | null) || [];
    const stepRows = (steps as unknown as { id: string; path_id: string; title: string; done: boolean; done_at: string | null }[] | null) || [];
    const pathName = new Map(pathRows.map((p) => [p.id, p.name]));
    const stepTitle = new Map(stepRows.map((s) => [s.id, s.title]));
    const byPath = new Map<string, { path: string; step: string; count: number }>();
    for (const l of logs) {
      const key = l.path_id;
      const row = byPath.get(key) || { path: pathName.get(l.path_id) || "Ścieżka", step: stepTitle.get(l.step_id) || "", count: 0 };
      row.count++;
      byPath.set(key, row);
    }
    snap.paths = [...byPath.values()].sort((a, b) => b.count - a.count);
    snap.pathStepsFinished = stepRows
      .filter((s) => s.done && withinDays(s.done_at, from, to))
      .map((s) => `${pathName.get(s.path_id) || ""}: ${s.title}`)
      .slice(0, 15);
  }

  // Stats metrics.
  const sums = new Map<string, number>();
  for (const e of entries.data || []) sums.set(e.metric_id, (sums.get(e.metric_id) || 0) + Number(e.value || 0));
  snap.metrics = [...sums.entries()]
    .map(([id, value]) => {
      const m = metrics.find((x) => x.id === id);
      return { label: m?.label || id, unit: m?.unit || "", icon: m?.icon, value };
    })
    .sort((a, b) => b.value - a.value);

  // Watch.
  const nights = ((watch.data || []) as unknown as Record<string, number | null>[]).slice(0, kind === "daily" ? 1 : 62);
  if (nights.length > 0) {
    const avg = (vals: (number | null | undefined)[]) => {
      const xs = vals.filter((v): v is number => typeof v === "number" && v > 0);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    snap.sleep = {
      avgMinutes: avg(nights.map((n) => {
        const t = (n.sleep_deep_min || 0) + (n.sleep_light_min || 0) + (n.sleep_rem_min || 0);
        return t > 0 ? t : null;
      })),
      avgScore: avg(nights.map((n) => n.sleep_score)),
      avgHrv: avg(nights.map((n) => n.hrv_ms)),
      avgRestingHr: avg(nights.map((n) => n.resting_hr)),
      steps: avg(nights.map((n) => n.steps)),
      nights: nights.length,
    };
  }

  // Money out.
  const outs = (spend.data || []).filter((t) => t.type === "expense" || t.type === "subscription");
  if (outs.length > 0) {
    const byLabel = new Map<string, number>();
    for (const t of outs) {
      const label = kind === "monthly" ? t.category || "Inne" : t.title || t.category || "Wydatek";
      byLabel.set(label, (byLabel.get(label) || 0) + Number(t.amount || 0));
    }
    snap.spend = {
      total: outs.reduce((n, t) => n + Number(t.amount || 0), 0),
      count: outs.length,
      top: [...byLabel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, amount]) => ({ label, amount })),
    };
  }

  snap.events = ((events.data || []) as { title: string }[]).map((e) => e.title).slice(0, 8);
  snap.computer = computer;
  return snap;
}

/** Computer time for a date range, classified the same way as Stats -> Komputer. */
async function loadComputer(userId: string, from: string, to: string): Promise<ReviewSnapshot["computer"]> {
  const [classRes, ruleRes, projRes] = await Promise.all([
    supabase.from("app_classes").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("app_rules").select("*").eq("user_id", userId),
    supabase.from("user_projects").select("id,name").eq("user_id", userId),
  ]);
  if (classRes.error) return null;
  const rows: UsageSession[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 20_000; offset += PAGE) {
    const { data, error } = await supabase
      .from("app_usage_daily")
      .select(DAILY_COLUMNS)
      .eq("user_id", userId)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("local_date", { ascending: true })
      .order("device_id", { ascending: true })
      .order("app_key", { ascending: true })
      .order("idle", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    for (const r of data) {
      const s = dailyRowToSession(r);
      if (s) rows.push(s);
    }
    if (data.length < PAGE) break;
  }
  if (rows.length === 0) return null;

  const classes = (classRes.data || []).map(rowToClass);
  const rules = ruleRes.error ? [] : (ruleRes.data || []).map(rowToRule);
  const projects = projRes.error ? [] : (projRes.data || []).map((p) => ({ id: p.id, name: p.name }));
  const classifications = classifyAll(rows, { classes, rules, projects });
  const agg = aggregateUsage(rows, classes, classifications);

  const kindOf = new Map(classes.map((c) => [c.id, c.kind]));
  const byApp = new Map<string, { seconds: number; kind: string | null }>();
  rows.forEach((s, i) => {
    if (s.idle) return;
    const name = s.app_key || s.app;
    const cur = byApp.get(name) || { seconds: 0, kind: null };
    cur.seconds += s.seconds;
    const k = classifications[i].classId ? kindOf.get(classifications[i].classId as string) ?? null : null;
    if (k) cur.kind = k;
    byApp.set(name, cur);
  });

  return {
    total: agg.totalSeconds,
    byKind: agg.byKind,
    unassigned: agg.unclassifiedSeconds,
    focusRatio: agg.focusRatio,
    topApps: [...byApp.entries()]
      .sort((a, b) => b[1].seconds - a[1].seconds)
      .slice(0, 6)
      .map(([name, v]) => ({ name, seconds: v.seconds, kind: v.kind })),
  };
}
