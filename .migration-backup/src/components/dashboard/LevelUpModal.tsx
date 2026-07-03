import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface LevelUpModalProps {
  level: number;
  show: boolean;
}

export default function LevelUpModal({ level, show }: LevelUpModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [show, level]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none"
        >
          <div className="p-8 rounded-3xl text-center gradient-purple glow-lg"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h2 className="text-3xl font-bold text-primary-foreground mb-4" style={{ textShadow: "0 0 20px rgba(255,255,255,0.5)" }}>
              🎉 LEVEL UP! 🎉
            </h2>
            <p className="text-xl text-primary-foreground/90">
              You've reached Level {level}!
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
