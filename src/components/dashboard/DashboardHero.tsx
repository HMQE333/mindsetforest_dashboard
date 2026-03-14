import { motion } from "framer-motion";
import { DashboardState } from "@/hooks/useDashboardState";
import { HeroLayout } from "@/hooks/useUserSettings";

interface DashboardHeroProps {
  state: DashboardState;
  onResetDay: () => void;
  onShowShortcuts: () => void;
  heroLayout?: HeroLayout;
  extraActions?: React.ReactNode;
}

const stats = (state: DashboardState) => [
  { value: state.currentXP, label: "Total XP" },
  { value: state.missionsCompleted, label: "Missions Done" },
  { value: state.categoriesEngaged.size, label: "Categories" },
];

function ActionButtons({ onResetDay, onShowShortcuts, extraActions }: { onResetDay: () => void; onShowShortcuts: () => void; extraActions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3">
      {extraActions}
      <button onClick={onResetDay} className="glass-card px-6 py-3 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors" title="Click to reset today's progress">
        🔄 Reset Day
      </button>
      <button onClick={onShowShortcuts} className="glass-card px-4 py-3 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors" title="Keyboard shortcuts (?)">
        ⌨️
      </button>
    </div>
  );
}

// ─── DEFAULT ───
function HeroDefault({ state, onResetDay, onShowShortcuts, extraActions }: Omit<DashboardHeroProps, "heroLayout">) {
  const xpForLevel = state.currentXP % 100;
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="text-center mb-8">
      <div className="inline-flex items-center gap-3 px-8 py-4 rounded-3xl gradient-purple border-2 border-primary/40 glow-md animate-pulse-glow mb-6">
        <span className="text-3xl animate-fire">🔥</span>
        <span className="text-xl font-bold text-primary-foreground">{state.streakDays} Day Streak</span>
      </div>
      <div className="max-w-[600px] mx-auto mb-8">
        <div className="flex justify-between items-center mb-3">
          <span className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-base font-bold glow-sm">Level {state.currentLevel}</span>
          <span className="text-accent-foreground font-semibold">{xpForLevel} / 100 XP</span>
        </div>
        <div className="h-6 bg-primary/10 rounded-xl border-2 border-primary/30 overflow-hidden relative">
          <motion.div className="h-full gradient-purple rounded-xl relative overflow-hidden" initial={{ width: 0 }} animate={{ width: `${xpForLevel}%` }} transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}>
            <div className="absolute inset-0 animate-shimmer" />
          </motion.div>
        </div>
      </div>
      <div className="flex justify-center gap-6 flex-wrap mb-6">
        {stats(state).map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="glass-card px-6 py-4 text-center min-w-[150px]">
            <span className="text-2xl font-bold text-stat-value font-mono block">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </motion.div>
        ))}
      </div>
      <ActionButtons onResetDay={onResetDay} onShowShortcuts={onShowShortcuts} extraActions={extraActions} />
    </motion.div>
  );
}

// ─── COMPACT ───
function HeroCompact({ state, onResetDay, onShowShortcuts, extraActions }: Omit<DashboardHeroProps, "heroLayout">) {
  const xpForLevel = state.currentXP % 100;
  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8 space-y-3">
      {/* Row 1: Streak + Level + XP bar */}
      <div className="flex items-center gap-4 max-w-[700px] mx-auto">
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl gradient-purple border border-primary/40 glow-sm shrink-0">
          <span className="text-lg animate-fire">🔥</span>
          <span className="text-sm font-bold text-primary-foreground">{state.streakDays}</span>
        </div>
        <span className="px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground text-sm font-bold glow-sm shrink-0">Lv.{state.currentLevel}</span>
        <div className="flex-1 h-4 bg-primary/10 rounded-full border border-primary/30 overflow-hidden relative">
          <motion.div className="h-full gradient-purple rounded-full relative overflow-hidden" initial={{ width: 0 }} animate={{ width: `${xpForLevel}%` }} transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}>
            <div className="absolute inset-0 animate-shimmer" />
          </motion.div>
        </div>
        <span className="text-xs text-accent-foreground font-semibold shrink-0">{xpForLevel}/100</span>
      </div>
      {/* Row 2: Inline stats */}
      <div className="flex items-center justify-center gap-6 text-sm">
        {stats(state).map(stat => (
          <span key={stat.label} className="text-muted-foreground">
            <span className="font-bold text-stat-value font-mono">{stat.value}</span>{" "}
            <span className="text-xs">{stat.label}</span>
          </span>
        ))}
      </div>
      <ActionButtons onResetDay={onResetDay} onShowShortcuts={onShowShortcuts} extraActions={extraActions} />
    </motion.div>
  );
}

