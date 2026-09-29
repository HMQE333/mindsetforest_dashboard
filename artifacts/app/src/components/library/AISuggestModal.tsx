import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2, Plus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Book } from "@/lib/library-data";

interface AISuggestModalProps {
  open: boolean;
  onClose: () => void;
  books: Book[];
  onAdd: (book: Partial<Book>) => void | Promise<void>;
}

interface Suggestion {
  title: string;
  author: string;
  reason: string;
}

/**
 * Five books picked from what is on the shelf (the server reads the shelf,
 * ratings and the user's own context). Each can go straight onto the
 * to-read shelf; "More" asks again without repeating what was shown.
 */
export default function AISuggestModal({ open, onClose, books, onAdd }: AISuggestModalProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const shown = useRef<string[]>([]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ai-book-suggest", {
        body: { mode: "suggest", exclude: shown.current },
      });
      if (fnError) throw fnError;
      const list: Suggestion[] = data?.suggestions || [];
      shown.current = [...shown.current, ...list.map(s => s.title)];
      setSuggestions(list);
      if (list.length === 0) setError("No new suggestions this time. Try again.");
    } catch {
      setError("Could not get suggestions right now.");
    } finally {
      setLoading(false);
    }
  };

  // Ask as soon as the window opens (an open set by the parent never fires onOpenChange).
  useEffect(() => {
    if (open && suggestions.length === 0 && !loading) void fetchSuggestions();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onShelf = (s: Suggestion) => books.some(b => b.title.trim().toLowerCase() === s.title.trim().toLowerCase());

  const add = async (s: Suggestion) => {
    await onAdd({ title: s.title, author: s.author, status: "to-read", notes: s.reason });
    setAdded(prev => new Set(prev).add(s.title));
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="glass-card border-white/10 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Book Suggestions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Reading your shelf…</span>
            </div>
          )}

          {!loading && error && <p className="text-sm text-muted-foreground text-center py-4">{error}</p>}

          {!loading && suggestions.map((s) => {
            const done = added.has(s.title) || onShelf(s);
            return (
              <div key={s.title} className="glass-card rounded-xl p-3 border border-white/5 flex gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-sm text-foreground">{s.title}</h4>
                  {s.author && <p className="text-xs text-muted-foreground">{s.author}</p>}
                  <p className="text-xs text-foreground/70 mt-1">{s.reason}</p>
                </div>
                <button
                  onClick={() => void add(s)}
                  disabled={done}
                  className={`self-start shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${done ? "bg-muted/30 text-muted-foreground" : "gradient-purple text-primary-foreground hover:opacity-90"}`}
                  title={done ? "On your shelf" : "Add to To Read"}
                >
                  {done ? <><Check className="w-3.5 h-3.5" /> Added</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
                </button>
              </div>
            );
          })}

          {!loading && (suggestions.length > 0 || error) && (
            <button onClick={() => void fetchSuggestions()} className="w-full py-2 rounded-xl bg-muted/30 text-sm text-muted-foreground hover:text-foreground transition-all">
              🔄 More suggestions
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
