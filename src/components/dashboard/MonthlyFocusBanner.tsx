import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface FocusItem {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
}

export default function MonthlyFocusBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<FocusItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newText, setNewText] = useState("");
  const [loading, setLoading] = useState(true);

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

  const addItem = async () => {
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
  };

  const removeItem = async (id: string) => {
    await supabase.from("user_notifications").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  if (loading || dismissed) return null;

  // Show banner if there are items, or if editing (to allow adding first item)
  if (items.length === 0 && !editing) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-card border border-primary/20 rounded-2xl p-4 mb-4 relative"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <span className="text-sm font-bold text-foreground">Monthly Focus</span>
          <span className="text-xs text-muted-foreground">— {monthLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(!editing)}
            className="p-1.5 rounded-lg hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        <AnimatePresence>
          {items.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex items-center gap-2 text-sm"
            >
              <span className="text-primary/60">•</span>
              <span className="text-foreground/80 flex-1">{item.title}</span>
              {editing && (
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add new (edit mode) */}
      {editing && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-center gap-2 mt-3"
        >
          <input
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addItem()}
            placeholder="Add a focus item..."
            className="flex-1 bg-muted/20 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={addItem}
            disabled={!newText.trim()}
            className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-30"
          >
            <Plus className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </motion.div>
  );
}
