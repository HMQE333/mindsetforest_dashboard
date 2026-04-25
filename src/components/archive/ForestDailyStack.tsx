import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Droplet, BookmarkPlus, X, RotateCcw } from "lucide-react";
import { useForestState, type SeedWithAuthor } from "@/hooks/useForestState";
import { useFriends } from "@/hooks/useFriends";
import PillarIcon from "@/components/shared/PillarIcon";
import { usePillars } from "@/hooks/usePillars";

const DAILY_LIMIT = 5;
const STORAGE_KEY = "forest_daily_seen_v1";

/**
 * Card stack curated for the day:
 *  - 60% from friends (newest unseen)
 *  - 40% trending public seeds (decayed by age, unseen)
 * Persists "seen" ids per UTC day in localStorage so users don't repeat.
 */
const ForestDailyStack = ({ onOpenDiscover }: { onOpenDiscover?: () => void }) => {
  const forest = useForestState();
  const friends = useFriends();
  const allPillars = usePillars();
  const friendIds = useMemo(() => new Set(friends.accepted.map((f) => f.friend.user_id)), [friends.accepted]);

  const dayKey = new Date().toISOString().slice(0, 10);

  const [seenToday, setSeenToday] = useState<Set<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as { day?: string; ids?: string[] };
      if (raw.day === dayKey && Array.isArray(raw.ids)) return new Set(raw.ids);
    } catch { /* ignore */ }
    return new Set();
  });

  // Persist on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: dayKey, ids: Array.from(seenToday) }));
  }, [seenToday, dayKey]);

  const trending = (s: SeedWithAuthor) => {
    const ageH = (Date.now() - new Date(s.published_at).getTime()) / 3_600_000;
    return s.water_count / Math.pow(ageH + 2, 1.5);
  };

  const todaysSelection = useMemo<SeedWithAuthor[]>(() => {
    const pool = forest.discoverSeeds.filter((s) => !s.iSaved);
    const fromFriends = pool
      .filter((s) => friendIds.has(s.author_id))
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    const fromTrending = pool
      .filter((s) => !friendIds.has(s.author_id))
      .sort((a, b) => trending(b) - trending(a));

    const friendCount = Math.min(3, fromFriends.length);
    const trendingCount = DAILY_LIMIT - friendCount;
    const merged = [
      ...fromFriends.slice(0, friendCount),
      ...fromTrending.slice(0, trendingCount),
    ];
    // Pad if pool too small
    if (merged.length < DAILY_LIMIT) {
      const used = new Set(merged.map((s) => s.id));
      pool.forEach((s) => {
        if (merged.length < DAILY_LIMIT && !used.has(s.id)) {
          merged.push(s);
          used.add(s.id);
        }
      });
    }
    return merged;
  }, [forest.discoverSeeds, friendIds]);

  const queue = useMemo(() => todaysSelection.filter((s) => !seenToday.has(s.id)), [todaysSelection, seenToday]);
  const current = queue[0];
  const next = queue[1];

  const dismiss = (id: string) => {
    setSeenToday((prev) => new Set(prev).add(id));
    forest.recordView(id);
  };

  const reset = () => {
    setSeenToday(new Set());
    localStorage.removeItem(STORAGE_KEY);
  };

  if (forest.loading) {
    return (
      <div className="glass-card p-6 text-center text-muted-foreground animate-pulse text-sm">
        🍃 Foraging today's seeds…
      </div>
    );
  }

  if (todaysSelection.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-2">
        <Sparkles className="w-8 h-8 text-primary mx-auto opacity-50" />
        <p className="font-bold text-foreground">No fresh seeds today</p>
        <p className="text-xs text-muted-foreground">
          Add friends or wait for the Forest to grow. Plant your own seed in the meantime.
        </p>
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="glass-card p-8 text-center space-y-3">
        <span className="text-4xl block">🌅</span>
        <p className="font-bold text-foreground">You've tended today's grove</p>
        <p className="text-xs text-muted-foreground">
          Come back tomorrow for {DAILY_LIMIT} new curated seeds.
        </p>
        <div className="flex justify-center gap-2 pt-1">
          <button onClick={reset}
            className="text-[11px] px-3 py-1.5 rounded-lg bg-muted/40 text-muted-foreground hover:text-foreground font-bold flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Re-shuffle
          </button>
          {onOpenDiscover && (
            <button onClick={onOpenDiscover}
              className="text-[11px] px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground font-bold glow-sm">
              Browse Discover →
            </button>
          )}
        </div>
      </div>
    );
  }

  const seenCount = todaysSelection.length - queue.length;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-foreground">Today's grove</p>
          <span className="text-[10px] text-muted-foreground">
            {seenCount + 1}/{todaysSelection.length}
          </span>
        </div>
        <button onClick={reset} title="Reset today"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      {/* Card stack */}
      <div className="relative h-[420px]">
        <AnimatePresence>
          {next && (
            <motion.div
              key={`bg-${next.id}`}
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 0.6, scale: 0.96, y: 8 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 glass-card p-5 pointer-events-none"
            />
          )}
          {current && (
            <SeedSwipeCard
              key={current.id}
              seed={current}
              pillarObjs={current.pillars.map((p) => allPillars.find((pl) => pl.id === p)).filter(Boolean) as any}
              onSkip={() => dismiss(current.id)}
              onWater={async () => { await forest.waterSeed(current.id); }}
              onSave={async () => { await forest.saveSeed(current.id); dismiss(current.id); }}
            />
          )}
        </AnimatePresence>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Curated daily · 60% friends · 40% trending in the Forest
      </p>
    </div>
  );
};

