import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ArchiveBlock } from "@/lib/archive-data";
import { useDigestState, type DigestBlock } from "@/hooks/useDigestState";

interface Props {
  blocks: ArchiveBlock[];
}

const ratingConfig = {
  1: { label: "Forgot", emoji: "😶", key: "1", color: "bg-destructive/20 border-destructive/40 text-destructive", flash: "bg-destructive/10" },
  2: { label: "Vague", emoji: "🤔", key: "2", color: "bg-yellow-500/20 border-yellow-500/40 text-yellow-400", flash: "bg-yellow-500/10" },
  3: { label: "Got it", emoji: "✅", key: "3", color: "bg-green-500/20 border-green-500/40 text-green-400", flash: "bg-green-500/10" },
} as const;

const ArchiveDigestView = ({ blocks }: Props) => {
  const { dueBlocks, loading, saveRating, sessionStats, resetSession, totalDueCount } = useDigestState(blocks);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);

  const isComplete = dueBlocks.length === 0 && sessionStats.total > 0;
  const card = dueBlocks[0]; // Always show first due card (they get removed after rating)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isComplete || !card) return;
      if (e.key === " ") {
        e.preventDefault();
        setRevealed((r) => !r);
      }
      if (revealed && ["1", "2", "3"].includes(e.key)) {
        handleRate(parseInt(e.key) as 1 | 2 | 3);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [card, revealed, isComplete]);

  const handleRate = useCallback(async (rating: 1 | 2 | 3) => {
    if (!card) return;
    const cfg = ratingConfig[rating];
    setFlashColor(cfg.flash);
    setTimeout(() => setFlashColor(null), 400);
    await saveRating(card.id, rating);
    setRevealed(false);
  }, [card, saveRating]);

  if (loading) {
    return (
      <div className="text-center py-20">
        <span className="text-2xl animate-pulse">⏳</span>
        <p className="text-muted-foreground text-sm mt-2">Loading digest…</p>
      </div>
    );
  }

  // Session complete screen
  if (isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-16 space-y-6"
      >
        <span className="text-5xl block">🎉</span>
        <h2 className="text-xl font-bold text-foreground">Session Complete!</h2>
        <p className="text-sm text-muted-foreground">
          You reviewed <span className="font-bold text-foreground">{sessionStats.total}</span> blocks
        </p>
        <div className="flex items-center justify-center gap-4 text-sm">
          <span className="text-green-400 font-semibold">✅ {sessionStats.remembered} remembered</span>
          <span className="text-yellow-400 font-semibold">🤔 {sessionStats.vague} vague</span>
          <span className="text-destructive font-semibold">😶 {sessionStats.forgot} forgot</span>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Blocks you forgot will resurface tomorrow. Remembered blocks will wait longer.
        </p>
        <button
          onClick={resetSession}
          className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold gradient-purple text-primary-foreground glow-sm"
        >
          Review Again
        </button>
      </motion.div>
    );
  }

  // No blocks due
  if (!card) {
    return (
      <div className="text-center py-20">
        <span className="text-4xl mb-4 block">🧘</span>
        <p className="text-muted-foreground font-semibold">Nothing to review today</p>
        <p className="text-xs text-muted-foreground mt-1">
          Come back tomorrow — your blocks resurface on a spaced schedule.
        </p>
      </div>
    );
  }

  const blockType = card.source_url ? "🔗" : "📝";
  const reviewed = sessionStats.total;
  const total = totalDueCount;

  return (
    <div className="flex flex-col items-center gap-6 py-8 relative">
      {/* Flash overlay */}
      <AnimatePresence>
        {flashColor && (
          <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className={`fixed inset-0 z-40 pointer-events-none ${flashColor}`}
          />
        )}
      </AnimatePresence>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-semibold">
          {reviewed + 1} of {total}
        </span>
        <div className="w-40 h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <motion.div
            className="h-full rounded-full gradient-purple"
            animate={{ width: `${((reviewed + 1) / total) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <AnimatePresence mode="wait">
        <motion.div
          key={card.id}
          initial={{ opacity: 0, x: 40, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -40, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          onClick={() => setRevealed(!revealed)}
          className="w-full max-w-lg cursor-pointer"
        >
          <div className="glass-card border border-white/10 p-6 rounded-2xl min-h-[250px] flex flex-col justify-between hover:border-primary/30 transition-all">
            <div>
              {/* Meta row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{blockType}</span>
                  <span className="text-[10px] text-muted-foreground font-semibold px-2 py-0.5 rounded-full bg-muted/30">
                    {(card as DigestBlock).intervalLabel}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {revealed ? "Space to hide" : "Space to reveal"}
                </span>
              </div>

              {!revealed ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <span className="text-3xl">🃏</span>
                  <p className="text-sm font-bold text-foreground text-center">
                    {card.title || "Untitled"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Tap or press Space to reveal
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-foreground">
                    {card.title || "Untitled"}
                  </p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {card.content}
                  </p>
                  {card.source_url && (
                    <a
                      href={card.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-primary hover:underline block mt-1 truncate"
                    >
                      🔗 {card.source_url}
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Tags */}
            {card.pillars.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-4">
                {card.pillars.map((p) => (
                  <span
                    key={p}
                    className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Rating buttons */}
      {revealed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3"
        >
          {([1, 2, 3] as const).map((r) => {
            const cfg = ratingConfig[r];
            return (
              <button
                key={r}
                onClick={(e) => { e.stopPropagation(); handleRate(r); }}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold border transition-all hover:scale-105 active:scale-95 ${cfg.color}`}
              >
                {cfg.emoji} {cfg.label}
                <span className="ml-1.5 text-[10px] opacity-60">({cfg.key})</span>
              </button>
            );
          })}
        </motion.div>
      )}

      {!revealed && (
        <p className="text-[10px] text-muted-foreground">
          Keys: Space reveal · 1 Forgot · 2 Vague · 3 Got it
        </p>
      )}
    </div>
  );
};

export default ArchiveDigestView;
