import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useQuickCapture } from "@/hooks/useQuickCapture";
import { useUserSettings } from "@/hooks/useUserSettings";
import DashboardView from "@/components/dashboard/DashboardView";
import LadderView from "@/components/ladder/LadderView";
import HabitLoopView from "@/components/habitloop/HabitLoopView";
import OracleView from "@/components/oracle/OracleView";
import OnboardingView from "@/components/onboarding/OnboardingView";
import GuideSection from "@/components/landing/GuideSection";
import ArchiveView from "@/components/archive/ArchiveView";
import LibraryView from "@/components/library/LibraryView";
import CookingView from "@/components/cooking/CookingView";
import FinanceView from "@/components/finance/FinanceView";
import BreathingView from "@/components/breathing/BreathingView";
import CalendarView from "@/components/calendar/CalendarView";
import PlanningView from "@/components/planning/PlanningView";
import HealthView from "@/components/health/HealthView";
import QuickCaptureModal from "@/components/archive/QuickCaptureModal";
import SettingsModal from "@/components/settings/SettingsModal";
import BackgroundPattern from "@/components/BackgroundPattern";
import FriendsButton from "@/components/friends/FriendsButton";
import FriendsPanel from "@/components/friends/FriendsPanel";
import { useFriends } from "@/hooks/useFriends";
import { useAssistantCurrentScope } from "@/hooks/useAssistant";
import type { ScopeId } from "@/lib/assistant-context";

type Tab = "dashboard" | "tracker" | "ladder" | "habitloop" | "oracle" | "archive" | "library" | "cooking" | "finance" | "breathing" | "calendar" | "planning" | "health";

const TAB_TO_SCOPE: Partial<Record<Tab, ScopeId>> = {
  dashboard: "dashboard",
  tracker: "tracker",
  ladder: "ladder",
  habitloop: "habitloop",
  oracle: "oracle",
  finance: "finance",
  planning: "planning",
  health: "health",
};

const ALL_TAB_LABELS: Record<Tab, string> = {
  dashboard: "🎮 Home",
  tracker: "📊 Stats",
  ladder: "🪜 Ladder",
  habitloop: "🔄 Habit Loop",
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

const DEFAULT_TAB_ORDER: Tab[] = ["dashboard", "tracker", "ladder", "habitloop", "oracle", "archive", "library", "cooking", "finance", "breathing", "calendar", "planning", "health"];

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { needsOnboarding, loading: onboardingLoading, completeOnboarding } = useOnboarding();
  const quickCapture = useQuickCapture();
  const { preferences } = useUserSettings();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const { badgeCount } = useFriends();
  useAssistantCurrentScope(TAB_TO_SCOPE[activeTab] ?? null);

  // Cross-module navigation: Planning Map "mentions" trigger jumps to Ladder/Habit Loop.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.module) return;
      if (detail.module === "ladder") {
        setActiveTab("ladder");
        // Forward to LadderView once it mounts.
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("lov:set-ladder-category", {
            detail: { categoryId: detail.categoryId, level: detail.level },
          }));
        }, 50);
      } else if (detail.module === "habitloop") {
        setActiveTab("habitloop");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("lov:set-loop-category", {
            detail: { categoryId: detail.categoryId, loopIndex: detail.loopIndex },
          }));
        }, 50);
      }
    };
    window.addEventListener("lov:navigate-module", handler as EventListener);
    return () => window.removeEventListener("lov:navigate-module", handler as EventListener);
  }, []);

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
    dashboard: "🎮", tracker: "📊", ladder: "🪜", habitloop: "🔄",
    oracle: "🔮", archive: "📦", library: "📚", cooking: "🍳",
    finance: "💰", breathing: "🌬️", calendar: "📅", planning: "🧠",
    health: "❤️",
  };
  const TAB_SHORT_LABELS: Record<Tab, string> = {
    dashboard: "Home", tracker: "Stats", ladder: "Ladder", habitloop: "Habit Loop",
    oracle: "Oracle", archive: "Archive", library: "Library", cooking: "Cooking",
    finance: "Finance", breathing: "Breathe", calendar: "Calendar", planning: "Planning",
    health: "Health",
  };

  // Show onboarding for new authenticated users
  if (user && !onboardingLoading && needsOnboarding) {
    return <OnboardingView onComplete={(cats, missions) => completeOnboarding(cats, missions)} />;
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

  const renderAuthGate = (feature: string) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
      <p className="text-muted-foreground mb-6">Sign in to access your {feature}</p>
      <Link to="/auth" className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl gradient-purple text-primary-foreground font-bold text-lg glow-md hover:opacity-90 transition-all hover:-translate-y-1">
        🔐 Sign In
      </Link>
      {activeTab === "dashboard" && <GuideSection />}
    </motion.div>
  );

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
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2.5 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-all hover:bg-white/10"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
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

        {/* Tab Content */}
        {activeTab === "dashboard" && (user ? <DashboardView /> : renderAuthGate("mission dashboard"))}
        {activeTab === "ladder" && enabledModules.has("ladder") && (user ? <LadderView /> : renderAuthGate("mastery ladder"))}
        {activeTab === "habitloop" && enabledModules.has("habitloop") && (user ? <HabitLoopView /> : renderAuthGate("habit loops"))}
        {activeTab === "oracle" && enabledModules.has("oracle") && (user ? <OracleView /> : renderAuthGate("oracle"))}
        {activeTab === "archive" && enabledModules.has("archive") && (user ? <ArchiveView /> : renderAuthGate("archive"))}
        {activeTab === "library" && enabledModules.has("library") && (user ? <LibraryView /> : renderAuthGate("library"))}
        {activeTab === "cooking" && enabledModules.has("cooking") && (user ? <CookingView /> : renderAuthGate("cooking studio"))}
        {activeTab === "finance" && enabledModules.has("finance") && (user ? <FinanceView /> : renderAuthGate("finance tracker"))}
        {activeTab === "breathing" && enabledModules.has("breathing") && (user ? <BreathingView /> : renderAuthGate("breathing exercises"))}
        {activeTab === "calendar" && enabledModules.has("calendar") && (user ? <CalendarView /> : renderAuthGate("calendar"))}
        {activeTab === "planning" && enabledModules.has("planning") && (user ? <PlanningView /> : renderAuthGate("planning board"))}
        {activeTab === "health" && enabledModules.has("health") && (user ? <HealthView /> : renderAuthGate("health tracker"))}
      </div>

      {/* Global Quick Capture — Ctrl/Cmd+N */}
      {user && <QuickCaptureModal open={quickCapture.open} onClose={quickCapture.close} />}
      {user && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      {user && <FriendsPanel open={friendsOpen} onOpenChange={setFriendsOpen} />}
    </div>
  );
};

export default Index;
