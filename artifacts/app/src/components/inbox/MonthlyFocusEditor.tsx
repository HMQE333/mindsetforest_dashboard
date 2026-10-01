import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMonthlyFocus } from "@/hooks/useMonthlyFocus";

/** Add or remove the month's goals in place (the bell inbox). */
export default function MonthlyFocusEditor() {
  const { items, add, remove } = useMonthlyFocus();
  const [text, setText] = useState("");
  const submit = async () => {
    if (!text.trim()) return;
    if (await add(text)) setText("");
    else toast.error("Couldn't add the goal");
  };
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={item.id} className="group flex items-center gap-2 text-sm">
          <span className={`tabular-nums ${i < 3 ? "text-primary/80" : "text-muted-foreground/60"}`}>{i + 1}.</span>
          <span className="flex-1 text-foreground/90">{item.title}</span>
          <button
            onClick={() => void remove(item.id)}
            className="p-1 rounded text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${item.title}`}
            title="Remove"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="flex items-center gap-2 pt-1"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={items.length === 0 ? "The goal that matters most" : "Add a goal"}
          aria-label="New goal"
          className="flex-1 min-w-0 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
        <button type="submit" disabled={!text.trim()} className="p-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30" aria-label="Add goal">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </form>
      {items.length > 3 && <p className="text-[11px] text-muted-foreground">The first three show in reviews.</p>}
    </div>
  );
}
