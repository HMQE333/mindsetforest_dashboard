import { motion } from "framer-motion";

interface ProgressJarProps {
  total: number;
  completed: number;
  percentage: number;
}

export default function ProgressJar({ total, completed, percentage }: ProgressJarProps) {
  const emptyPos = 55;
  const fullPos = 10;
  const translateY = emptyPos - (percentage / 100) * (emptyPos - fullPos);

  return (
    <div className="glass-card p-5 sticky top-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-foreground">🫙 Progress Jar</h3>
        <span className="text-sm text-muted-foreground">{completed}/{total}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Filled by completed tasks across the whole ladder</p>

      <div className="flex items-center justify-center h-[300px]">
        <div className="relative w-[150px] h-[240px]" style={{ filter: "drop-shadow(0 18px 30px rgba(0,0,0,0.55))" }}>
          {/* Jar body */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[200px] rounded-[46px_46px_36px_36px] border-[3px] border-white/60 overflow-hidden"
            style={{ background: "radial-gradient(circle at 15% 20%, rgba(255,255,255,0.2), transparent 55%), linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0.02))", backdropFilter: "blur(6px)" }}>
            {/* Liquid */}
            <motion.div
              className="absolute inset-0 -bottom-10 overflow-hidden"
              style={{
                background: "linear-gradient(180deg, #ff00ff 0%, #d946ef 35%, #9d1ba8 100%)",
                filter: "drop-shadow(0 0 20px rgba(255,0,255,0.5)) drop-shadow(0 0 40px rgba(217,70,239,0.3))",
              }}
              animate={{ y: `${translateY}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {/* Wave */}
              <div className="absolute -left-[25%] w-[150%] h-[70px] top-[-35px] rounded-full opacity-60"
                style={{ background: "radial-gradient(circle at 50% 20px, rgba(255,255,255,0.85), transparent 60%)", animation: "waveMove 6s linear infinite" }} />
              {/* Bubbles */}
              <div className="absolute inset-0 overflow-hidden">
                {[20, 40, 60, 75, 50].map((left, i) => (
                  <span key={i} className="absolute rounded-full opacity-60" style={{
                    bottom: "-16px", left: `${left}%`,
                    width: i % 2 === 0 ? 10 : 8, height: i % 2 === 0 ? 10 : 8,
                    background: "radial-gradient(circle at 30% 30%, #fff, rgba(255,255,255,0))",
                    animation: `bubbleUp ${4 + i * 0.5}s linear infinite`,
                    animationDelay: `${i * 0.3}s`,
                  }} />
                ))}
              </div>
            </motion.div>
          </div>
          {/* Highlight */}
          <div className="absolute top-[48px] left-[28px] w-[22px] h-[140px] rounded-[30px] opacity-25 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.1))" }} />
          {/* Percentage */}
          <div className="absolute bottom-[50px] left-1/2 -translate-x-1/2 text-white font-bold text-sm z-10 drop-shadow-md">
            {percentage}%
          </div>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground mt-2">
        {total === 0 ? "Add tasks to start filling the jar." : completed === total && total > 0 ? "Perfect run. Jar is FULL. 🎉" : `${total - completed} tasks left to fill it.`}
      </p>
    </div>
  );
}
