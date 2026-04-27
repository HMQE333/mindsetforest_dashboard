import { motion } from "framer-motion";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

const LABELS: Record<number, string> = { 1: "Very Poor", 5: "Average", 10: "Peak" };

function colorFor(n: number) {
  // 1 (red) → 5 (amber) → 10 (green)
  if (n <= 5) {
    const t = (n - 1) / 4; // 0..1
    const hue = 0 + t * 38; // 0 → 38
    return `hsl(${hue}, 80%, 55%)`;
  }
  const t = (n - 5) / 5; // 0..1
  const hue = 38 + t * 104; // 38 → 142
  return `hsl(${hue}, 70%, 50%)`;
}

export default function HealthRatingSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const active = n === value;
          const within = n <= value;
          const color = colorFor(n);
          return (
            <motion.button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              whileTap={{ scale: 0.92 }}
              className="flex-1 h-12 rounded-lg flex items-center justify-center text-sm font-bold transition-all relative"
              style={{
                background: within ? color : "hsl(var(--muted) / 0.3)",
                color: within ? "white" : "hsl(var(--muted-foreground))",
                border: active ? `2px solid ${color}` : "1px solid hsl(var(--border))",
                boxShadow: active ? `0 0 16px ${color}80` : undefined,
              }}
            >
              {n}
            </motion.button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>{LABELS[1]}</span>
        <span>{LABELS[5]}</span>
        <span>{LABELS[10]}</span>
      </div>
    </div>
  );
}