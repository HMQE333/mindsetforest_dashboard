import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { TrackerEntry, getDateTotal } from "@/hooks/useTrackerEntries";
import { TRACKER_METRICS } from "@/lib/tracker-data";

interface TrackerCalendarProps {
  entries: TrackerEntry[];
}

export default function TrackerCalendar({ entries }: TrackerCalendarProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString("default", { month: "long", year: "numeric" });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Build activity map for the month
  const activityMap = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    entries.forEach((e) => {
      if (e.date.startsWith(prefix)) {
        if (!map[e.date]) map[e.date] = { total: 0, count: 0 };
        map[e.date].total += e.value;
        map[e.date].count++;
      }
    });
    return map;
  }, [entries, year, month]);

  const maxTotal = Math.max(1, ...Object.values(activityMap).map((a) => a.total));

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedEntries = useMemo(() => {
    if (!selectedDate) return [];
    return entries
      .filter((e) => e.date === selectedDate)
      .map((e) => ({ ...e, metric: TRACKER_METRICS.find((m) => m.id === e.metricId) }));
  }, [entries, selectedDate]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="glass-card overflow-hidden mb-8"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Calendar</h3>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-semibold text-foreground">{monthName}</span>
                <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-secondary/50 transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const activity = activityMap[dateStr];
                  const intensity = activity ? Math.min(activity.total / maxTotal, 1) : 0;
                  const isToday = dateStr === new Date().toISOString().split("T")[0];
                  const isSelected = dateStr === selectedDate;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`aspect-square rounded-lg text-xs font-mono flex items-center justify-center transition-all relative
                        ${isToday ? "ring-1 ring-primary/50" : ""}
                        ${isSelected ? "ring-2 ring-primary" : ""}
                        ${activity ? "hover:ring-1 hover:ring-primary/30" : "hover:bg-secondary/30"}
                      `}
                      style={{
                        backgroundColor: activity
                          ? `hsl(263 70% 58% / ${0.1 + intensity * 0.5})`
                          : undefined,
                      }}
                    >
                      <span className={activity ? "text-foreground" : "text-muted-foreground"}>{day}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected date details */}
              <AnimatePresence>
                {selectedDate && selectedEntries.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 pt-4 border-t border-border/50 space-y-2"
                  >
                    <p className="text-xs text-muted-foreground font-semibold">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" })}
                    </p>
                    {selectedEntries.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span>{e.metric?.icon}</span>
                        <span className="text-foreground/80">{e.metric?.label}</span>
                        <span className="ml-auto font-mono font-bold text-stat-value">+{e.value}</span>
                        <span className="text-xs text-muted-foreground">{e.metric?.unit}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t border-border/30">
                      <span className="text-xs text-muted-foreground">Total activity</span>
                      <span className="text-xs font-mono font-bold text-stat-value">
                        {getDateTotal(entries, selectedDate)} units
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
