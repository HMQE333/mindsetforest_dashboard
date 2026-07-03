import { useState } from "react";
import { motion } from "framer-motion";
import { FolderKanban, Layers, Zap, Map } from "lucide-react";
import PlanningPortfolio from "./PlanningPortfolio";
import PlanningStack from "./PlanningStack";
import PlanningActions from "./PlanningActions";
import PlanningMap from "./PlanningMap";

type SubView = "portfolio" | "stack" | "actions" | "map";

const navItems: { mode: SubView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "portfolio", label: "Portfolio", icon: FolderKanban },
  { mode: "stack", label: "Stack", icon: Layers },
  { mode: "actions", label: "Actions", icon: Zap },
  { mode: "map", label: "Map", icon: Map },
];

export default function PlanningView() {
  const [view, setView] = useState<SubView>("portfolio");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const openProject = (id: string) => {
    setActiveProjectId(id);
    setView("stack");
  };

  const backToPortfolio = () => {
    setActiveProjectId(null);
    setView("portfolio");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Sub-nav */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10 w-fit mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = view === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => {
                setView(item.mode);
                if (item.mode !== "stack") setActiveProjectId(null);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                isActive
                  ? "gradient-purple text-primary-foreground glow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {view === "portfolio" && <PlanningPortfolio onOpenProject={openProject} />}
      {view === "stack" && activeProjectId && (
        <PlanningStack projectId={activeProjectId} onBack={backToPortfolio} />
      )}
      {view === "stack" && !activeProjectId && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Select a project from Portfolio to see its stack.
        </div>
      )}
      {view === "actions" && <PlanningActions onOpenProject={openProject} />}
      {view === "map" && <PlanningMap initialProjectId={activeProjectId} onBack={backToPortfolio} />}
    </motion.div>
  );
}
