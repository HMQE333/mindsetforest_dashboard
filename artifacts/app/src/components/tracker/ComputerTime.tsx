import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, MonitorSmartphone, RefreshCw, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppUsage, type UsageRange } from "@/hooks/useAppUsage";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useTrackerDevices } from "@/hooks/useTrackerDevices";
import { addDays, daysBetween, todayKey } from "@/lib/today";
import { aggregateUsage, PRIORITY_LEARNED, type Classification, type RuleProposal, type UsageSession } from "@/lib/app-usage-classify";
import { buildTriage, durationLabel, plural, triageWorth } from "@/lib/app-usage-triage";
import { dismissedKeys, loadSuggestionRows, recordDecisions, requestAiSuggestions, type AiDecision, type AiSuggestion } from "@/lib/app-usage-ai";
import ComputerTimeDashboard from "./ComputerTimeDashboard";
import ComputerTimeTimeline from "./ComputerTimeTimeline";
import ComputerTimeWeek from "./ComputerTimeWeek";
import ComputerTimeAllTime from "./ComputerTimeAllTime";
import ComputerTimeFolders from "./ComputerTimeFolders";
import ComputerTimeApps from "./ComputerTimeApps";
import TrackerDownload from "./TrackerDownload";
import PhoneDownload from "./PhoneDownload";
import ComputerTimePrivacy from "./ComputerTimePrivacy";
import TrackerDevicesDialog from "./TrackerDevicesDialog";
import ComputerTimeTriage, { type TriageMemory } from "./ComputerTimeTriage";
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
/** The range preset (and a custom range) survive a reload. */
const RANGE_KEY = "computer-time-range";
/** The day the triage banner was hidden: it comes back the next day. */
const TRIAGE_HIDDEN_KEY = "computer-time-triage-hidden";
const MAX_WEEK_DAYS = 60;
const NO_DISMISSED = new Set<string>();
const NO_AI = new Map<string, AiSuggestion>();
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function readStoredRange(): { preset: Preset; custom: UsageRange } | null {
  try {
    const raw = JSON.parse(localStorage.getItem(RANGE_KEY) || "null");
    if (!raw || typeof raw.preset !== "string" || !Object.prototype.hasOwnProperty.call(PRESET_LABELS, raw.preset)) return null;
    const custom = DAY_KEY_RE.test(raw.from) && DAY_KEY_RE.test(raw.to) ? { from: raw.from, to: raw.to } : null;
    return { preset: raw.preset, custom: custom ?? { from: addDays(todayKey(), -13), to: todayKey() } };
  } catch {
    return null;
  }
}

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
  const [showInstall, setShowInstall] = useState(false);
  const [storedRange] = useState(readStoredRange);
  const [preset, setPreset] = useState<Preset>(storedRange?.preset ?? "today");
  const [custom, setCustom] = useState<UsageRange>(() => storedRange?.custom ?? { from: addDays(todayKey(), -13), to: todayKey() });
  const [device, setDevice] = useState<string>(ALL_DEVICES);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [now, setNow] = useState(() => new Date());

  // The app's day (04:00 boundary), re-read by the minute timer so a page left
  // open overnight moves "Dziś" on instead of staying on yesterday.
  const dayKey = useMemo(() => todayKey(), [now]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = useMemo(() => presetRange(preset, custom), [preset, custom, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const weekDays = weekWindowDays(preset, range);
  // The week chart wants `weekDays` ending on range.to even when the range is one day,
  // so the loaded window is the wider of the two; the other tabs filter back to `range`.
  const loadRange = useMemo<UsageRange>(() => {
    const weekFrom = addDays(range.to, -(weekDays - 1));
    return { from: weekFrom < range.from ? weekFrom : range.from, to: range.to };
  }, [range, weekDays]);
  const usage = useAppUsage(loadRange, { enabled: everExpanded });
  const trackerDevices = useTrackerDevices(everExpanded);
  const names = trackerDevices.names;
  const [devicesOpen, setDevicesOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ preset, from: custom.from, to: custom.to }));
    } catch {
      /* ignore */
    }
  }, [preset, custom]);

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

  // "Przypisz w 10 sekund": the whole loaded window on every device, not the
  // range or device filter. The skipped keys come from app_class_suggestions.
  const [triageOpen, setTriageOpen] = useState(false);
  const [memory, setMemory] = useState<TriageMemory | null>(null);
  const userId = usage.userId;
  const refreshMemory = useCallback(async (): Promise<TriageMemory> => {
    if (!userId) return { rows: [], ready: false };
    const next = await loadSuggestionRows(userId);
    setMemory(next);
    return next;
  }, [userId]);
  useEffect(() => {
    if (everExpanded && userId && usage.tableReady) void refreshMemory();
  }, [everExpanded, userId, usage.tableReady, refreshMemory]);
  const record = useCallback(
    async (decisions: AiDecision[]) => (userId ? recordDecisions(userId, decisions) : false),
    [userId],
  );
  const dismissed = useMemo(() => (memory ? dismissedKeys(memory.rows) : NO_DISMISSED), [memory]);
  const triage = useMemo(
    () =>
      everExpanded && usage.sessions.length > 0 && usage.classes.length > 0
        ? buildTriage({
            sessions: usage.sessions,
            classifications: usage.classifications,
            classes: usage.classes,
            rules: usage.rules,
            dismissed,
            ai: NO_AI,
          })
        : null,
    [everExpanded, usage.sessions, usage.classifications, usage.classes, usage.rules, dismissed],
  );
  const loadedDays = daysBetween(loadRange.from, loadRange.to) + 1;
  const [triageHiddenOn, setTriageHiddenOn] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TRIAGE_HIDDEN_KEY);
    } catch {
      return null;
    }
  });
  const showTriageBanner = !!triage && triageWorth(triage) && triageHiddenOn !== dayKey;
  const hideTriageBanner = () => {
    setTriageHiddenOn(dayKey);
    try {
      localStorage.setItem(TRIAGE_HIDDEN_KEY, dayKey);
    } catch {
      /* ignore */
    }
  };
  const triageBannerText = !triage
    ? ""
    : triage.unassignedSeconds >= 15 * 60
      ? `${durationLabel(triage.unassignedSeconds)} bez kategorii`
      : triage.questions.length > 0
        ? `${triage.questions.length} ${plural(triage.questions.length, "szybkie pytanie", "szybkie pytania", "szybkich pytań")}`
        : `${durationLabel(triage.guessedSeconds)} do potwierdzenia`;
  const canTriage = !!triage && (triage.items.length > 0 || triage.questions.length > 0);

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
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Komputer i telefon</h3>
          {!collapsed && usage.lastSync && (
            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
              Ostatni sync: {relativeTime(usage.lastSync.at, now)} z {deviceLabel(usage.lastSync.device, names)}
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
              {showTriageBanner && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 pl-3 pr-1.5 py-1.5 text-xs" role="status">
                  <button
                    type="button"
                    onClick={() => setTriageOpen(true)}
                    className="flex-1 min-w-0 text-left py-0.5 text-foreground/90 hover:text-foreground"
                  >
                    <span aria-hidden="true">⚡</span> <strong>{triageBannerText}</strong>
                    <span className="text-muted-foreground"> ({loadedDays} {plural(loadedDays, "dzień", "dni", "dni")})</span> ·{" "}
                    <span className="text-primary underline-offset-2 hover:underline">Przypisz w 10 sekund</span>
                  </button>
                  <button
                    type="button"
                    onClick={hideTriageBanner}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 shrink-0"
                    aria-label="Ukryj do jutra"
                    title="Ukryj do jutra"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
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
                            {deviceLabel(d, names)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <button
                    onClick={() => {
                      setDevicesOpen(true);
                      void trackerDevices.refresh();
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                    title="Urządzenia: nazwy, łączenie, usuwanie"
                    aria-label="Urządzenia"
                  >
                    <MonitorSmartphone className="w-3.5 h-3.5" />
                  </button>
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
              <TrackerDevicesDialog
                open={devicesOpen}
                onOpenChange={setDevicesOpen}
                devices={trackerDevices.devices}
                names={names}
                loading={trackerDevices.loading}
                rename={trackerDevices.rename}
                merge={trackerDevices.merge}
                forget={trackerDevices.forget}
                onChanged={() => {
                  setDevice(ALL_DEVICES);
                  usage.refetch();
                }}
              />
              <ComputerTimeTriage
                open={triageOpen}
                onOpenChange={setTriageOpen}
                sessions={usage.sessions}
                classifications={usage.classifications}
                classes={usage.classes}
                rules={usage.rules}
                categories={categories}
                days={loadedDays}
                memory={memory}
                refreshMemory={refreshMemory}
                requestAi={requestAiSuggestions}
                recordDecisions={record}
                labelKeys={usage.labelKeys}
                claimCatalogGroups={usage.claimCatalogGroups}
                undoLabels={usage.undoLabels}
              />
              {usage.lastSync && (
                <p className="text-[11px] text-muted-foreground mb-4 sm:hidden">
                  Ostatni sync: {relativeTime(usage.lastSync.at, now)} z {deviceLabel(usage.lastSync.device, names)}
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
                <div className="space-y-3">
                  <TrackerDownload />
                  <PhoneDownload />
                </div>
              ) : (
                <>
                  <div className="flex justify-end -mt-1 mb-2">
                    <button
                      type="button"
                      onClick={() => setShowInstall((v) => !v)}
                      aria-expanded={showInstall}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {showInstall ? "Ukryj instalację" : "Dodaj komputer lub telefon"}
                    </button>
                  </div>
                  {showInstall && (
                    <div className="mb-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-xs text-foreground/80">
                        <div className="font-semibold text-foreground mb-2">💻 Komputer (Windows)</div>
                        <TrackerDownload compact />
                      </div>
                      <div className="rounded-xl border border-border/50 bg-secondary/30 px-4 py-3 text-xs text-foreground/80">
                        <div className="font-semibold text-foreground mb-2">📱 Telefon (Android)</div>
                        <PhoneDownload compact />
                      </div>
                    </div>
                  )}
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
                    {canTriage && (
                      <button
                        type="button"
                        onClick={() => setTriageOpen(true)}
                        className={`${pillBase} ${pillIdle} ml-auto`}
                        title="Przypisz w 10 sekund"
                      >
                        <span aria-hidden="true">⚡</span> Przypisz
                      </button>
                    )}
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
                      onOpenTriage={canTriage ? () => setTriageOpen(true) : undefined}
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
                  {tab === "apps" && <ComputerTimePrivacy onForgotten={() => void usage.refetch()} />}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
