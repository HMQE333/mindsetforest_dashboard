import { useState } from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, Layers, Zap, Map, Sparkles } from "lucide-react";
import PlanningBoards from "./PlanningBoards";
import PlanningStack from "./PlanningStack";
import PlanningActions from "./PlanningActions";
import PlanningMap from "./PlanningMap";
import PlanningSimulation from "./PlanningSimulation";

type SubView = "boards" | "stack" | "actions" | "map" | "simulation";

const navItems: { mode: SubView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: "boards", label: "Boards", icon: LayoutDashboard },
  { mode: "stack", label: "Stack", icon: Layers },
  { mode: "actions", label: "Actions", icon: Zap },
  { mode: "map", label: "Map", icon: Map },
  { mode: "simulation", label: "Simulation", icon: Sparkles },
];

export default function PlanningView() {
  const [view, setView] = useState<SubView>("boards");
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);

  const openBoard = (id: string) => {
    setActiveBoardId(id);
    setView("stack");
  };

  const backToBoards = () => {
    setActiveBoardId(null);
    setView("boards");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Sub-nav */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-muted/50 backdrop-blur-lg border border-white/10 w-fit mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = view === item.mode;
          const disabled = item.mode !== "boards" && !activeBoardId;
          return (
            <button
              key={item.mode}
              disabled={disabled}
              onClick={() => {
                if (item.mode === "boards") { backToBoards(); return; }
                setView(item.mode);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                isActive
                  ? "gradient-purple text-primary-foreground glow-sm"
                  : disabled
                    ? "text-muted-foreground/40 cursor-not-allowed"
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
      {view === "boards" && <PlanningBoards onOpenBoard={openBoard} />}
      {view === "stack" && activeBoardId && (
        <PlanningStack boardId={activeBoardId} onBack={backToBoards} />
      )}
      {view === "stack" && !activeBoardId && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Open a board to see its stack.
        </div>
      )}
      {view === "actions" && <PlanningActions boardId={activeBoardId} onBack={backToBoards} />}
      {view === "map" && activeBoardId && <PlanningMap boardId={activeBoardId} onBack={backToBoards} />}
      {view === "simulation" && <PlanningSimulation boardId={activeBoardId} onBack={backToBoards} />}
      {view === "map" && !activeBoardId && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Open a board to see its map.
        </div>
      )}
    </motion.div>
  );
}
