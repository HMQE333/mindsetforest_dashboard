import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Dice5, PencilLine, CalendarClock, Scissors, ArrowLeft } from "lucide-react";
import { CATEGORIES, Mission } from "@/lib/dashboard-data";
import { DashboardState, useDashboardState } from "@/hooks/useDashboardState";
import { toast } from "sonner";
import { DEFER_LIMIT, needsDecision } from "@/lib/mission-defer";
import { useUserSettings } from "@/hooks/useUserSettings";
import PillarIcon from "@/components/shared/PillarIcon";
import { supabase } from "@/integrations/supabase/client";

interface ProjectInfo {
  name: string;
  emoji: string;
}

interface MissionViewProps {
  categoryId: string;
  state: DashboardState;
  getMissions: (categoryId: string) => Mission[];
  onComplete: (categoryId: string, index: number, xp: number) => void;
  onSplit: (categoryId: string, index: number, subTasks: Mission[]) => void;
  onReroll: (categoryId: string, index: number) => void;
  onBack: () => void;
  onEdit: () => void;
  projectInfo?: ProjectInfo | null;
}

export default function MissionView({ categoryId, state, getMissions, onComplete, onSplit, onReroll, onBack, onEdit, projectInfo }: MissionViewProps) {
  const { getCategories } = useUserSettings();
  const categories = getCategories();
  const category = categories.find(c => c.id === categoryId);
  const displayName = projectInfo?.name || category?.name || categoryId;
  const displayIcon = category?.icon || "📁";
  const displayIconUrl = category?.iconUrl;
  const displayColor = category?.color || "#8B5CF6";
  const displayTagline = projectInfo ? "Project" : category?.tagline || "";
  const missions = getMissions(categoryId);
  const [splittingIndex, setSplittingIndex] = useState<number | null>(null);
  const { getSnoozed, deferMission, undeferMission, removeMission } = useDashboardState();
  const snoozed = getSnoozed(categoryId);
  // The card whose "Tomorrow" asked what to do (pushed DEFER_LIMIT times already).
  const [deciding, setDeciding] = useState<number | null>(null);

  const defer = (index: number, title: string, keep = false) => {
    setDeciding(null);
    deferMission(categoryId, index, keep);
    toast(`Moved to tomorrow: ${title}`, {
      className: "[overflow-wrap:anywhere]",
      action: { label: "Undo", onClick: () => undeferMission(categoryId, index) },
    });
  };

  const handleSplit = async (index: number, mission: Mission) => {
    setSplittingIndex(index);
    try {
      const { data, error } = await supabase.functions.invoke("ai-split-task", {
        body: { title: mission.title, description: mission.description, duration: mission.duration, xp: mission.xp },
      });
      if (error) throw error;
      const subtasks = (data?.subtasks || []) as Mission[];
      if (subtasks.length > 0) {
        onSplit(categoryId, index, subtasks);
      }
    } catch (e) {
      console.error("Split failed:", e);
    } finally {
      setSplittingIndex(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header: one row at every width (phone, watch): back, icon, name, edit. */}
      <div
        className="glass-card p-3 sm:p-6 mb-4 sm:mb-6 flex items-center gap-2.5 sm:gap-4"
        style={{ borderColor: displayColor, borderWidth: 2 }}
      >
        <button
          onClick={onBack}
          className="shrink-0 h-9 sm:h-10 min-w-9 sm:min-w-10 px-2 sm:px-4 rounded-xl border border-white/15 bg-white/[0.05] text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-white/10 hover:-translate-x-0.5 transition-all flex items-center justify-center gap-1.5"
          aria-label="Back"
          title="Back"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Back</span>
        </button>
        <span className="shrink-0 hidden min-[260px]:inline-flex" style={{ filter: `drop-shadow(0 0 12px ${displayColor})` }}>
          {projectInfo ? (
            <span className="text-3xl sm:text-4xl leading-none">{projectInfo.emoji}</span>
          ) : (
            <>
              <span className="sm:hidden"><PillarIcon icon={displayIcon} iconUrl={displayIconUrl} size={34} /></span>
              <span className="hidden sm:inline"><PillarIcon icon={displayIcon} iconUrl={displayIconUrl} size={48} /></span>
            </>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg sm:text-2xl font-bold leading-tight truncate" style={{ color: displayColor }}>
            {displayName}
          </h2>
          {displayTagline && <p className="text-xs sm:text-sm text-foreground/60 truncate">{displayTagline}</p>}
        </div>
        <button
          onClick={onEdit}
          className="shrink-0 h-9 w-9 sm:h-10 sm:w-10 rounded-xl border border-white/20 bg-white/[0.07] flex items-center justify-center hover:bg-primary/20 hover:border-primary/45 transition-all"
          title="Edit tasks"
          aria-label="Edit tasks"
        >
          <PencilLine className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-foreground/80" />
        </button>
      </div>

      {/* Mission Cards */}
      <div className="grid gap-3 sm:gap-5">
        {missions.map((baseMission, displayIdx) => {
          const index = baseMission.__originalIndex ?? displayIdx;
          const missionId = `${categoryId}-${index}`;
          const isCompleted = state.completedMissions.has(missionId);
          const hasVariants = !!(baseMission.variants && baseMission.variants.length > 0);
          const rolledIdx = state.rolledVariants[missionId] ?? 0;
          const variant = hasVariants ? baseMission.variants![Math.min(rolledIdx, baseMission.variants!.length - 1)] : null;
          const mission: Mission = variant
            ? { ...baseMission, title: variant.title, description: variant.description, duration: variant.duration, xp: variant.xp, url: variant.url }
            : baseMission;
          const hasSchedule = !!(baseMission.daysOfWeek && baseMission.daysOfWeek.length > 0 && baseMission.daysOfWeek.length < 7);

          return (
            <motion.div
              key={missionId}
              className={`glass-card p-4 sm:p-6 transition-all duration-300 border-2 relative overflow-hidden ${
                isCompleted
                  ? "opacity-60 border-white/10"
                  : "hover:border-white/20 hover:translate-x-2 hover:shadow-lg"
              }`}
              style={isCompleted ? { borderColor: displayColor, background: `linear-gradient(135deg, ${displayColor}15, transparent)` } : {}}
            >
              {hasVariants && (
                <div className="absolute top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-[10px] font-semibold text-primary/90 backdrop-blur-md">
                  <Dice5 className="h-3 w-3" />
                  <span>1 of {baseMission.variants!.length}</span>
                </div>
              )}
              {hasSchedule && (
                <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/20 border border-accent/40 text-[10px] font-semibold text-accent-foreground backdrop-blur-md">
                  📅 <span>{formatDays(baseMission.daysOfWeek!)}</span>
                </div>
              )}
              <div className="flex flex-col min-[340px]:flex-row justify-between items-stretch min-[340px]:items-start gap-3 sm:gap-4">
                <div className={`flex-1 min-w-0 ${hasVariants || hasSchedule ? "pt-5" : ""}`}>
                  <h4 className="text-base sm:text-lg font-semibold text-foreground mb-1.5 sm:mb-2 [overflow-wrap:anywhere]">
                    {mission.title}
                    {!!baseMission.deferrals && !isCompleted && (
                      <span
                        className={`ml-2 align-middle text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${baseMission.deferrals >= DEFER_LIMIT ? "border-amber-400/50 bg-amber-400/15 text-amber-200" : "border-white/15 bg-white/[0.06] text-foreground/60"}`}
                        title={`Moved to the next day ${baseMission.deferrals}×`}
                      >
                        ↷{baseMission.deferrals}
                      </span>
                    )}
                  </h4>
                  <p className="text-sm text-foreground/70 mb-2 sm:mb-3 leading-relaxed [overflow-wrap:anywhere]">{mission.description}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {mission.duration && mission.duration !== "." && (
                      <span className="text-foreground/60 flex items-center gap-1">⏱️ {mission.duration}</span>
                    )}
                    <span className="font-bold flex items-center gap-1" style={{ color: displayColor }}>
                      ⭐ +{mission.xp} XP
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-shrink-0">
                  {hasVariants && !isCompleted && (
                    <button
                      onClick={() => onReroll(categoryId, index)}
                      className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center hover:bg-primary/15 hover:border-primary/30 transition-all group"
                      title="Reroll variant"
                    >
                      <Dice5 className="h-4 w-4 text-foreground/50 group-hover:text-primary transition-colors" />
                    </button>
                  )}
                  {mission.url && (
                    <button
                      onClick={() => window.open(mission.url!.startsWith("http") ? mission.url! : `https://${mission.url!}`, "_blank", "noopener,noreferrer")}
                      className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center hover:bg-white/[0.12] hover:border-white/[0.2] transition-all group"
                      title="Open linked URL"
                    >
                      <Paperclip className="h-4 w-4 text-foreground/50 group-hover:text-foreground/80 transition-colors" />
                    </button>
                  )}
                  {!isCompleted && (
                    <button
                      onClick={() => (needsDecision(baseMission) ? setDeciding(deciding === index ? null : index) : defer(index, mission.title))}
                      className="w-8 h-8 rounded-lg border-2 border-white/15 bg-white/5 flex items-center justify-center hover:bg-primary/15 hover:border-primary/30 transition-all text-sm text-foreground/70"
                      title="Move to tomorrow"
                      aria-label="Move to tomorrow"
                    >
                      <CalendarClock className="h-4 w-4" />
                    </button>
                  )}
                  {!isCompleted && (
                    <button
                      onClick={() => handleSplit(index, mission)}
                      disabled={splittingIndex === index}
                      className="w-8 h-8 rounded-lg border-2 border-white/15 bg-white/5 flex items-center justify-center hover:bg-primary/15 hover:border-primary/30 transition-all text-sm"
                      title="Split into smaller tasks"
                    >
                      {splittingIndex === index ? (
                        <span className="animate-spin text-xs">⏳</span>
                      ) : (
                        <Scissors className="h-4 w-4 text-foreground/70" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => !isCompleted && onComplete(categoryId, index, mission.xp)}
                    className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
                      isCompleted
                        ? "text-white text-xl font-bold"
                        : "bg-white/5 hover:scale-110"
                    }`}
                    style={{
                      borderColor: displayColor,
                      backgroundColor: isCompleted ? displayColor : undefined,
                    }}
                    disabled={isCompleted}
                  >
                    {isCompleted && "✓"}
                  </button>
                </div>
              </div>
              {deciding === index && !isCompleted && (
                <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground/70 mr-1">Moved {baseMission.deferrals ?? 0}× already. Too big, unclear, or not needed?</span>
                  <button
                    onClick={() => { setDeciding(null); void handleSplit(index, mission); }}
                    className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-primary/15 hover:border-primary/30 transition-all"
                  >
                    <Scissors className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />Make it smaller
                  </button>
                  <button
                    onClick={() => { setDeciding(null); removeMission(categoryId, index); toast(`Removed: ${mission.title}`, { className: "[overflow-wrap:anywhere]" }); }}
                    className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-red-500/15 hover:border-red-400/40 transition-all"
                  >
                    🗑️ Drop it
                  </button>
                  <button
                    onClick={() => defer(index, mission.title, true)}
                    className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    Keep · tomorrow
                  </button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {snoozed.length > 0 && (
        <div className="mt-5 text-sm text-foreground/60 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> For tomorrow:</span>
          {snoozed.map((m) => (
            <button
              key={m.__originalIndex}
              onClick={() => undeferMission(categoryId, m.__originalIndex)}
              className="px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 hover:text-foreground transition-all max-w-full truncate"
              title="Bring back to today"
            >
              {m.title} ↩
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatDays(days: number[]): string {
  if (days.length === 0 || days.length === 7) return "Every day";
  const sorted = [...days].sort((a, b) => a - b);
  const isWeekdays = sorted.length === 5 && sorted.every(d => d >= 1 && d <= 5);
  if (isWeekdays) return "Weekdays";
  const isWeekends = sorted.length === 2 && sorted.includes(0) && sorted.includes(6);
  if (isWeekends) return "Weekends";
  return sorted.map(d => DAY_SHORT[d]).join("·");
}
