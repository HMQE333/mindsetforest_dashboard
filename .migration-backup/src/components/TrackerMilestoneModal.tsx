import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X } from "lucide-react";

interface Props {
  milestone: { id: string; title: string; icon: string; xp: number } | null;
  onClose: () => void;
}

export default function TrackerMilestoneModal({ milestone, onClose }: Props) {
  return (
    <AnimatePresence>
      {milestone && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative glass-card max-w-sm w-full p-8 text-center border-primary/30 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.4)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute top-3 right-3 p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
              <X className="w-4 h-4" />
            </button>
            <div className="text-xs uppercase tracking-widest text-primary/80 font-bold mb-2">Milestone Unlocked</div>
            <motion.div
              initial={{ scale: 0.4, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 14 }}
              className="text-6xl mb-3"
            >
              {milestone.icon}
            </motion.div>
            <h2 className="text-2xl font-bold text-gradient-purple mb-4">{milestone.title}</h2>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl gradient-purple text-primary-foreground font-bold text-lg glow-sm"
            >
              <Sparkles className="w-5 h-5" /> +{milestone.xp} XP
            </motion.div>
            <button
              onClick={onClose}
              className="mt-6 w-full py-2.5 rounded-xl bg-secondary/80 border border-white/10 text-sm font-semibold text-foreground/80 hover:bg-secondary transition-all"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}