// ─── MINIMAL ───
function HeroMinimal({ state, onResetDay, onShowShortcuts, extraActions }: Omit<DashboardHeroProps, "heroLayout">) {
  const xpForLevel = state.currentXP % 100;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="mb-8">
      <div className="flex items-center gap-4 max-w-[500px] mx-auto mb-3">
        <span className="text-sm font-bold text-foreground/70">Lv.{state.currentLevel}</span>
        <div className="flex-1 h-3 bg-primary/10 rounded-full border border-primary/20 overflow-hidden relative group">
          <motion.div className="h-full gradient-purple rounded-full relative overflow-hidden" initial={{ width: 0 }} animate={{ width: `${xpForLevel}%` }} transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }}>
            <div className="absolute inset-0 animate-shimmer" />
          </motion.div>
          {/* Hover tooltip with full stats */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[10px] font-bold text-primary-foreground drop-shadow-sm">{xpForLevel}/100 XP</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground font-mono">{xpForLevel}/100</span>
      </div>
      {/* Hidden stats revealed on hover */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/60">
        <span>🔥 {state.streakDays}d</span>
        <span>⭐ {state.currentXP} XP</span>
        <span>✅ {state.missionsCompleted}</span>
        <span>📂 {state.categoriesEngaged.size}</span>
      </div>
      <div className="mt-3">
        <ActionButtons onResetDay={onResetDay} onShowShortcuts={onShowShortcuts} extraActions={extraActions} />
      </div>
    </motion.div>
  );
}

// ─── COMMAND CENTER ───
function HeroCommand({ state, onResetDay, onShowShortcuts, extraActions }: Omit<DashboardHeroProps, "heroLayout">) {
  const xpForLevel = state.currentXP % 100;
  const circumference = 2 * Math.PI * 42;
  const strokeDashoffset = circumference - (xpForLevel / 100) * circumference;

  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center mb-8">
      <div className="flex items-center justify-center gap-8 mb-6 flex-wrap">
        {/* Circular XP Gauge */}
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary) / 0.1)" strokeWidth="6" />
            <motion.circle
              cx="50" cy="50" r="42" fill="none"
              stroke="url(#xpGradient)" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
            />
            <defs>
              <linearGradient id="xpGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(var(--xp-gradient-from))" />
                <stop offset="100%" stopColor="hsl(var(--xp-gradient-to))" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-stat-value font-mono">{xpForLevel}</span>
            <span className="text-[10px] text-muted-foreground">/ 100 XP</span>
            <span className="text-xs font-bold text-primary mt-0.5">Lv.{state.currentLevel}</span>
          </div>
        </div>

        {/* Streak + Stats Column */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl gradient-purple border border-primary/40 glow-sm">
            <span className="text-xl animate-fire">🔥</span>
            <span className="text-base font-bold text-primary-foreground">{state.streakDays} Day Streak</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {stats(state).map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 + i * 0.1 }}
                className="glass-card px-4 py-3 text-center"
              >
                <span className="text-xl font-bold text-stat-value font-mono block">{stat.value}</span>
                <span className="text-[10px] text-muted-foreground">{stat.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <ActionButtons onResetDay={onResetDay} onShowShortcuts={onShowShortcuts} extraActions={extraActions} />
    </motion.div>
  );
}

// ─── SOLID ───
function HeroSolid({ state, onResetDay, onShowShortcuts, extraActions }: Omit<DashboardHeroProps, "heroLayout">) {
  const xpForLevel = state.currentXP % 100;
  return (
    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="text-center mb-8">
      <div className="inline-flex items-center gap-3 px-8 py-4 rounded-lg bg-primary text-primary-foreground border-none shadow-[0_4px_0_0_hsl(var(--primary)/0.5)] mb-6">
        <span className="text-3xl">🔥</span>
        <span className="text-xl font-bold">{state.streakDays} Day Streak</span>
      </div>
      <div className="max-w-[600px] mx-auto mb-8">
        <div className="flex justify-between items-center mb-3">
          <span className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-base font-bold shadow-[0_3px_0_0_hsl(var(--primary)/0.5)]">Level {state.currentLevel}</span>
          <span className="text-foreground font-semibold">{xpForLevel} / 100 XP</span>
        </div>
        <div className="h-6 bg-muted rounded-lg border-2 border-border overflow-hidden relative">
          <motion.div className="h-full bg-primary rounded-lg" initial={{ width: 0 }} animate={{ width: `${xpForLevel}%` }} transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }} />
        </div>
      </div>
      <div className="flex justify-center gap-4 flex-wrap mb-6">
        {stats(state).map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
            className="bg-card border-2 border-border rounded-lg px-6 py-4 text-center min-w-[150px] shadow-[0_3px_0_0_hsl(var(--border))]"
          >
            <span className="text-2xl font-bold text-stat-value font-mono block">{stat.value}</span>
            <span className="text-xs text-muted-foreground">{stat.label}</span>
          </motion.div>
        ))}
      </div>
      <ActionButtons onResetDay={onResetDay} onShowShortcuts={onShowShortcuts} extraActions={extraActions} />
    </motion.div>
  );
}

export default function DashboardHero(props: DashboardHeroProps) {
  const layout = props.heroLayout || "default";
  const passProps = { state: props.state, onResetDay: props.onResetDay, onShowShortcuts: props.onShowShortcuts };

  switch (layout) {
    case "compact": return <HeroCompact {...passProps} />;
    case "minimal": return <HeroMinimal {...passProps} />;
    case "command": return <HeroCommand {...passProps} />;
    case "solid": return <HeroSolid {...passProps} />;
    default: return <HeroDefault {...passProps} />;
  }
}
