import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface FocusItem {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
}

type FocusPulseStyle = "glow" | "ping" | "none";

interface MonthlyFocusProps {
  pulseStyle?: FocusPulseStyle;
}

export default function MonthlyFocusBanner({ pulseStyle = "glow" }: MonthlyFocusProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<FocusItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthLabel = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("month", currentMonth)
        .eq("is_active", true);
      if (data) setItems(data.map(d => ({ id: d.id, title: d.title, content: d.content, is_active: d.is_active })));
      setLoading(false);
    };
    load();
  }, [user, currentMonth]);

  // Periodic pulse animation every ~10s
  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }, 10000);
    // Initial pulse after 3s
    const initial = setTimeout(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }, 3000);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, []);

  const addItem = useCallback(async () => {
    if (!user || !newText.trim()) return;
    const { data, error } = await supabase
      .from("user_notifications")
      .insert({ user_id: user.id, title: newText.trim(), month: currentMonth })
      .select()
      .single();
    if (data && !error) {
      setItems(prev => [...prev, { id: data.id, title: data.title, content: data.content, is_active: data.is_active }]);
      setNewText("");
    }
  }, [user, newText, currentMonth]);

  const removeItem = useCallback(async (id: string) => {
    await supabase.from("user_notifications").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  if (loading) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative glass-card px-4 py-3 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          title="Monthly Focus"
        >
          <span className="text-base inline-block transition-transform duration-700 ease-in-out" style={{ transform: pulse ? "scale(1.1)" : "scale(1)" }}>
            🎯
          </span>
          {/* Badge dot */}
          {items.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {items.length}
            </span>
          )}
          {/* Soft glow */}
          <span
            className="absolute inset-0 rounded-xl pointer-events-none transition-all duration-1000 ease-in-out"
            style={{
              boxShadow: pulse ? "0 0 12px 3px hsl(var(--primary) / 0.35)" : "0 0 0px 0px hsl(var(--primary) / 0)",
            }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">🎯</span>
              <span className="text-xs font-bold text-foreground">Monthly Focus</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{monthLabel}</span>
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(!editing); }}
                className="p-1 rounded hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground ml-1"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-1.5 max-h-48 overflow-y-auto">
          {items.length === 0 && !editing && (
            <p className="text-xs text-muted-foreground text-center py-2">No focus items yet — click ✏️ to add</p>
          )}
          <AnimatePresence>
            {items.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-2 text-xs"
              >
                <span className="text-primary/60">•</span>
                <span className="text-foreground/80 flex-1">{item.title}</span>
                {editing && (
                  <button
                    onClick={() => removeItem(item.id)}
                    className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {editing && (
          <div className="p-3 pt-0">
            <div className="flex items-center gap-2">
              <input
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addItem()}
                placeholder="Add a focus item..."
                className="flex-1 bg-muted/20 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
              <button
                onClick={addItem}
                disabled={!newText.trim()}
                className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
