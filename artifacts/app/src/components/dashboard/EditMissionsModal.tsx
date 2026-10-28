import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Dice5, Plus, X, PencilLine, Trash2, Lock, Repeat, Clock, Star, CalendarDays } from "lucide-react";
import { CATEGORIES, Mission, MissionVariant } from "@/lib/dashboard-data";
import { useUserProjects } from "@/hooks/useUserProjects";

interface EditMissionsModalProps {
  categoryId: string;
  missions: Mission[];
  onSave: (categoryId: string, missions: Mission[]) => void;
  onClose: () => void;
}

export default function EditMissionsModal({ categoryId, missions, onSave, onClose }: EditMissionsModalProps) {
  const [buffer, setBuffer] = useState<Mission[]>([]);
  const category = CATEGORIES.find(c => c.id === categoryId);
  const { getProjectFromKey } = useUserProjects();
  const project = categoryId.startsWith("project-") ? getProjectFromKey(categoryId) : null;
  const displayName = project?.name || category?.name || "";

  // Rows keep their `__originalIndex` through the edit so saveCustomMissions can
  // move today's ticks with them (it strips the field before storing).
  useEffect(() => {
    setBuffer(missions.map(m => ({ ...m, persistent: m.persistent !== false ? true : false })));
  }, [missions]);

  const updateField = (index: number, field: keyof Mission, value: string | number) => {
    setBuffer(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  const deleteRow = (index: number) => {
    setBuffer(prev => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setBuffer(prev => [...prev, { title: "", description: "", duration: "", xp: 10, persistent: false, url: "" }]);
  };

  const togglePersistent = (index: number) => {
    setBuffer(prev => prev.map((m, i) => i === index ? { ...m, persistent: !m.persistent } : m));
  };

  const setDays = (index: number, days: number[] | undefined) => {
    setBuffer(prev => prev.map((m, i) => {
      if (i !== index) return m;
      // Treat full week or empty as undefined (every day)
      if (!days || days.length === 0 || days.length === 7) {
        const { daysOfWeek, ...rest } = m;
        return rest as Mission;
      }
      return { ...m, daysOfWeek: [...days].sort((a, b) => a - b) };
    }));
  };

  const toggleDay = (index: number, day: number) => {
    setBuffer(prev => prev.map((m, i) => {
      if (i !== index) return m;
      const current = m.daysOfWeek && m.daysOfWeek.length > 0 ? m.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
      const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
      if (next.length === 0 || next.length === 7) {
        const { daysOfWeek, ...rest } = m;
        return rest as Mission;
      }
      return { ...m, daysOfWeek: next.sort((a, b) => a - b) };
    }));
  };

  const toggleVariants = (index: number) => {
    setBuffer(prev => prev.map((m, i) => {
      if (i !== index) return m;
      if (m.variants && m.variants.length > 0) {
        // remove variants
        const { variants, ...rest } = m;
        return rest;
      }
      // seed with current task content as variant 1 + a blank one
      const seed: MissionVariant = {
        title: m.title || "Variant A",
        description: m.description,
        duration: m.duration,
        xp: m.xp,
        url: m.url,
        weight: 50,
      };
      const blank: MissionVariant = { title: "Variant B", description: "", duration: m.duration, xp: m.xp, weight: 50 };
      return { ...m, variants: [seed, blank] };
    }));
  };

  const updateVariant = (mIdx: number, vIdx: number, field: keyof MissionVariant, value: string | number) => {
    setBuffer(prev => prev.map((m, i) => {
      if (i !== mIdx || !m.variants) return m;
      const variants = m.variants.map((v, j) => j === vIdx ? { ...v, [field]: value } : v);
      return { ...m, variants };
    }));
  };

  const addVariant = (mIdx: number) => {
    setBuffer(prev => prev.map((m, i) => {
      if (i !== mIdx) return m;
      const variants = [...(m.variants || []), { title: "New variant", description: "", duration: m.duration, xp: m.xp, weight: 25 } as MissionVariant];
      return { ...m, variants };
    }));
  };

  const deleteVariant = (mIdx: number, vIdx: number) => {
    setBuffer(prev => prev.map((m, i) => {
      if (i !== mIdx || !m.variants) return m;
      if (m.variants.length <= 1) return m;
      return { ...m, variants: m.variants.filter((_, j) => j !== vIdx) };
    }));
  };

  const handleSave = () => {
    const cleaned = buffer
      .map(m => ({
        ...m,
        title: m.title.trim(),
        description: m.description.trim(),
        duration: m.duration.trim(),
        xp: Number(m.xp) || 10,
        persistent: !!m.persistent,
        url: m.url?.trim() || undefined,
        variants: m.variants && m.variants.length > 0
          ? m.variants
              .map(v => ({
                ...v,
                title: v.title.trim(),
                description: v.description.trim(),
                duration: v.duration.trim(),
                xp: Number(v.xp) || 10,
                weight: Math.max(1, Number(v.weight) || 1),
                url: v.url?.trim() || undefined,
              }))
              .filter(v => v.title.length > 0)
          : undefined,
      }))
      .filter(m => m.title.length > 0);
    onSave(categoryId, cleaned);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-stretch sm:items-center justify-center p-0 sm:p-4"
      style={{
        background: "radial-gradient(circle at top, rgba(129,140,248,0.18), transparent 55%), radial-gradient(circle at bottom, rgba(236,72,153,0.18), transparent 55%), rgba(3,7,18,0.92)",
        backdropFilter: "blur(10px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 8 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[960px] h-[100dvh] sm:h-auto sm:max-h-[86vh] flex flex-col gap-3 sm:gap-4 p-3 sm:p-5 rounded-none sm:rounded-3xl border-0 sm:border border-white/15"
        style={{
          background: "radial-gradient(circle at top left, rgba(129,140,248,0.16), transparent 55%), radial-gradient(circle at bottom right, rgba(236,72,153,0.16), transparent 55%), #020617",
          boxShadow: "0 32px 80px rgba(15,23,42,0.95)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="shrink-0 w-9 h-9 rounded-xl border border-white/20 bg-white/[0.07] flex items-center justify-center">
            <PencilLine className="h-4 w-4 text-foreground/80" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-foreground truncate">Edit tasks <span className="text-foreground/40 font-medium">· {displayName}</span></h2>
            <p className="hidden sm:block text-xs text-foreground/55">Add, rename, remove or randomize missions. Saved to your account.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-foreground/70 hover:bg-white/10 hover:text-foreground transition-colors flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mission List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 sm:space-y-3 py-1 pr-0.5 sm:pr-1 overscroll-contain">
          {buffer.length === 0 && (
            <p className="text-sm text-foreground/50 text-center py-5">No missions yet. Click "Add task" below.</p>
          )}
          {buffer.map((mission, index) => {
            const hasVariants = !!(mission.variants && mission.variants.length > 0);
            const totalWeight = hasVariants ? mission.variants!.reduce((s, v) => s + (Number(v.weight) || 0), 0) : 0;
            return (
              <div key={index} className="rounded-2xl border border-white/10 hover:border-white/20 focus-within:border-primary/50 bg-white/[0.03] p-3 transition-colors">
                <div className="grid grid-cols-1 sm:grid-cols-[2.3fr_1.2fr] gap-2.5 sm:gap-3">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                    <input
                      className="flex-1 min-w-0 w-full rounded-full border border-white/20 bg-background/80 text-foreground px-3 py-2 text-sm font-medium outline-none focus:border-primary/90 focus:ring-1 focus:ring-primary/70 disabled:opacity-50"
                      placeholder="Task title (slot label)"
                      value={mission.title}
                      onChange={e => updateField(index, "title", e.target.value)}
                    />
                      <button
                        onClick={() => deleteRow(index)}
                        aria-label="Delete task"
                        title="Delete task"
                        className="shrink-0 w-9 h-9 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-foreground/60 hover:bg-destructive/25 hover:border-destructive/50 hover:text-destructive-foreground transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <textarea
                      className="w-full rounded-xl border border-white/20 bg-background/80 text-foreground px-3 py-2 text-sm outline-none focus:border-primary/90 resize-none min-h-[48px] disabled:opacity-50"
                      placeholder="Description"
                      value={mission.description}
                      onChange={e => updateField(index, "description", e.target.value)}
                      disabled={hasVariants}
                    />
                    {!hasVariants && (
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <input
                          className="w-full rounded-full border border-white/20 bg-background/80 text-foreground px-3 py-1.5 text-xs outline-none focus:border-primary/90 placeholder:text-muted-foreground"
                          placeholder="Link URL (optional)"
                          value={mission.url || ""}
                          onChange={e => updateField(index, "url", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                      <label className="flex items-center gap-1.5 rounded-full border border-white/20 bg-background/80 px-3 focus-within:border-primary/90">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-foreground/45" />
                        <input
                          className="w-full min-w-0 bg-transparent text-foreground py-2 text-sm outline-none disabled:opacity-50"
                          placeholder="Duration"
                          value={mission.duration}
                          onChange={e => updateField(index, "duration", e.target.value)}
                          disabled={hasVariants}
                        />
                      </label>
                      <label className="flex items-center gap-1 rounded-full border border-white/20 bg-background/80 pl-2.5 pr-3 focus-within:border-primary/90" title="XP">
                        <Star className="h-3.5 w-3.5 shrink-0 text-amber-300/80" />
                        <input
                          type="number"
                          inputMode="numeric"
                          className="w-12 bg-transparent text-foreground py-2 text-sm text-center outline-none disabled:opacity-50"
                          value={mission.xp}
                          min={1}
                          max={500}
                          onChange={e => updateField(index, "xp", Number(e.target.value) || 0)}
                          disabled={hasVariants}
                        />
                        <span className="text-[10px] font-semibold text-foreground/45">XP</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-1 gap-2">
                    <button
                      onClick={() => togglePersistent(index)}
                      className={`min-w-0 flex items-center justify-center sm:justify-start gap-2 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border ${
                        mission.persistent
                          ? "border-primary/60 bg-primary/20 text-primary"
                          : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
                      }`}
                    >
                      {mission.persistent ? <><Lock className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Stays after reset</span></> : <><Repeat className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Resets daily</span></>}
                    </button>
                    <button
                      onClick={() => toggleVariants(index)}
                      className={`min-w-0 flex items-center justify-center sm:justify-start gap-2 px-3 py-2 sm:py-1.5 rounded-full text-xs font-medium transition-all border ${
                        hasVariants
                          ? "border-primary/60 bg-primary/20 text-primary"
                          : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
                      }`}
                    >
                      <Dice5 className="h-3.5 w-3.5" />
                      <span className="truncate">{hasVariants ? `Variants on (${mission.variants!.length})` : "Random variants"}</span>
                    </button>
                    </div>
                  </div>
                </div>

                {/* Day-of-week scheduler */}
                <DayPicker
                  days={mission.daysOfWeek}
                  onToggle={(d) => toggleDay(index, d)}
                  onSetAll={() => setDays(index, undefined)}
                  onWeekdays={() => setDays(index, [1, 2, 3, 4, 5])}
                  onWeekends={() => setDays(index, [0, 6])}
                />

                {hasVariants && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] uppercase tracking-wider text-foreground/50 font-semibold">Variants. Daily roll picks one</p>
                      <button
                        onClick={() => addVariant(index)}
                        className="flex items-center gap-1 text-xs text-primary/80 hover:text-primary transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Add variant
                      </button>
                    </div>
                    {mission.variants!.map((v, vIdx) => {
                      const pct = totalWeight > 0 ? Math.round(((Number(v.weight) || 0) / totalWeight) * 100) : 0;
                      return (
                        <div key={vIdx} className="rounded-xl border border-white/10 bg-white/[0.04] p-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 min-w-[36px] text-center">{pct}%</span>
                            <input
                              className="flex-1 rounded-full border border-white/15 bg-background/80 text-foreground px-3 py-1.5 text-xs outline-none focus:border-primary/70"
                              placeholder="Variant title"
                              value={v.title}
                              onChange={e => updateVariant(index, vIdx, "title", e.target.value)}
                            />
                            <input
                              type="number"
                              min={1}
                              max={100}
                              className="w-14 rounded-full border border-white/15 bg-background/80 text-foreground px-2 py-1.5 text-xs text-center outline-none"
                              value={v.weight}
                              onChange={e => updateVariant(index, vIdx, "weight", Number(e.target.value) || 0)}
                              title="Weight"
                            />
                            <button
                              onClick={() => deleteVariant(index, vIdx)}
                              disabled={mission.variants!.length <= 1}
                              className="w-7 h-7 rounded-full border border-white/15 bg-white/5 flex items-center justify-center text-muted-foreground hover:bg-destructive/20 hover:border-destructive/40 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <textarea
                            className="w-full rounded-lg border border-white/15 bg-background/80 text-foreground px-2 py-1.5 text-xs outline-none focus:border-primary/70 resize-none min-h-[36px]"
                            placeholder="Description"
                            value={v.description}
                            onChange={e => updateVariant(index, vIdx, "description", e.target.value)}
                          />
                          <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_1fr] gap-1.5">
                            <input
                              className="w-full rounded-full border border-white/15 bg-background/80 text-foreground px-2 py-1 text-xs outline-none"
                              placeholder="Duration"
                              value={v.duration}
                              onChange={e => updateVariant(index, vIdx, "duration", e.target.value)}
                            />
                            <input
                              type="number"
                              min={1}
                              className="w-full rounded-full border border-white/15 bg-background/80 text-foreground px-2 py-1 text-xs text-center outline-none"
                              placeholder="XP"
                              value={v.xp}
                              onChange={e => updateVariant(index, vIdx, "xp", Number(e.target.value) || 0)}
                            />
                            <input
                              className="w-full rounded-full border border-white/15 bg-background/80 text-foreground px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
                              placeholder="Link URL (opt)"
                              value={v.url || ""}
                              onChange={e => updateVariant(index, vIdx, "url", e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 sm:gap-3 pt-3 border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
          <button onClick={addRow} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full border border-white/20 bg-background/80 text-foreground text-sm hover:bg-primary/20 transition-colors">
            <Plus className="h-4 w-4" /> <span className="hidden min-[360px]:inline">Add task</span>
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="hidden min-[400px]:block px-4 py-2 rounded-full border border-white/20 bg-background/80 text-foreground text-sm hover:bg-primary/20 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-full border border-primary gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:-translate-y-0.5 transition-all"
          >
            Save<span className="hidden min-[360px]:inline"> changes</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayPickerProps {
  days: number[] | undefined;
  onToggle: (d: number) => void;
  onSetAll: () => void;
  onWeekdays: () => void;
  onWeekends: () => void;
}

function DayPicker({ days, onToggle, onSetAll, onWeekdays, onWeekends }: DayPickerProps) {
  const isAll = !days || days.length === 0 || days.length === 7;
  const active = isAll ? [0, 1, 2, 3, 4, 5, 6] : days;
  const sorted = [...active].sort((a, b) => a - b);
  const isWeekdays = !isAll && sorted.length === 5 && sorted.every(d => d >= 1 && d <= 5);
  const isWeekends = !isAll && sorted.length === 2 && sorted.includes(0) && sorted.includes(6);
  const label = isAll
    ? "Every day"
    : isWeekdays
      ? "Weekdays only"
      : isWeekends
        ? "Weekends only"
        : sorted.map(d => DAY_FULL[d]).join(", ");

  return (
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <span className="hidden min-[360px]:inline text-[10px] uppercase tracking-wider text-foreground/50 font-semibold mr-1">Days</span>
          {DAY_LABELS.map((lbl, d) => {
            const on = active.includes(d);
            return (
              <button
                key={d}
                onClick={() => onToggle(d)}
                title={DAY_FULL[d]}
                className={`w-8 h-8 sm:w-7 sm:h-7 rounded-full text-[11px] font-bold transition-all border ${
                  on
                    ? "border-primary/60 bg-primary/25 text-primary"
                    : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
                }`}
              >
                {lbl}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onSetAll}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
              isAll ? "border-primary/60 bg-primary/20 text-primary" : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
            }`}
          >
            Every day
          </button>
          <button
            onClick={onWeekdays}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
              isWeekdays ? "border-primary/60 bg-primary/20 text-primary" : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
            }`}
          >
            Weekdays
          </button>
          <button
            onClick={onWeekends}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
              isWeekends ? "border-primary/60 bg-primary/20 text-primary" : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/25"
            }`}
          >
            Weekends
          </button>
        </div>
      </div>
      {!isAll && !isWeekdays && !isWeekends && <p className="text-[10px] text-foreground/50 mt-1.5 flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {label}</p>}
    </div>
  );
}

