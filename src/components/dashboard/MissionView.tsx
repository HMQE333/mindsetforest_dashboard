import { motion, AnimatePresence } from "framer-motion";
import { CATEGORIES, Mission } from "@/lib/dashboard-data";
import { DashboardState } from "@/hooks/useDashboardState";

interface MissionViewProps {
  categoryId: string;
  state: DashboardState;
  getMissions: (categoryId: string) => Mission[];
  onComplete: (categoryId: string, index: number, xp: number) => void;
  onBack: () => void;
  onEdit: () => void;
  onAI: () => void;
}

export default function MissionView({ categoryId, state, getMissions, onComplete, onBack, onEdit, onAI }: MissionViewProps) {
  const category = CATEGORIES.find(c => c.id === categoryId)!;
  const missions = getMissions(categoryId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <div
        className="glass-card p-6 mb-6 flex items-center gap-5 flex-wrap justify-between"
        style={{ borderColor: category.color, borderWidth: 2 }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            className="glass-card px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground hover:-translate-x-1 transition-all"
          >
            ← Back
          </button>
          <span
            className="text-4xl"
            style={{ filter: `drop-shadow(0 0 15px ${category.color})` }}
          >
            {category.icon}
          </span>
          <div>
            <h2 className="text-2xl font-bold" style={{ color: category.color }}>
              {category.name}
            </h2>
            <p className="text-sm text-foreground/70">{category.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAI}
            className="relative px-3 py-2 rounded-xl border border-primary/30 bg-primary/10 text-foreground hover:bg-primary/20 hover:border-primary/45 transition-all hover:-translate-y-0.5 backdrop-blur-lg"
            title="AI suggestions"
          >
            <span className="text-lg" style={{ filter: "drop-shadow(0 0 12px hsl(var(--primary) / 0.55))" }}>✨</span>
            <span className="absolute -top-1.5 -right-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-white/15 border border-white/25 text-white/90 backdrop-blur-md">
              AI
            </span>
          </button>
          <button
            onClick={onEdit}
            className="px-4 py-2 rounded-full bg-white/[0.09] border border-white/25 text-accent-foreground text-sm flex items-center gap-1.5 hover:bg-primary/20 hover:border-primary/70 transition-all"
          >
            ✏️ Edit tasks
          </button>
        </div>
      </div>

      {/* Mission Cards */}
      <div className="grid gap-5">
        {missions.map((mission, index) => {
          const missionId = `${categoryId}-${index}`;
          const isCompleted = state.completedMissions.has(missionId);

          return (
            <motion.div
              key={missionId}
              className={`glass-card p-6 transition-all duration-300 border-2 relative overflow-hidden ${
                isCompleted
                  ? "opacity-60 border-white/10"
                  : "hover:border-white/20 hover:translate-x-2 hover:shadow-lg"
              }`}
              style={isCompleted ? { borderColor: category.color, background: `linear-gradient(135deg, ${category.color}15, transparent)` } : {}}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-foreground mb-2">{mission.title}</h4>
                  <p className="text-sm text-foreground/70 mb-3 leading-relaxed">{mission.description}</p>
                  <div className="flex gap-4 text-sm">
                    <span className="text-foreground/60 flex items-center gap-1">⏱️ {mission.duration}</span>
                    <span className="font-bold flex items-center gap-1" style={{ color: category.color }}>
                      ⭐ +{mission.xp} XP
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => !isCompleted && onComplete(categoryId, index, mission.xp)}
                  className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                    isCompleted
                      ? "text-white text-xl font-bold"
                      : "bg-white/5 hover:scale-110"
                  }`}
                  style={{
                    borderColor: category.color,
                    backgroundColor: isCompleted ? category.color : undefined,
                  }}
                  disabled={isCompleted}
                >
                  {isCompleted && "✓"}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
