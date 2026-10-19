import { useState, useEffect, useDeferredValue, useMemo, useRef, Suspense } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut, Bell } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useQuickCapture } from "@/hooks/useQuickCapture";
import { useUserSettings } from "@/hooks/useUserSettings";
import OfflineNotice from "@/components/OfflineNotice";
import GuideSection from "@/components/landing/GuideSection";
import BackgroundPattern from "@/components/BackgroundPattern";
import FriendsButton from "@/components/friends/FriendsButton";
import { resolveInboxSettings } from "@/lib/inbox";
// Kept in the entry chunk: its useFriends channel shares a topic with the one
// above (Index's badge), and mounting it later would take the channel over.
import FriendsPanel from "@/components/friends/FriendsPanel";
import ModuleSkeleton, { HomeSkeleton, PageSkeleton } from "@/components/ModuleSkeleton";
import ChunkErrorBoundary, { ChunkRetry, reloadIfOnline } from "@/components/ChunkErrorBoundary";
import { lazyModule, whenIdle, canPrefetch, useOpenCount } from "@/lib/lazy-module";
import { TrackerPage } from "./lazy-pages";
import { useFriends } from "@/hooks/useFriends";
import { useAssistant, useAssistantCurrentScope } from "@/hooks/useAssistant";
import { useHotkeys } from "@/hooks/useHotkeys";
import { matchesHotkey } from "@/lib/hotkeys";
import type { ScopeId } from "@/lib/assistant-context";

type Tab = "dashboard" | "tracker" | "paths" | "oracle" | "archive" | "library" | "cooking" | "finance" | "breathing" | "calendar" | "planning" | "health";

const TAB_TO_SCOPE: Partial<Record<Tab, ScopeId>> = {
  dashboard: "dashboard",
  // TODO: the Stats tab also has a "computer" scope (screen time); one scope per tab for now.
  tracker: "tracker",
  paths: "paths",
  oracle: "oracle",
  finance: "finance",
  planning: "planning",
  health: "health",
};

const ALL_TAB_LABELS: Record<Tab, string> = {
  dashboard: "🎮 Home",
  tracker: "📊 Stats",
  paths: "🪜 Paths",
  oracle: "🔮 Oracle",
  archive: "📦 Archive",
  library: "📚 Library",
  cooking: "🍳 Cooking",
  finance: "💰 Finance",
  breathing: "🌬️ Breathe",
  calendar: "📅 Calendar",
  planning: "🧠 Planning",
  health: "❤️ Health",
};

const DEFAULT_TAB_ORDER: Tab[] = ["dashboard", "tracker", "paths", "oracle", "archive", "library", "cooking", "finance", "breathing", "calendar", "planning", "health"];

// ── Code splitting ─────────────────────────────────────────────
// Every module view is its own chunk, fetched when its tab is opened, when its
// tab button is hovered/focused/pressed, or ahead of time on idle (see below).
const DashboardView = lazyModule(() => import("@/components/dashboard/DashboardView"));
const PathsView = lazyModule(() => import("@/components/paths/PathsView"));
const OracleView = lazyModule(() => import("@/components/oracle/OracleView"));
const ArchiveView = lazyModule(() => import("@/components/archive/ArchiveView"));
const LibraryView = lazyModule(() => import("@/components/library/LibraryView"));
const CookingView = lazyModule(() => import("@/components/cooking/CookingView"));
const FinanceView = lazyModule(() => import("@/components/finance/FinanceView"));
const BreathingView = lazyModule(() => import("@/components/breathing/BreathingView"));
const CalendarView = lazyModule(() => import("@/components/calendar/CalendarView"));
const PlanningView = lazyModule(() => import("@/components/planning/PlanningView"));
const HealthView = lazyModule(() => import("@/components/health/HealthView"));
const OnboardingView = lazyModule(() => import("@/components/onboarding/OnboardingView"));
const QuickCaptureModal = lazyModule(() => import("@/components/archive/QuickCaptureModal"));
const SettingsModal = lazyModule(() => import("@/components/settings/SettingsModal"));
const InboxBell = lazyModule(() => import("@/components/inbox/InboxBell"));

const TAB_PRELOAD: Record<Tab, () => Promise<void>> = {
  dashboard: DashboardView.preload,
  tracker: TrackerPage.preload,
  paths: PathsView.preload,
  oracle: OracleView.preload,
  archive: ArchiveView.preload,
  library: LibraryView.preload,
  cooking: CookingView.preload,
  finance: FinanceView.preload,
  breathing: BreathingView.preload,
  calendar: CalendarView.preload,
  planning: PlanningView.preload,
  health: HealthView.preload,
};
const preloadTab = (id: Tab) => { void TAB_PRELOAD[id](); };
/** Props that fetch a tab's code as soon as the pointer or focus reaches its button. */
const preloadProps = (id: Tab) => ({
  onPointerEnter: () => preloadTab(id),
  onPointerDown: () => preloadTab(id),
  onFocus: () => preloadTab(id),
});