/* ---------- Single card ---------- */
const SeedSwipeCard = ({
  seed,
  pillarObjs,
  onSkip,
  onWater,
  onSave,
}: {
  seed: SeedWithAuthor;
  pillarObjs: { id: string; name: string; icon: string; iconUrl?: string; color: string }[];
  onSkip: () => void;
  onWater: () => Promise<void>;
  onSave: () => Promise<void>;
}) => {
  return (
    <motion.div
      key={seed.id}
      initial={{ opacity: 0, y: 16, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      exit={{ opacity: 0, x: -200, rotate: -8, transition: { duration: 0.25 } }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={(_, info) => {
        if (info.offset.x < -100) onSkip();
      }}
      className="absolute inset-0 glass-card p-5 flex flex-col cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{seed.author?.avatar_emoji || "🦊"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-foreground truncate">
            {seed.author?.display_name || `@${seed.author?.username || "unknown"}`}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            @{seed.author?.username || "unknown"} · {new Date(seed.published_at).toLocaleDateString()}
          </p>
        </div>
        <button onClick={onSkip} title="Skip"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        <h3 className="font-bold text-foreground text-lg">{seed.title || "Untitled"}</h3>
        {(pillarObjs.length > 0 || seed.directions.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {pillarObjs.slice(0, 3).map((p) => (
              <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                    style={{ backgroundColor: p.color + "22", color: p.color }}>
                <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={11} className="inline-block" /> {p.name}
              </span>
            ))}
            {seed.directions.slice(0, 2).map((d) => (
              <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground font-semibold">
                {d}
              </span>
            ))}
          </div>
        )}
        <p className="text-sm text-foreground/90 leading-6 whitespace-pre-wrap font-serif">
          {seed.content || "—"}
        </p>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2 pt-3 border-t border-white/5 mt-3 shrink-0">
        <button onClick={onSkip}
          className="flex-1 px-3 py-2 rounded-xl bg-muted/40 text-muted-foreground hover:text-foreground text-xs font-bold transition-all">
          Skip
        </button>
        <button onClick={onWater}
          className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
            seed.iWatered ? "bg-cyan-500/30 text-cyan-300" : "bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25"
          }`}>
          <Droplet className="w-3.5 h-3.5" /> Water
        </button>
        <button onClick={onSave}
          className="flex-1 px-3 py-2 rounded-xl gradient-purple text-primary-foreground text-xs font-bold glow-sm flex items-center justify-center gap-1">
          <BookmarkPlus className="w-3.5 h-3.5" /> Save
        </button>
      </div>
    </motion.div>
  );
};

export default ForestDailyStack;