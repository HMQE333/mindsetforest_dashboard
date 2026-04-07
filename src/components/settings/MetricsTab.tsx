import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TRACKER_METRICS } from "@/lib/tracker-data";
import { CATEGORIES } from "@/lib/dashboard-data";
import { UserMetric } from "@/hooks/useUserSettings";
import { Plus, Trash2, XCircle } from "lucide-react";

interface MetricsTabProps {
  userMetrics: UserMetric[];
  onSave: (metrics: (Omit<UserMetric, "id"> & { existingId?: string })[]) => Promise<void>;
  onReset: () => Promise<void>;
}

const CATEGORY_COLOR_MAP: Record<string, string> = {
  mind: "cat-mind",
  body: "cat-body",
  creation: "cat-creation",
  exploration: "cat-exploration",
  networking: "cat-networking",
  trading: "cat-trading",
  spirit: "cat-spirit",
  order: "cat-order",
};

interface EditableMetric {
  tempId: string;
  existingId?: string; // preserve DB id for existing metrics
  label: string;
  unit: string;
  icon: string;
  categoryId: string;
}

export default function MetricsTab({ userMetrics, onSave, onReset }: MetricsTabProps) {
  const [metrics, setMetrics] = useState<EditableMetric[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const source = userMetrics.length > 0 ? userMetrics : TRACKER_METRICS;
    setMetrics(source.map((m, i) => ({
      tempId: `m-${i}-${Date.now()}`,
      existingId: 'id' in m ? (m as UserMetric).id : undefined,
      label: m.label,
      unit: m.unit,
      icon: m.icon,
      categoryId: m.categoryId,
    })));
  }, [userMetrics]);

  const update = (tempId: string, field: keyof EditableMetric, value: string) => {
    setMetrics(prev => prev.map(m => m.tempId === tempId ? { ...m, [field]: value } : m));
    setDirty(true);
  };

  const addMetric = () => {
    setMetrics(prev => [...prev, {
      tempId: `m-new-${Date.now()}`,
      label: "",
      unit: "",
      icon: "📊",
      categoryId: "mind",
    }]);
    setDirty(true);
  };

  const removeMetric = (tempId: string) => {
    setMetrics(prev => prev.filter(m => m.tempId !== tempId));
    setDirty(true);
  };

  const handleSave = async () => {
    const valid = metrics.filter(m => m.label.trim());
    await onSave(valid.map((m, i) => ({
      label: m.label.trim(),
      unit: m.unit.trim(),
      icon: m.icon || "📊",
      categoryId: m.categoryId,
      colorVar: CATEGORY_COLOR_MAP[m.categoryId] || "cat-mind",
      sortOrder: i,
      existingId: m.existingId,
    })));
    setDirty(false);
  };

  const handleReset = async () => {
    await onReset();
    setMetrics(TRACKER_METRICS.map((m, i) => ({
      tempId: `m-${i}-${Date.now()}`,
      label: m.label,
      unit: m.unit,
      icon: m.icon,
      categoryId: m.categoryId,
    })));
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-muted-foreground">Define what you track daily</p>
        <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Reset to defaults
        </button>
      </div>

      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        <AnimatePresence>
          {metrics.map((metric, i) => (
            <motion.div
              key={metric.tempId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20, height: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-card p-3 flex items-start gap-2"
            >
              
              <input
                value={metric.icon}
                onChange={e => update(metric.tempId, "icon", e.target.value)}
                className="w-9 h-9 text-center text-lg bg-transparent border border-white/10 rounded-lg focus:outline-none focus:border-primary/50 shrink-0"
                maxLength={4}
              />
              <div className="flex-1 space-y-1.5">
                <input
                  value={metric.label}
                  onChange={e => update(metric.tempId, "label", e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                  placeholder="Metric name"
                  maxLength={40}
                />
                <div className="flex gap-2">
                  <input
                    value={metric.unit}
                    onChange={e => update(metric.tempId, "unit", e.target.value)}
                    className="flex-1 bg-transparent text-xs text-muted-foreground border-b border-white/10 focus:outline-none focus:border-primary/50 pb-0.5"
                    placeholder="Unit (hrs, reps, etc)"
                    maxLength={20}
                  />
                  <select
                    value={metric.categoryId}
                    onChange={e => update(metric.tempId, "categoryId", e.target.value)}
                    className="bg-transparent text-xs text-muted-foreground border border-white/10 rounded-lg px-2 py-0.5 focus:outline-none"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id} className="bg-card text-foreground">
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => removeMetric(metric.tempId)}
                className="p-1.5 text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <button
        onClick={addMetric}
        className="w-full py-2 rounded-xl border border-dashed border-white/20 text-sm text-muted-foreground hover:text-foreground hover:border-white/40 transition-all flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> Add Metric
      </button>

      {dirty && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleSave}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all"
        >
          Save Metrics
        </motion.button>
      )}
    </div>
  );
}
