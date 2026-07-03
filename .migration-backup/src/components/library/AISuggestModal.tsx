import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Book } from "@/lib/library-data";
import { toast } from "sonner";

interface AISuggestModalProps {
  open: boolean;
  onClose: () => void;
  books: Book[];
}

interface Suggestion {
  title: string;
  author: string;
  reason: string;
}

export default function AISuggestModal({ open, onClose, books }: AISuggestModalProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setSuggestions([]);
    try {
      const bookList = books.map(b => `${b.title}${b.author ? ` by ${b.author}` : ""}`).join(", ");
      const { data, error } = await supabase.functions.invoke("ai-book-suggest", {
        body: { mode: "suggest", bookList },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions || []);
      setFetched(true);
    } catch {
      toast.error("Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    if (!isOpen) { onClose(); return; }
    if (!fetched) fetchSuggestions();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="glass-card border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Book Suggestions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">Finding books for you...</span>
            </div>
          )}

          {!loading && suggestions.length === 0 && fetched && (
            <p className="text-sm text-muted-foreground text-center py-4">No suggestions found. Add more books to your library!</p>
          )}

          {suggestions.map((s, i) => (
            <div key={i} className="glass-card rounded-xl p-3 border border-white/5">
              <h4 className="font-bold text-sm text-foreground">{s.title}</h4>
              {s.author && <p className="text-xs text-muted-foreground">{s.author}</p>}
              <p className="text-xs text-foreground/70 mt-1">{s.reason}</p>
            </div>
          ))}

          {!loading && fetched && (
            <button onClick={fetchSuggestions} className="w-full py-2 rounded-xl bg-muted/30 text-sm text-muted-foreground hover:text-foreground transition-all">
              🔄 Get more suggestions
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
