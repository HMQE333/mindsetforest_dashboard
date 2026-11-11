import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserSettings } from "@/hooks/useUserSettings";
import type { MissionLink } from "@/lib/dashboard-data";

interface BookOption { id: string; title: string }

/** The books worth linking (reading first, then to-read), loaded once per open dialog. */
function useBookOptions(): BookOption[] {
  const { user } = useAuth();
  const [books, setBooks] = useState<BookOption[]>([]);
  useEffect(() => {
    if (!user) return;
    let live = true;
    void supabase.from("user_books").select("id,title,status").eq("user_id", user.id).in("status", ["reading", "to-read"]).then(({ data }) => {
      if (!live || !data) return;
      setBooks([...data].sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title) : a.status === "reading" ? -1 : 1)).map((b) => ({ id: b.id, title: b.title })));
    });
    return () => { live = false; };
  }, [user]);
  return books;
}

/**
 * "Counts toward": a Stats metric or a Library book. When the mission is
 * ticked, or its timer stopped, a quiet card offers the amount to save there.
 */
export default function MissionLinkPicker({ value, onChange }: { value?: MissionLink; onChange: (link: MissionLink | undefined) => void }) {
  const { getMetrics } = useUserSettings();
  const metrics = getMetrics();
  const books = useBookOptions();
  const current = value ? (value.kind === "metric" ? `m:${value.metricId}` : `b:${value.bookId}`) : "";
  const pick = (v: string) => {
    if (!v) return onChange(undefined);
    if (v.startsWith("m:")) {
      const m = metrics.find((x) => x.id === v.slice(2));
      return onChange(m ? { kind: "metric", metricId: m.id, label: m.label, unit: m.unit } : undefined);
    }
    const b = books.find((x) => x.id === v.slice(2));
    onChange(b ? { kind: "book", bookId: b.id, label: b.title } : undefined);
  };
  return (
    <label className="mt-2 flex items-center gap-2 text-xs text-foreground/60" title="When you tick it or stop its timer, a small card offers the amount to log there. Nothing is logged unless you save it.">
      <Link2 className="h-3.5 w-3.5 shrink-0 text-foreground/45" />
      <span className="shrink-0">Counts toward</span>
      <select
        value={current}
        onChange={(e) => pick(e.target.value)}
        className="min-w-0 flex-1 rounded-full border border-white/20 bg-background/80 px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/90"
      >
        <option value="">Nothing</option>
        {metrics.length > 0 && (
          <optgroup label="Stats">
            {metrics.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.icon} {m.label}{m.unit ? ` (${m.unit})` : ""}</option>)}
          </optgroup>
        )}
        {books.length > 0 && (
          <optgroup label="Library: pages of">
            {books.map((b) => <option key={b.id} value={`b:${b.id}`}>📖 {b.title}</option>)}
          </optgroup>
        )}
        {value && !(value.kind === "metric" ? metrics.some((m) => m.id === value.metricId) : books.some((b) => b.id === value.bookId)) && (
          <option value={current}>{value.label ?? "Linked"} (not found)</option>
        )}
      </select>
    </label>
  );
}
