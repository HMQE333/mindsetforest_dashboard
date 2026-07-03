import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface MasteryOverlayProps {
  show: boolean;
}

export default function MasteryOverlay({ show }: MasteryOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3800);
      return () => clearTimeout(timer);
    }
  }, [show]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
          style={{
            background: "radial-gradient(circle at 20% 30%, rgba(140,80,255,0.25), transparent 60%), radial-gradient(circle at 80% 60%, rgba(255,0,200,0.22), transparent 55%), radial-gradient(circle at 50% 50%, rgba(80,200,255,0.15), transparent 60%), linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0.9))",
            backdropFilter: "blur(14px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
            transition={{ duration: 0.4 }}
            className="p-7 rounded-[22px] text-center"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 24px 90px rgba(0,0,0,0.6)",
              backdropFilter: "blur(16px)",
            }}
          >
            <h2 className="text-5xl font-extrabold tracking-[0.28em] uppercase text-white/90 mb-2">
              MASTERED
            </h2>
            <p className="text-sm text-white/70 tracking-wider">
              Cycle complete · Identity reinforced
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
