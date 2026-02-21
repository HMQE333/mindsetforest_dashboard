import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import DashboardView from "@/components/dashboard/DashboardView";
import LadderView from "@/components/ladder/LadderView";
import HabitLoopView from "@/components/habitloop/HabitLoopView";
import OracleView from "@/components/oracle/OracleView";

type Tab = "dashboard" | "tracker" | "ladder" | "habitloop" | "oracle";

const TAB_LABELS: Record<Tab, string> = {
  dashboard: "🎮 Home",
  tracker: "📊 Stats",
  ladder: "🪜 Ladder",
  habitloop: "🔄 Habit Loop",
  oracle: "🔮 Oracle",
};

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

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
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-cat-spirit/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl gradient-purple border-2 border-primary/40 glow-md animate-pulse-glow mb-4">
            <span className="text-2xl animate-fire">🔥</span>
            <span className="text-lg font-bold text-primary-foreground">Gamified Productivity</span>
          </div>

          <h1 className="mb-2 text-4xl font-bold text-gradient-purple">MindsetForest</h1>
          <p className="text-lg text-muted-foreground mb-6">Track. Grind. Level Up.</p>

          {/* Tabs - Desktop: inline row, Mobile: tap-to-expand */}
          {isMobile ? (
            <div className="relative inline-block">
              <button
                onClick={() => setMenuOpen(prev => !prev)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10 font-bold text-sm transition-all"
              >
                <span>{TAB_LABELS[activeTab]}</span>
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
                    {(Object.keys(TAB_LABELS) as Tab[]).map(id => (
                      <button
                        key={id}
                        onClick={() => handleTabClick(id)}
                        className={`w-full text-left px-5 py-3 text-sm font-semibold transition-colors ${
                          activeTab === id
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                        }`}
                      >
                        {TAB_LABELS[id]}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10">
              {tabButton("dashboard", "🎮 Home")}
              {tabButton("tracker", "📊 Stats", () => {
                if (user) navigate("/tracker");
                else navigate("/auth");
              })}
              {tabButton("ladder", "🪜 Ladder")}
              {tabButton("habitloop", "🔄 Habit Loop")}
              {tabButton("oracle", "🔮 Oracle")}
            </div>
          )}
        </motion.div>

        {/* Tab Content */}
        {activeTab === "dashboard" && (user ? <DashboardView /> : renderAuthGate("mission dashboard"))}
        {activeTab === "ladder" && (user ? <LadderView /> : renderAuthGate("mastery ladder"))}
        {activeTab === "habitloop" && (user ? <HabitLoopView /> : renderAuthGate("habit loops"))}
        {activeTab === "oracle" && (user ? <OracleView /> : renderAuthGate("oracle"))}
      </div>
    </div>
  );
};

export default Index;
