import { motion } from "framer-motion";

interface TrackerMiniChartProps {
  data: { date: string; value: number }[];
  color: string;
}

export default function TrackerMiniChart({ data, color }: TrackerMiniChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => {
        const height = Math.max((d.value / max) * 100, 4);
        const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en", { weekday: "short" }).charAt(0);
        
        return (
          <div key={d.date} className="flex flex-col items-center flex-1 gap-1">
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${height}%` }}
              transition={{ delay: i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full rounded-sm min-h-[2px]"
              style={{ backgroundColor: color, opacity: d.value > 0 ? 1 : 0.2 }}
            />
            <span className="text-[9px] text-muted-foreground">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
