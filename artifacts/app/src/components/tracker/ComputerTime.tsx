import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppUsage, type UsageRange } from "@/hooks/useAppUsage";
import { useUserSettings } from "@/hooks/useUserSettings";
import { addDays, daysBetween, todayKey } from "@/lib/today";
import { aggregateUsage, PRIORITY_LEARNED, type Classification, type RuleProposal, type UsageSession } from "@/lib/app-usage-classify";
import ComputerTimeDashboard from "./ComputerTimeDashboard";
import ComputerTimeTimeline from "./ComputerTimeTimeline";
import ComputerTimeWeek from "./ComputerTimeWeek";
import ComputerTimeAllTime from "./ComputerTimeAllTime";
import ComputerTimeFolders from "./ComputerTimeFolders";
import ComputerTimeApps from "./ComputerTimeApps";
import { deviceLabel, pillActive, pillBase, pillIdle, relativeTime } from "./computer-time-shared";

/**
 * The "Komputer" section of the Stats page. Watch mode never reaches it:
 * Tracker.tsx returns TrackerWatchView before rendering this component.
 */

type Preset = "today" | "7d" | "30d" | "custom";
type Tab = "dashboard" | "timeline" | "week" | "all" | "folders" | "apps";

const PRESET_LABELS: Record<Preset, string> = { today: "Dziś", "7d": "7 dni", "30d": "30 dni", custom: "Własny zakres" };
const TAB_LABELS: Record<Tab, string> = {
  dashboard: "Pulpit",
  timeline: "Oś czasu",
  week: "Tydzień",
  all: "Wszystko",
  folders: "Foldery",
  apps: "Aplikacje",
};
const ALL_DEVICES = "__all__";
const COLLAPSE_KEY = "computer-time-collapsed";
const MAX_WEEK_DAYS = 60;

function presetRange(preset: Preset, custom: UsageRange): UsageRange {
  const today = todayKey();
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "30d") return { from: addDays(today, -29), to: today };
  return custom.from <= custom.to ? custom : { from: custom.to, to: custom.from };
}

/** Days the "Tydzień" chart spans: the selected range, at least a week, at most 60 days. */
function weekWindowDays(preset: Preset, range: UsageRange): number {
  if (preset === "today" || preset === "7d") return 7;
  if (preset === "30d") return 30;
  return Math.min(MAX_WEEK_DAYS, Math.max(1, daysBetween(range.from, range.to) + 1));
}

