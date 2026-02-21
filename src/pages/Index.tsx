import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import DashboardView from "@/components/dashboard/DashboardView";
import LadderView from "@/components/ladder/LadderView";
import HabitLoopView from "@/components/habitloop/HabitLoopView";

type Tab = "dashboard" | "tracker" | "ladder" | "habitloop";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const tabButton = (id: Tab, label: string, onClick?: () => void) => (
    <button
      key={id}
      onClick={onClick || (() => setActiveTab(id))}
      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
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

          {/* Tabs */}
          <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10">
            {tabButton("dashboard", "🎮 Dashboard")}
            {tabButton("tracker", "📊 Stats Tracker", () => {
              if (user) navigate("/tracker");
              else navigate("/auth");
            })}
            {tabButton("ladder", "🪜 Next Action Ladder")}
            {tabButton("habitloop", "🔄 Habit Loop")}
          </div>
        </motion.div>

        {/* Tab Content */}
        {activeTab === "dashboard" && (user ? <DashboardView /> : renderAuthGate("mission dashboard"))}
        {activeTab === "ladder" && (user ? <LadderView /> : renderAuthGate("mastery ladder"))}
        {activeTab === "habitloop" && (user ? <HabitLoopView /> : renderAuthGate("habit loops"))}
      </div>
    </div>
  );
};

export default Index;