// A stored Supabase session means Home will render as soon as auth resolves:
// start its chunks now, in parallel with React's start, instead of after it.
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? "")) return true;
    }
  } catch { /* storage blocked */ }
  return false;
}
if (typeof window !== "undefined" && hasStoredSession()) {
  void DashboardView.preload();
  void InboxBell.preload();
}

// Which modules this browser opens most (a per-viewer convenience): the top
// ones are prefetched on idle after Home is on screen. Without history, Archive
// first (where notes are saved), then Library.
const VISITS_KEY = "mf-module-visits";
const PREFETCH_FALLBACK: Tab[] = ["archive", "library", "paths", "planning", "calendar", "finance", "health", "oracle", "cooking", "breathing", "tracker"];
function readVisits(): Partial<Record<Tab, number>> {
  try {
    const v = JSON.parse(localStorage.getItem(VISITS_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
function countVisit(tab: Tab) {
  try {
    const v = readVisits();
    v[tab] = (v[tab] ?? 0) + 1;
    localStorage.setItem(VISITS_KEY, JSON.stringify(v));
  } catch { /* storage blocked */ }
}

/** Says that some code could not be fetched (offline), with a reload: browsers do not fetch a failed module again. */
const chunkFailedToast = (what: string) =>
  toast.error(`Couldn't open ${what}. Check your connection, then reload.`, {
    action: { label: "Reload", onClick: () => void reloadIfOnline() },
  });

/**
 * The bell's button as it looks before its chunk arrives (same box, no badge).
 * If the chunk could not be fetched (offline), pressing it says so.
 */
const InboxBellPlaceholder = ({ failed }: { failed?: boolean }) =>
  failed ? (
    <button onClick={() => chunkFailedToast("the inbox")} className="relative p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10" title="Inbox" aria-label="Inbox">
      <Bell className="w-5 h-5" />
    </button>
  ) : (
    <span className="relative inline-flex p-2.5 rounded-xl glass-card text-muted-foreground" aria-hidden="true">
      <Bell className="w-5 h-5" />
    </span>
  );

/** A modal whose chunk could not be fetched closes again and says why. */
const modalLoadFailed = (what: string, close: () => void) => () => {
  close();
  chunkFailedToast(what);
};

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { needsOnboarding, loading: onboardingLoading, failed: onboardingFailed, retry: retryOnboarding, completeOnboarding } = useOnboarding();
  const quickCapture = useQuickCapture();
  const { preferences, savePreferences } = useUserSettings();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const { badgeCount, incomingRequests } = useFriends();
  useAssistantCurrentScope(TAB_TO_SCOPE[activeTab] ?? null);
  const assistant = useAssistant();
  const hotkeys = useHotkeys();
  // The tab bar follows activeTab at once; the content follows a deferred copy,
  // so a tab whose chunk is still downloading keeps the previous screen (dimmed)
  // instead of blanking it, and a heavy view renders without blocking the click.
  const contentTab = useDeferredValue(activeTab);
  const switching = contentTab !== activeTab;
  // A path to show expanded once Paths is the screen (a Planning mention, the Home strip).
  const [focusPathId, setFocusPathId] = useState<string | null>(null);
  // Each modal mounts on its first open, then stays (keeps its state, plays its close animation).
  const quickCaptureOpens = useOpenCount(quickCapture.open);
  const settingsOpens = useOpenCount(settingsOpen);

  useEffect(() => {
    if (activeTab !== "dashboard") countVisit(activeTab);
  }, [activeTab]);

  // Prefetch the likely next modules once the first screen's own chunk is in
  // and the page is idle, one at a time, so they never compete with it.
  const enabledKey = preferences.enabledModules.join(",");
  const enabledKeyRef = useRef(enabledKey);
  enabledKeyRef.current = enabledKey;
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !canPrefetch()) return;
    let cancelled = false;
    let cancel = () => {};
    const run = (queue: (() => Promise<void>)[]) => {
      const job = queue.shift();
      if (!job || cancelled) return;
      cancel = whenIdle(() => { if (!cancelled) void job().then(() => run(queue)); }, 5000);
    };
    void TAB_PRELOAD[activeTab]().then(() => {
      if (cancelled) return;
      cancel = whenIdle(() => {
        // Read at the last moment: the saved module list has loaded by now.
        const enabled = new Set(enabledKeyRef.current.split(","));
        const visits = readVisits();
        const likely = PREFETCH_FALLBACK
          .filter((t) => enabled.has(t) && t !== activeTab)
          .sort((a, b) => (visits[b] ?? 0) - (visits[a] ?? 0))
          .slice(0, 2);
        run([...likely.map((t) => TAB_PRELOAD[t]), QuickCaptureModal.preload]);
      }, 4000);
    });
    return () => { cancelled = true; cancel(); };
    // Once per signed-in user; activeTab is the screen it starts from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // The user's own shortcuts that work anywhere in the app (Settings -> Keybinds).
  useEffect(() => {
    const goTo: [string, string][] = [
      [hotkeys.goHome, "dashboard"], [hotkeys.goPaths, "paths"], [hotkeys.goArchive, "archive"], [hotkeys.goLibrary, "library"],
    ];
    const handler = (e: KeyboardEvent) => {
      if (matchesHotkey(e, hotkeys.toggleAssistant)) {
        e.preventDefault();
        if (assistant.open) assistant.setOpen(false);
        else assistant.openPanel();
        return;
      }
      const target = goTo.find(([combo]) => matchesHotkey(e, combo));
      if (target) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("lov:navigate-module", { detail: { module: target[1] } }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hotkeys, assistant]);

  // Cross-module navigation: Planning mentions and the Home strip jump to Paths,
  // and the assistant's `navigate` action opens any section or the settings.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const module = typeof detail?.module === "string" ? detail.module : "";
      if (!module) return;
      if (module === "settings") {
        setSettingsTab(typeof detail?.tab === "string" ? detail.tab : undefined);
        setSettingsOpen(true);
        return;
      }
      if (module === "tracker") {
        navigate(user ? "/tracker" : "/auth");
        return;
      }
      if (!(DEFAULT_TAB_ORDER as string[]).includes(module)) return;
      if (module !== "dashboard" && !preferences.enabledModules.includes(module)) {
        toast(`Moduł ${ALL_TAB_LABELS[module as Tab]} jest wyłączony w ustawieniach`);
        return;
      }
      setActiveTab(module as Tab);
      setMenuOpen(false);
      setMoreOpen(false);
      // Handed to PathsView by the effect below, once it is on screen.
      setFocusPathId(module === "paths" && detail.pathId ? String(detail.pathId) : null);
    };
    window.addEventListener("lov:navigate-module", handler as EventListener);
    return () => window.removeEventListener("lov:navigate-module", handler as EventListener);
  }, [navigate, user, preferences.enabledModules]);

  // Forward the path to focus once Paths is the content on screen: its chunk is in (the deferred
  // content only switches then) and it has mounted. Effects run children first, so PathsView's
  // listener is in place by the time this one runs, however long the download and render took.
  useEffect(() => {
    if (!focusPathId) return;
    if (activeTab !== "paths") {
      setFocusPathId(null);
      return;
    }
    if (contentTab !== "paths") return;
    window.dispatchEvent(new CustomEvent("lov:focus-path", { detail: { pathId: focusPathId } }));
    setFocusPathId(null);
  }, [focusPathId, activeTab, contentTab]);

  // Arriving from another route with a target module (assistant `navigate`
  // from /tracker): hand it to the listener above, then clear the state so a
  // reload does not replay it.
  useEffect(() => {
    const routed = location.state as { module?: string; tab?: string } | null;
    const module = routed?.module;
    if (!module) return;
    window.dispatchEvent(new CustomEvent("lov:navigate-module", { detail: { module, tab: routed?.tab } }));
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  // Respect saved module order
  const moduleOrder = preferences.moduleOrder;
  const TAB_ORDER: Tab[] = moduleOrder && moduleOrder.length > 0
    ? (moduleOrder.filter(id => DEFAULT_TAB_ORDER.includes(id as Tab)) as Tab[])
        .concat(DEFAULT_TAB_ORDER.filter(id => !moduleOrder.includes(id)))
    : DEFAULT_TAB_ORDER;

  // Filter tabs based on enabled modules
  const enabledModules = new Set(preferences.enabledModules);
  const visibleTabs = TAB_ORDER.filter(t => enabledModules.has(t));
  const inlineTabs = visibleTabs.slice(0, 8);
  const hasOverflow = visibleTabs.length > 8;
  const isOverflowActive = hasOverflow && !inlineTabs.includes(activeTab);

  // Split tab icons/labels for the grid
  const TAB_ICONS: Record<Tab, string> = {
    dashboard: "🎮", tracker: "📊", paths: "🪜",
    oracle: "🔮", archive: "📦", library: "📚", cooking: "🍳",
    finance: "💰", breathing: "🌬️", calendar: "📅", planning: "🧠",
    health: "❤️",
  };
  const TAB_SHORT_LABELS: Record<Tab, string> = {
    dashboard: "Home", tracker: "Stats", paths: "Paths",
    oracle: "Oracle", archive: "Archive", library: "Library", cooking: "Cooking",
    finance: "Finance", breathing: "Breathe", calendar: "Calendar", planning: "Planning",
    health: "Health",
  };

  const renderAuthGate = (feature: string, tab: Tab) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
      <p className="text-muted-foreground mb-6">Sign in to access your {feature}</p>
      <Link to="/auth" className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl gradient-purple text-primary-foreground font-bold text-lg glow-md hover:opacity-90 transition-all hover:-translate-y-1">
        🔐 Sign In
      </Link>
      {tab === "dashboard" && <GuideSection />}
    </motion.div>
  );

  // The same element objects while contentTab is unchanged, so re-rendering
  // Index (a tab highlight, a menu) does not re-render the open module.
  const tabContent = useMemo(() => {
    const on = (t: Tab) => contentTab === t && enabledModules.has(t);
    return (
      <>
        {contentTab === "dashboard" && (user ? <DashboardView /> : renderAuthGate("mission dashboard", contentTab))}
        {on("paths") && (user ? <PathsView /> : renderAuthGate("paths", contentTab))}
        {on("oracle") && (user ? <OracleView /> : renderAuthGate("oracle", contentTab))}
        {on("archive") && (user ? <ArchiveView /> : renderAuthGate("archive", contentTab))}
        {on("library") && (user ? <LibraryView /> : renderAuthGate("library", contentTab))}
        {on("cooking") && (user ? <CookingView /> : renderAuthGate("cooking studio", contentTab))}
        {on("finance") && (user ? <FinanceView /> : renderAuthGate("finance tracker", contentTab))}
        {on("breathing") && (user ? <BreathingView /> : renderAuthGate("breathing exercises", contentTab))}
        {on("calendar") && (user ? <CalendarView /> : renderAuthGate("calendar", contentTab))}
        {on("planning") && (user ? <PlanningView /> : renderAuthGate("planning board", contentTab))}
        {on("health") && (user ? <HealthView /> : renderAuthGate("health tracker", contentTab))}
      </>
    );
    // enabledModules is rebuilt each render; enabledKey is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentTab, user, enabledKey]);

  // No connection on the first read: say so, rather than run the app on
  // defaults or offer the first-run setup to an existing account.
  if (user && onboardingFailed) {
    return <OfflineNotice fullScreen onRetry={retryOnboarding} />;
  }

  // Show onboarding for new authenticated users
  if (user && !onboardingLoading && needsOnboarding) {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <OnboardingView onComplete={(cats, missions) => completeOnboarding(cats, missions)} />
      </Suspense>
    );
  }

  const handleTabClick = (id: Tab) => {
    if (id === "tracker") {
      navigate(user ? "/tracker" : "/auth");
    } else {
      setActiveTab(id);
    }
    setMenuOpen(false);
  };

  const tabButton = (id: Tab, label: string, onClick?: () => void) => (
    <button
      key={id}
      {...preloadProps(id)}
      onClick={onClick || (() => setActiveTab(id))}
      className={`px-5 py-2.5 rounded-xl text-sm whitespace-nowrap font-bold transition-all duration-300 ${
        activeTab === id
          ? "gradient-purple text-primary-foreground glow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  const contentFallback = contentTab === "dashboard" ? <HomeSkeleton /> : <ModuleSkeleton label={TAB_SHORT_LABELS[contentTab]} />;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background pattern */}
      <BackgroundPattern pattern={preferences.backgroundPattern || "none"} intensity={preferences.backgroundIntensity} />

      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none z-[1]">
        <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          {user && (
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <FriendsButton badgeCount={badgeCount} onClick={() => setFriendsOpen(true)} />
                <ChunkErrorBoundary fallback={<InboxBellPlaceholder failed />}>
                  <Suspense fallback={<InboxBellPlaceholder />}>
                    <InboxBell
                      settings={resolveInboxSettings(preferences.inbox)}
                      onSaveSettings={(inbox) => void savePreferences({ ...preferences, inbox })}
                      focusEnabled={!preferences.enabledModules.length || preferences.enabledModules.includes("monthly-focus")}
                      friendRequests={incomingRequests.length}
                      onOpenFriends={() => setFriendsOpen(true)}
                    />
                  </Suspense>
                </ChunkErrorBoundary>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onPointerEnter={() => void SettingsModal.preload()}
                  onFocus={() => void SettingsModal.preload()}
                  onClick={() => { setSettingsTab(undefined); setSettingsOpen(true); }}
                  className="p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={async () => { await signOut(); navigate("/auth"); }}
                  className="p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          <h1 className="mb-2 text-4xl font-bold text-gradient-purple">MindsetForest</h1>
          <p className="text-lg text-muted-foreground mb-6">Your Life. Your Quest.</p>

          {/* Tabs - Desktop: inline row, Mobile: tap-to-expand */}
          {isMobile ? (
            <div className="relative inline-block">
              <button
                onClick={() => setMenuOpen(prev => !prev)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10 font-bold text-sm transition-all"
              >
                <span>{ALL_TAB_LABELS[activeTab]}</span>
                <span className={`transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-1/2 -translate-x-1/2 mt-2 w-56 py-2 rounded-2xl bg-card/90 backdrop-blur-xl border border-white/10 shadow-lg z-50"
                  >
                    {visibleTabs.map(id => (
                      <button
                        key={id}
                        {...preloadProps(id)}
                        onClick={() => handleTabClick(id)}
                        className={`w-full text-left px-5 py-3 text-sm font-semibold transition-colors ${
                          activeTab === id
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        }`}
                      >
                        {ALL_TAB_LABELS[id]}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10 max-w-full scrollbar-hide">
              {inlineTabs.map(id => {
                if (id === "tracker") {
                  return tabButton(id, ALL_TAB_LABELS[id], () => {
                    if (user) navigate("/tracker");
                    else navigate("/auth");
                  });
                }
                return tabButton(id, ALL_TAB_LABELS[id]);
              })}
              {hasOverflow && (
                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={`px-4 py-2.5 rounded-xl text-sm whitespace-nowrap font-bold transition-all duration-300 ${
                        isOverflowActive || moreOpen
                          ? "gradient-purple text-primary-foreground glow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ∞
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={8}
                    className="w-auto p-3 rounded-2xl bg-card/90 backdrop-blur-xl border border-white/10 shadow-lg grid grid-cols-3 gap-2"
                  >
                    {visibleTabs.filter(id => !inlineTabs.includes(id)).map(id => (
                      <button
                        key={id}
                        {...preloadProps(id)}
                        onClick={() => {
                          handleTabClick(id);
                          setMoreOpen(false);
                        }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all text-center min-w-[72px] ${
                          activeTab === id
                            ? "gradient-purple text-primary-foreground glow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        }`}
                      >
                        <span className="text-2xl">{TAB_ICONS[id]}</span>
                        <span className="text-[11px] font-semibold leading-tight">{TAB_SHORT_LABELS[id]}</span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}
        </motion.div>

        {/* Tab Content. Dimmed only if the next tab takes a moment (its chunk is still downloading). */}
        <div
          className={`transition-opacity ${switching ? "opacity-60 duration-200 delay-150" : "duration-0"}`}
          aria-busy={switching || undefined}
        >
          {/* Offline, a module whose code is not in yet says so; the header and the other tabs keep working. */}
          <ChunkErrorBoundary
            resetKey={contentTab}
            pending={contentFallback}
            fallback={<ChunkRetry what={contentTab === "dashboard" ? "Home" : TAB_SHORT_LABELS[contentTab]} />}
          >
            <Suspense fallback={contentFallback}>
              {tabContent}
            </Suspense>
          </ChunkErrorBoundary>
        </div>
      </div>

      {/* Global Quick Capture. Ctrl/Cmd+N. Each modal mounts on its first open, then stays. */}
      {user && quickCaptureOpens > 0 && (
        <ChunkErrorBoundary fallback={null} resetKey={quickCaptureOpens} onChunkError={modalLoadFailed("Quick capture", quickCapture.close)}>
          <Suspense fallback={null}>
            <QuickCaptureModal open={quickCapture.open} onClose={quickCapture.close} />
          </Suspense>
        </ChunkErrorBoundary>
      )}
      {user && settingsOpens > 0 && (
        <ChunkErrorBoundary fallback={null} resetKey={settingsOpens} onChunkError={modalLoadFailed("Settings", () => setSettingsOpen(false))}>
          <Suspense fallback={null}>
            <SettingsModal open={settingsOpen} initialTab={settingsTab} onClose={() => setSettingsOpen(false)} />
          </Suspense>
        </ChunkErrorBoundary>
      )}
      {user && <FriendsPanel open={friendsOpen} onOpenChange={setFriendsOpen} />}
    </div>
  );
};

export default Index;