export default function ComputerTime() {
  const { getCategories } = useUserSettings();
  const categories = useMemo(() => getCategories(), [getCategories]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  // Loads start on the first expand and stay loaded afterwards.
  const [everExpanded, setEverExpanded] = useState(!collapsed);
  const [preset, setPreset] = useState<Preset>("today");
  const [custom, setCustom] = useState<UsageRange>(() => ({ from: addDays(todayKey(), -13), to: todayKey() }));
  const [device, setDevice] = useState<string>(ALL_DEVICES);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [now, setNow] = useState(() => new Date());

  const range = useMemo(() => presetRange(preset, custom), [preset, custom]);
  const weekDays = weekWindowDays(preset, range);
  // The week chart wants `weekDays` ending on range.to even when the range is one day,
  // so the loaded window is the wider of the two; the other tabs filter back to `range`.
  const loadRange = useMemo<UsageRange>(() => {
    const weekFrom = addDays(range.to, -(weekDays - 1));
    return { from: weekFrom < range.from ? weekFrom : range.from, to: range.to };
  }, [range, weekDays]);
  const usage = useAppUsage(loadRange, { enabled: everExpanded });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // "12 min temu" should age while the page sits open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /** Sessions for the selected device: `week` covers the loaded window, `inRange` the selected range only. */
  const { week, inRange } = useMemo(() => {
    const week = { sessions: [] as UsageSession[], classifications: [] as Classification[] };
    const inRange = { sessions: [] as UsageSession[], classifications: [] as Classification[] };
    usage.sessions.forEach((s, i) => {
      if (device !== ALL_DEVICES && s.device_id !== device) return;
      const c = usage.classifications[i];
      week.sessions.push(s);
      week.classifications.push(c);
      if (s.local_date >= range.from && s.local_date <= range.to) {
        inRange.sessions.push(s);
        inRange.classifications.push(c);
      }
    });
    return { week, inRange };
  }, [usage.sessions, usage.classifications, device, range.from, range.to]);

  const agg = useMemo(() => aggregateUsage(inRange.sessions, usage.classes, inRange.classifications), [inRange, usage.classes]);
  const weekAgg = useMemo(() => aggregateUsage(week.sessions, usage.classes, week.classifications), [week, usage.classes]);

  const createLearnedRule = async (proposal: RuleProposal): Promise<boolean> => {
    const created = await usage.createRule({
      field: proposal.field,
      match_kind: proposal.match_kind,
      pattern: proposal.pattern,
      class_id: proposal.class_id,
      project_id: proposal.project_id,
      priority: PRIORITY_LEARNED,
      source: "learned",
      confidence: 0.9,
      enabled: true,
    });
    return !!created;
  };

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      if (v) setEverExpanded(true);
      return !v;
    });
  };

  const noDataAtAll = usage.tableReady && !usage.loading && usage.sessions.length === 0 && usage.lastSync === null;
  const noDataInRange = usage.tableReady && !usage.loading && inRange.sessions.length === 0 && usage.lastSync !== null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden mb-8">
      <button
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-controls="computer-time-body"
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg" aria-hidden="true">💻</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Komputer</h3>
          {!collapsed && usage.lastSync && (
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              Ostatni sync: {relativeTime(usage.lastSync.at, now)} z {deviceLabel(usage.lastSync.device)}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            id="computer-time-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
              {/* Range + device */}
              <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Zakres dat">
                {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreset(p)}
                    aria-pressed={p === preset}
                    className={`${pillBase} ${p === preset ? pillActive : pillIdle}`}
                  >
                    {PRESET_LABELS[p]}
                  </button>
                ))}
                {preset === "custom" && (
                  <span className="flex items-center gap-1 text-xs">
                    <input
                      type="date"
                      aria-label="Od"
                      value={custom.from}
                      max={todayKey()}
                      onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
                      className="bg-secondary/40 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground"
                    />
                    <span className="text-muted-foreground">do</span>
                    <input
                      type="date"
                      aria-label="Do"
                      value={custom.to}
                      max={todayKey()}
                      onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                      className="bg-secondary/40 border border-border/50 rounded-lg px-2 py-1 text-xs text-foreground"
                    />
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  {usage.devices.length > 1 && (
                    <Select value={device} onValueChange={setDevice}>
                      <SelectTrigger className="h-7 w-36 text-[11px] bg-secondary/40 border-border/50" aria-label="Urządzenie">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_DEVICES}>Wszystkie urządzenia</SelectItem>
                        {usage.devices.map((d) => (
                          <SelectItem key={d} value={d}>
                            {deviceLabel(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <button
                    onClick={() => usage.refetch()}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    title="Odśwież"
                    aria-label="Odśwież"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${usage.loading ? "animate-spin" : ""}`} />
                  </button>
                </span>
              </div>
              {usage.lastSync && (
                <p className="text-[11px] text-muted-foreground mb-4 sm:hidden">
                  Ostatni sync: {relativeTime(usage.lastSync.at, now)} z {deviceLabel(usage.lastSync.device)}
                </p>
              )}

              {!usage.tableReady ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200" role="status">
                  <div className="font-semibold mb-1">Tabela nie jest jeszcze utworzona</div>
                  Uruchom migrację <code className="font-mono">supabase/migrations/20260928120000_app_usage.sql</code> w projekcie Supabase
                  (tabele <code className="font-mono">app_usage_sessions</code>, <code className="font-mono">app_classes</code>,{" "}
                  <code className="font-mono">app_rules</code>), potem odśwież stronę.
                </div>
              ) : usage.loading && usage.sessions.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground animate-pulse" role="status">Wczytywanie sesji…</div>
              ) : noDataAtAll ? (
                <div className="rounded-xl border border-border/50 bg-secondary/30 px-4 py-4 text-xs text-foreground/80 space-y-2">
                  <div className="font-semibold text-sm">Brak danych z komputera</div>
                  <p className="text-muted-foreground">
                    Czas przy komputerze zbiera agent na Windows. Nie ma okna, tylko ikonka w zasobniku; loguje się tym samym
                    e-mailem i hasłem co tutaj i co minutę wysyła sesje do Twojej bazy.
                  </p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                    <li>
                      Otwórz w repozytorium katalog <code className="font-mono text-foreground/80">tracker/</code> i przejdź kroki z{" "}
                      <code className="font-mono text-foreground/80">tracker/README.md</code>.
                    </li>
                    <li>
                      Wpisz adres i klucz anon projektu Supabase do <code className="font-mono text-foreground/80">config.json</code>.
                    </li>
                    <li>Zaloguj się z menu ikonki i włącz autostart. Pierwszy sync wyśle ostatnie 30 dni.</li>
                  </ol>
                  <p className="text-muted-foreground">Ta sekcja odświeży się sama, gdy pojawią się pierwsze sesje.</p>
                </div>
              ) : (
                <>
                  {/* Tabs */}
                  <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Widok">
                    {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                      <button
                        key={t}
                        role="tab"
                        aria-selected={t === tab}
                        aria-pressed={t === tab}
                        onClick={() => setTab(t)}
                        className={`${pillBase} ${t === tab ? pillActive : pillIdle}`}
                      >
                        {TAB_LABELS[t]}
                      </button>
                    ))}
                  </div>

                  {noDataInRange && tab !== "apps" && tab !== "week" ? (
                    <p className="text-xs text-muted-foreground italic">Brak sesji w tym zakresie. Zmień zakres dat albo urządzenie.</p>
                  ) : tab === "dashboard" ? (
                    <ComputerTimeDashboard
                      classes={usage.classes}
                      categories={categories}
                      ctx={usage.ctx}
                      agg={agg}
                      from={range.from}
                      to={range.to}
                      fetchSessionsForDates={usage.fetchSessionsForDates}
                    />
                  ) : tab === "timeline" ? (
                    <ComputerTimeTimeline
                      sessions={inRange.sessions}
                      classifications={inRange.classifications}
                      classes={usage.classes}
                      categories={categories}
                      from={range.from}
                      to={range.to}
                    />
                  ) : tab === "week" ? (
                    <ComputerTimeWeek agg={weekAgg} days={weekDays} to={range.to} />
                  ) : tab === "all" ? (
                    <ComputerTimeAllTime agg={agg} classes={usage.classes} categories={categories} from={range.from} to={range.to} />
                  ) : tab === "folders" ? (
                    <ComputerTimeFolders
                      agg={agg}
                      sessions={inRange.sessions}
                      classes={usage.classes}
                      rules={usage.rules}
                      projects={usage.projects}
                      categories={categories}
                      labelKey={usage.labelKey}
                      createLearnedRule={createLearnedRule}
                    />
                  ) : (
                    <ComputerTimeApps
                      classes={usage.classes}
                      rules={usage.rules}
                      suggestions={usage.suggestions}
                      projects={usage.projects}
                      categories={categories}
                      sessions={week.sessions}
                      classifications={week.classifications}
                      createClass={usage.createClass}
                      updateClass={usage.updateClass}
                      deleteClass={usage.deleteClass}
                      createRule={usage.createRule}
                      updateRule={usage.updateRule}
                      deleteRule={usage.deleteRule}
                      acceptSuggestion={usage.acceptSuggestion}
                      rejectSuggestion={usage.rejectSuggestion}
                    />
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
