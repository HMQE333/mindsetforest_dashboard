import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ArchiveBlock } from "@/lib/archive-data";

const INTERVALS = [1, 3, 7, 14, 30, 60, 90];
const TOLERANCE_MS = 24 * 60 * 60 * 1000; // ±1 day

function getDueBlocks(blocks: ArchiveBlock[]): ArchiveBlock[] {
  const now = Date.now();
  return blocks.filter((b) => {
    const age = now - new Date(b.created_at).getTime();
    return INTERVALS.some((d) => Math.abs(age - d * 86400000) <= TOLERANCE_MS);
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Props {
  blocks: ArchiveBlock[];
}

const ArchiveDigestView = ({ blocks }: Props) => {
  const due = useMemo(() => shuffle(getDueBlocks(blocks)), [blocks]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  if (due.length === 0) {
    return (
      <div className="text-center py-20">
        <span className="text-4xl mb-4 block">🧘</span>
        <p className="text-muted-foreground font-semibold">Nothing to review today</p>
        <p className="text-xs text-muted-foreground mt-1">Come back tomorrow — your blocks resurface on a spaced schedule.</p>
      </div>
    );
  }

  const card = due[index];
  const daysAgo = Math.round((Date.now() - new Date(card.created_at).getTime()) / 86400000);

  return (
    <div className="flex flex-col items-center gap-6 py-8">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-semibold">
          {index + 1} of {due.length}
        </span>
        <div className="w-32 h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div
            className="h-full rounded-full gradient-purple transition-all duration-300"
            style={{ width: `${((index + 1) / due.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <AnimatePresence mode="wait">
        <motion.div
          key={card.id + index}
          initial={{ opacity: 0, rotateY: -10, scale: 0.95 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          exit={{ opacity: 0, rotateY: 10, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          onClick={() => setRevealed(!revealed)}
          className="w-full max-w-lg cursor-pointer"
        >
          <div className="glass-card border border-white/10 p-6 rounded-2xl min-h-[220px] flex flex-col justify-between hover:border-primary/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-muted-foreground font-semibold">{daysAgo}d ago</span>
                <span className="text-[10px] text-muted-foreground">
                  {revealed ? "tap to hide" : "tap to reveal"}
                </span>
              </div>

              {!revealed ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <span className="text-3xl">🃏</span>
                  <p className="text-sm font-bold text-foreground text-center">{card.title || "Untitled"}</p>
                  <p className="text-[11px] text-muted-foreground">Tap to reveal content</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-bold text-foreground">{card.title || "Untitled"}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {card.content}
                  </p>
                </div>
              )}
            </div>

            {/* Pillar tags */}
            {card.pillars.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-4">
                {card.pillars.map((p) => (
                  <span key={p} className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setIndex(Math.max(0, index - 1)); setRevealed(false); }}
          disabled={index === 0}
          className="px-4 py-2 rounded-xl text-sm font-bold glass-card border border-white/10 disabled:opacity-30 hover:border-primary/30 transition-all"
        >
          ← Prev
        </button>
        <button
          onClick={() => { setIndex(Math.min(due.length - 1, index + 1)); setRevealed(false); }}
          disabled={index === due.length - 1}
          className="px-4 py-2 rounded-xl text-sm font-bold gradient-purple text-primary-foreground glow-sm disabled:opacity-30 transition-all"
        >
          Next →
        </button>
      </div>
    </div>
  );
};

export default ArchiveDigestView;
