import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TrackerEntry, getMonthTotal } from "@/hooks/useTrackerEntries";
import { TRACKER_METRICS } from "@/lib/tracker-data";
import { useUserSettings } from "@/hooks/useUserSettings";
import PillarIcon from "@/components/shared/PillarIcon";

interface TrackerActivityPulseProps {
  entries: TrackerEntry[];
}

// Sample data for demo
function generateSampleData(): TrackerEntry[] {
  const samples: TrackerEntry[] = [];
  const now = new Date();
  const metricIds = TRACKER_METRICS.map((m) => m.id);

  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    for (const metricId of metricIds) {
      const count = Math.floor(Math.random() * 15) + 2;
      for (let i = 0; i < count; i++) {
        const day = Math.min(Math.floor(Math.random() * daysInMonth) + 1, daysInMonth);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        samples.push({
          id: `sample-${Date.now()}-${Math.random()}`,
          metricId,
          value: Math.floor(Math.random() * 10) + 1,
          date,
          createdAt: new Date(date).toISOString(),
        });
      }
    }
  }
  return samples;
}

const bgColorMap: Record<string, string> = {
  "cat-mind": "bg-cat-mind",
  "cat-body": "bg-cat-body",
  "cat-creation": "bg-cat-creation",
  "cat-exploration": "bg-cat-exploration",
  "cat-networking": "bg-cat-networking",
  "cat-trading": "bg-cat-trading",
  "cat-spirit": "bg-cat-spirit",
  "cat-order": "bg-cat-order",
};

export default function TrackerActivityPulse({ entries }: TrackerActivityPulseProps) {
  const [expanded, setExpanded] = useState(false);
  const { getCategories } = useUserSettings();
  const categories = getCategories();

  const allEntries = useMemo(() => [...entries, ...generateSampleData()], [entries]);

  const now = new Date();
  const year = now.getFullYear();

  const months = useMemo(() => {
    const result: { label: string; year: number; month: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(year, now.getMonth() - i, 1);
      result.push({
        label: d.toLocaleString("default", { month: "short" }),
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    return result;
  }, [year]);

  // Build unique categories from metrics, enriched with custom data
  const CATS = useMemo(() => {
    const seen = new Set<string>();
    return TRACKER_METRICS.filter((m) => {
      if (seen.has(m.categoryId)) return false;
      seen.add(m.categoryId);
      return true;
    }).map((m) => {
      const cat = categories.find(c => c.id === m.categoryId);
      return {
        id: m.categoryId,
        name: cat?.name || m.categoryName,
        icon: cat?.icon || m.categoryIcon,
        iconUrl: cat?.iconUrl,
        colorVar: m.colorVar,
      };
    });
  }, [categories]);

  const pulseData = useMemo(() => {
    return CATS.map((cat) => {
      const metricIds = TRACKER_METRICS.filter((m) => m.categoryId === cat.id).map((m) => m.id);
      const monthlyTotals = months.map((mo) => {
        let total = 0;
        for (const mid of metricIds) {
          total += getMonthTotal(allEntries, mid, mo.year, mo.month);
        }
        return total;
      });
      const max = Math.max(1, ...monthlyTotals);
      return { ...cat, monthlyTotals, max };
    });
  }, [allEntries, months, CATS]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card overflow-hidden mb-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">💫</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">12-Month Activity Pulse</h3>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
              <div className="flex gap-1 mb-1 pl-28">
                {months.map((mo, i) => (
                  <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground font-medium">
                    {mo.label.slice(0, 3)}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                {pulseData.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2">
                    <div className="w-26 flex items-center gap-1.5 shrink-0">
                      <PillarIcon icon={cat.icon} iconUrl={cat.iconUrl} size={16} className="inline-block" />
                      <span className="text-[11px] font-semibold text-foreground/80 truncate">{cat.name}</span>
                    </div>

                    <div className="flex gap-1 flex-1">
                      {cat.monthlyTotals.map((total, i) => {
                        const intensity = total > 0 ? Math.max(0.12, total / cat.max) : 0;
                        return (
                          <div
                            key={i}
                            className="flex-1 relative group"
                          >
                            <div
                              className={`h-7 rounded-sm transition-all duration-300 ${
                                total > 0 ? bgColorMap[cat.colorVar] || "bg-primary" : "bg-secondary/30"
                              }`}
                              style={{ opacity: total > 0 ? intensity : 1 }}
                            />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover border border-border rounded text-[10px] text-popover-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                              {total > 0 ? `${total} units` : "No activity"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 mt-4">
                <span className="text-[9px] text-muted-foreground">Less</span>
                {[0.15, 0.35, 0.55, 0.75, 1].map((op, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-sm bg-primary"
                    style={{ opacity: op }}
                  />
                ))}
                <span className="text-[9px] text-muted-foreground">More</span>
              </div>

              <div className="text-[9px] text-muted-foreground/50 text-right mt-1 italic">
                * Includes sample data for preview
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
