import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useUserSettings } from "@/hooks/useUserSettings";
import CategoriesTab from "./CategoriesTab";
import MetricsTab from "./MetricsTab";
import RewardsTab from "./RewardsTab";
import ModulesTab from "./ModulesTab";
import ProjectsTab from "./ProjectsTab";
import ThemeTab from "./ThemeTab";
import KeybindsTab from "./KeybindsTab";

type SettingsTab = "modules" | "theme" | "keybinds" | "categories" | "projects" | "metrics" | "rewards";

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: "modules", label: "Modules", icon: "🧩" },
  { id: "theme", label: "Theme", icon: "🎨" },
  { id: "keybinds", label: "Keybinds", icon: "⌨️" },
  { id: "categories", label: "Pillars", icon: "🏛️" },
  { id: "projects", label: "Projects", icon: "📂" },
  { id: "metrics", label: "Metrics", icon: "📊" },
  { id: "rewards", label: "Rewards", icon: "🎁" },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("modules");
  const settings = useUserSettings();

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-lg max-h-[85vh] bg-card/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h2 className="text-lg font-bold text-foreground">⚙️ Settings</h2>
              <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="relative">
              <div className="flex gap-1 px-5 pt-3 overflow-x-auto scrollbar-none pb-0.5">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? "gradient-purple text-primary-foreground glow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              {/* Scroll hint gradient */}
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-card/95 to-transparent" />
            </div>

            {/* Content */}
            <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(85vh - 120px)" }}>
              {settings.loading ? (
                <div className="text-center py-10 text-muted-foreground animate-pulse">Loading...</div>
              ) : (
                <>
                  {activeTab === "modules" && (
                    <ModulesTab
                      enabledModules={settings.preferences.enabledModules}
                      onSave={settings.saveEnabledModules}
                    />
                  )}
                  {activeTab === "theme" && (
                    <ThemeTab
                      currentTheme={settings.preferences.theme || "dark"}
                      currentAccent={settings.preferences.accentColor || "purple"}
                      onSave={settings.saveTheme}
                    />
                  )}
                  {activeTab === "keybinds" && (
                    <KeybindsTab
                      customKeybinds={settings.preferences.customKeybinds}
                      onSave={settings.saveKeybinds}
                    />
                  )}
                  {activeTab === "categories" && (
                    <CategoriesTab
                      customCategories={settings.customCategories}
                      onSave={settings.saveCategories}
                    />
                  )}
                  {activeTab === "metrics" && (
                    <MetricsTab
                      userMetrics={settings.userMetrics}
                      onSave={settings.saveMetrics}
                      onReset={settings.resetMetricsToDefaults}
                    />
                  )}
                  {activeTab === "projects" && (
                    <ProjectsTab />
                  )}
                  {activeTab === "rewards" && (
                    <RewardsTab
                      customRewards={settings.customRewards}
                      onSave={settings.saveRewards}
                      onReset={settings.resetRewardsToDefaults}
                    />
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
