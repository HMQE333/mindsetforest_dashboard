import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsWatch } from "@/hooks/useIsWatch";
import { TrackerMetric } from "@/lib/tracker-data";

interface TrackerInputModalProps {
  metric: TrackerMetric | null;
  onSubmit: (metricId: string, value: number) => void;
  onClose: () => void;
}

const textColorMap: Record<string, string> = {
  "cat-mind": "text-cat-mind",
  "cat-body": "text-cat-body",
  "cat-creation": "text-cat-creation",
  "cat-exploration": "text-cat-exploration",
  "cat-networking": "text-cat-networking",
  "cat-trading": "text-cat-trading",
  "cat-spirit": "text-cat-spirit",
  "cat-order": "text-cat-order",
};

const borderColorMap: Record<string, string> = {
  "cat-mind": "border-cat-mind/40 focus:border-cat-mind",
  "cat-body": "border-cat-body/40 focus:border-cat-body",
  "cat-creation": "border-cat-creation/40 focus:border-cat-creation",
  "cat-exploration": "border-cat-exploration/40 focus:border-cat-exploration",
  "cat-networking": "border-cat-networking/40 focus:border-cat-networking",
  "cat-trading": "border-cat-trading/40 focus:border-cat-trading",
  "cat-spirit": "border-cat-spirit/40 focus:border-cat-spirit",
  "cat-order": "border-cat-order/40 focus:border-cat-order",
};

const PRESETS: Record<string, number[]> = {
  pushups: [10, 20, 30, 50, 100],
  "pages-read": [5, 10, 15, 25, 50],
  "clients-outreached": [1, 3, 5, 10],
  "good-trade-setups": [1, 2, 3, 5],
  "people-contacted": [1, 2, 3, 5],
  "hours-mind": [0.5, 1, 1.5, 2, 3],
  "hours-body": [0.5, 1, 1.5, 2],
  "hours-creation": [0.5, 1, 2, 3, 4],
  "hours-trading": [0.5, 1, 1.5, 2],
  "hours-exploration": [0.5, 1, 1.5, 2],
};

export default function TrackerInputModal({ metric, onSubmit, onClose }: TrackerInputModalProps) {
  const [value, setValue] = useState("");
  const isWatch = useIsWatch();
  if (!metric) return null;

  const presets = PRESETS[metric.id] || [1, 5, 10];

  const handleSubmit = () => {
    const num = parseFloat(value);
    if (num > 0 && num <= 10000) {
      onSubmit(metric.id, num);
      setValue("");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`relative glass-card ${isWatch ? "p-4 max-w-[200px]" : "p-8 max-w-sm"} w-full mx-4 border-white/15`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`text-center ${isWatch ? "mb-3" : "mb-6"}`}>
            <span className={`${isWatch ? "text-3xl" : "text-5xl"} block ${isWatch ? "mb-1" : "mb-3"}`}>{metric.icon}</span>
            <h2 className={`${isWatch ? "text-sm" : "text-xl"} font-bold ${textColorMap[metric.colorVar] || "text-foreground"}`}>
              {metric.label}
            </h2>
            {!isWatch && (
              <p className="text-xs text-muted-foreground mt-1">
                {metric.categoryIcon} {metric.categoryName}
              </p>
            )}
          </div>

          <div className={`space-y-${isWatch ? "2" : "4"}`}>
            <div className="relative">
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="0"
                min="0"
                max="10000"
                step="any"
                autoFocus
                className={`w-full bg-secondary/50 border-2 rounded-xl px-4 ${isWatch ? "py-2 text-xl" : "py-4 text-3xl"} text-center font-bold font-mono text-foreground outline-none transition-colors ${borderColorMap[metric.colorVar] || "border-border"}`}
              />
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 ${isWatch ? "text-[10px]" : "text-sm"} text-muted-foreground`}>
                {metric.unit}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 justify-center">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setValue(String(p))}
                  className={`${isWatch ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} font-mono font-semibold rounded-lg bg-secondary/80 border border-white/10 text-foreground/80 hover:bg-primary/20 hover:border-primary/30 transition-all duration-200`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className={`flex gap-2 ${isWatch ? "mt-3" : "mt-6"}`}>
              <button
                onClick={onClose}
                className={`flex-1 ${isWatch ? "py-2 text-xs" : "py-3 text-sm"} rounded-xl font-semibold bg-secondary/80 border border-white/10 text-foreground/70 hover:bg-secondary transition-all`}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!value || parseFloat(value) <= 0}
                className={`flex-1 ${isWatch ? "py-2 text-xs" : "py-3 text-sm"} rounded-xl font-bold gradient-purple text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all glow-sm`}
              >
                Log
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
