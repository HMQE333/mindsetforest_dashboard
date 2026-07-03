import { useState } from "react";
import { motion } from "framer-motion";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { Mission, Category } from "@/lib/dashboard-data";

interface TaskWithEnabled extends Mission {
  enabled: boolean;
}

interface Props {
  categories: { id: string; name: string; icon: string }[];
  defaultMissions: Record<string, Mission[]>;
  onComplete: (customMissions: Record<string, Mission[]>) => void;
  onBack: () => void;
}

export default function TaskCustomizationStep({ categories, defaultMissions, onComplete, onBack }: Props) {
  const [tasksByCategory, setTasksByCategory] = useState<Record<string, TaskWithEnabled[]>>(() => {
    const initial: Record<string, TaskWithEnabled[]> = {};
    categories.forEach(cat => {
      const missions = defaultMissions[cat.id] || [];
      initial[cat.id] = missions.map(m => ({ ...m, enabled: true }));
    });
    return initial;
  });

  const updateTask = (catId: string, index: number, field: keyof TaskWithEnabled, value: string | number | boolean) => {
    setTasksByCategory(prev => {
      const tasks = [...prev[catId]];
      tasks[index] = { ...tasks[index], [field]: value };
      return { ...prev, [catId]: tasks };
    });
  };

  const deleteTask = (catId: string, index: number) => {
    setTasksByCategory(prev => {
      const tasks = prev[catId].filter((_, i) => i !== index);
      return { ...prev, [catId]: tasks };
    });
  };

  const addTask = (catId: string) => {
    setTasksByCategory(prev => ({
      ...prev,
      [catId]: [...prev[catId], { title: "", description: "", duration: "15 min", xp: 20, enabled: true }],
    }));
  };

  const handleFinish = () => {
    const result: Record<string, Mission[]> = {};
    Object.entries(tasksByCategory).forEach(([catId, tasks]) => {
      const enabled = tasks.filter(t => t.enabled && t.title.trim());
      if (enabled.length > 0) {
        result[catId] = enabled.map(({ enabled: _, ...m }) => m);
      }
    });
    onComplete(result);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="relative z-10 w-full max-w-lg"
    >
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors">
        ← Back
      </button>

      <h2 className="text-xl font-bold text-foreground mb-1">Customize Your Daily Tasks</h2>
      <p className="text-xs text-muted-foreground mb-6">
        Review and edit the tasks inside each category. Toggle off what you don't need, add your own.
      </p>

      <div className="max-h-[55vh] overflow-y-auto pr-1">
        <Accordion type="multiple" className="space-y-2">
          {categories.map((cat, catIdx) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: catIdx * 0.04 }}
            >
              <AccordionItem value={cat.id} className="glass-card border-white/10 rounded-xl overflow-hidden border-b-0">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">{cat.icon}</span>
                    <span className="font-bold text-foreground">{cat.name}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({tasksByCategory[cat.id]?.filter(t => t.enabled).length || 0} active)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {tasksByCategory[cat.id]?.map((task, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 transition-all ${
                          task.enabled ? "border-border/50 bg-muted/20" : "border-border/20 bg-muted/5 opacity-50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Switch
                            checked={task.enabled}
                            onCheckedChange={v => updateTask(cat.id, i, "enabled", v)}
                          />
                          <button
                            onClick={() => deleteTask(cat.id, i)}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <input
                          value={task.title}
                          onChange={e => updateTask(cat.id, i, "title", e.target.value)}
                          placeholder="Task title"
                          className="w-full bg-transparent text-sm font-semibold text-foreground outline-none border-b border-border/30 focus:border-primary pb-1 mb-2 transition-colors"
                          maxLength={50}
                        />
                        <textarea
                          value={task.description}
                          onChange={e => updateTask(cat.id, i, "description", e.target.value)}
                          placeholder="Description"
                          rows={2}
                          className="w-full bg-transparent text-xs text-muted-foreground outline-none border-b border-border/20 focus:border-primary/50 pb-1 mb-2 transition-colors resize-none"
                          maxLength={120}
                        />
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration</label>
                            <input
                              value={task.duration}
                              onChange={e => updateTask(cat.id, i, "duration", e.target.value)}
                              className="w-full bg-transparent text-xs text-foreground outline-none border-b border-border/30 focus:border-primary pb-1 transition-colors"
                              maxLength={15}
                            />
                          </div>
                          <div className="w-16">
                            <label className="text-[10px] text-muted-foreground uppercase tracking-wide">XP</label>
                            <input
                              type="number"
                              value={task.xp}
                              onChange={e => updateTask(cat.id, i, "xp", parseInt(e.target.value) || 0)}
                              className="w-full bg-transparent text-xs text-foreground outline-none border-b border-border/30 focus:border-primary pb-1 transition-colors"
                              min={1}
                              max={200}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => addTask(cat.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/40 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add task
                    </button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          ))}
        </Accordion>
      </div>

      <button
        onClick={handleFinish}
        className="w-full mt-6 py-3 rounded-xl text-sm font-bold gradient-purple text-primary-foreground hover:opacity-90 transition-all glow-sm"
      >
        Looks good, let's go! 🚀
      </button>
    </motion.div>
  );
}
