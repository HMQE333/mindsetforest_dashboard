import { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Link as LinkIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useBookmarks, normalizedUrl, type Bookmark } from "@/hooks/useBookmarks";

function getFavicon(url: string) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return null;
  }
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const ArchiveBookmarksView = () => {
  const { bookmarks, addBookmark, updateBookmark, deleteBookmark } = useBookmarks();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    );
  }, [bookmarks, search]);

  const openForm = () => {
    setEditingId(null);
    setTitle("");
    setUrl("");
    setShowForm(true);
  };

  const startEdit = (b: Bookmark) => {
    setEditingId(b.id);
    setTitle(b.title);
    setUrl(b.url);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setUrl("");
  };

  const handleSave = () => {
    if (!normalizedUrl(url)) return;
    if (editingId) updateBookmark(editingId, title, url);
    else addBookmark(title, url);
    closeForm();
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this bookmark?")) return;
    deleteBookmark(id);
  };

  return (
    <div className="space-y-4">
      {/* Search + add */}
      <div className="glass-card p-4 flex items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search bookmarks..."
          className="bg-background/50 border-white/10"
        />
        <button
          onClick={openForm}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl gradient-purple text-primary-foreground font-bold glow-sm hover:opacity-90 transition-all"
        >
          <Plus size={14} /> Add bookmark
        </button>
      </div>

      {/* Add / edit form */}
      {showForm && (
        <div className="glass-card border border-white/15 rounded-xl p-3 flex items-center gap-2 shadow-2xl">
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
            placeholder="URL (e.g. example.com)"
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
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Bookmark blocks */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">⭐</span>
          <p>{bookmarks.length === 0 ? "No bookmarks yet. Add one above." : "No bookmarks match your search."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((b) => {
            const favicon = getFavicon(b.url);
            const hostname = getHostname(b.url);
            return (
              <div key={b.id} className="group relative">
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={b.url}
                  className="block glass-card p-4 h-full hover:border-primary/30 border border-transparent transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center overflow-hidden">
                      {favicon ? (
                        <img
                          src={favicon}
                          alt=""
                          className="w-5 h-5"
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span className="text-sm">⭐</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1">
                        {b.title}
                        <ExternalLink size={11} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{hostname}</p>
                    </div>
                  </div>
                </a>
                {/* Edit / delete controls */}
                <div className="absolute top-2 right-2 hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      startEdit(b);
                    }}
                    className="w-6 h-6 rounded-md bg-muted/80 backdrop-blur flex items-center justify-center hover:bg-accent transition-colors"
                    title="Edit"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(b.id);
                    }}
                    className="w-6 h-6 rounded-md bg-muted/80 backdrop-blur flex items-center justify-center hover:bg-destructive/20 text-destructive transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArchiveBookmarksView;
