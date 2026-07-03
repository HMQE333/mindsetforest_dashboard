import { useState, useEffect } from "react";
import { ExternalLink, Plus, X, Link as LinkIcon, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Bookmark {
  id: string;
  title: string;
  url: string;
}

const STORAGE_KEY = "dashboard_bookmarks";

function readBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeBookmarks(bookmarks: Bookmark[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // ignore
  }
}

export default function BookmarkBar() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(readBookmarks);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    writeBookmarks(bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    if (!showForm && !editingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm, editingId]);

  const normalizedUrl = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleSave = () => {
    const nUrl = normalizedUrl(url);
    if (!nUrl) return;
    let finalTitle = title.trim();
    if (!finalTitle) {
      try {
        finalTitle = new URL(nUrl).hostname.replace(/^www\./, "");
      } catch {
        finalTitle = nUrl;
      }
    }
    if (editingId) {
      setBookmarks((prev) =>
        prev.map((b) => (b.id === editingId ? { ...b, title: finalTitle, url: nUrl } : b))
      );
      setEditingId(null);
    } else {
      setBookmarks((prev) => [...prev, { id: crypto.randomUUID(), title: finalTitle, url: nUrl }]);
    }
    setTitle("");
    setUrl("");
    setShowForm(false);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setUrl("");
  };

  const handleDelete = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const startEdit = (b: Bookmark) => {
    setEditingId(b.id);
    setShowForm(true);
    setTitle(b.title);
    setUrl(b.url);
  };

  if (bookmarks.length === 0 && !showForm) {
    return (
      <div className="flex justify-center mb-6">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-dashed border-white/10 hover:border-white/20"
        >
          <Plus size={12} /> Add bookmark
        </button>
      </div>
    );
  }

  return (
    <div className="relative mb-6">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {bookmarks.map((b) => (
          <div key={b.id} className="group relative">
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full glass-card text-foreground/80 hover:text-foreground transition-colors hover:bg-white/5"
              title={b.url}
            >
              <LinkIcon size={11} className="text-muted-foreground" />
              <span className="max-w-[140px] truncate">{b.title}</span>
              <ExternalLink size={10} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
            <div className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center gap-0.5">
              <button
                onClick={(e) => { e.preventDefault(); startEdit(b); }}
                className="w-4 h-4 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors"
              >
                <Pencil size={8} />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); handleDelete(b.id); }}
                className="w-4 h-4 rounded-full bg-muted flex items-center justify-center hover:bg-destructive/20 transition-colors text-destructive"
              >
                <X size={8} />
              </button>
            </div>
          </div>
        ))}

        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center w-7 h-7 rounded-full glass-card text-muted-foreground hover:text-foreground transition-colors hover:bg-white/5"
            title="Add bookmark"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {(showForm || editingId) && (
        <div className="mt-3 flex justify-center">
          <div className="glass-card border border-white/15 rounded-xl p-3 flex items-center gap-2 shadow-2xl max-w-md w-full bg-background/90">
            <LinkIcon size={14} className="text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-1 py-1 text-sm focus-visible:ring-0 focus-visible:border-white/30 h-8 min-w-0"
              onKeyDown={(e) => e.key === "Enter" && url && handleSave()}
            />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="URL"
              className="bg-transparent border-0 border-b border-white/10 rounded-none px-1 py-1 text-sm focus-visible:ring-0 focus-visible:border-white/30 h-8 min-w-0 flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!normalizedUrl(url)}
              className="text-xs px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground font-semibold disabled:opacity-40 shrink-0"
            >
              {editingId ? "Save" : "Add"}
            </button>
            <button
              onClick={closeForm}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
