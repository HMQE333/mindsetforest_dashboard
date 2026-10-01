import { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, ExternalLink, Link as LinkIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizedUrl, type Bookmark, type useBookmarks } from "@/hooks/useBookmarks";
import type { ArchiveBlock } from "@/lib/archive-data";
import { safeUrl } from "@/lib/safe-url";
import ArchiveEditModal from "./ArchiveEditModal";

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

const FIELD =
  "flex-1 min-w-0 bg-transparent border-0 border-b border-white/10 rounded-none px-1 py-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-white/30 h-8";

interface Props {
  bookmarks: ReturnType<typeof useBookmarks>;
  blocks: ArchiveBlock[];
  updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  deleteBlock: (id: string) => Promise<unknown>;
}

/**
 * What you keep close from your own archive: bookmarked notes (the star on
 * a note card), links bookmarked from a note's link menu, and URLs added
 * here by hand.
 */
const ArchiveBookmarksView = ({ bookmarks: store, blocks, updateBlock, deleteBlock }: Props) => {
  const { bookmarks, addBookmark, updateBookmark, deleteBookmark } = store;
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [openNote, setOpenNote] = useState<ArchiveBlock | null>(null);

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const blockById = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const q = search.trim().toLowerCase();

  const notes = useMemo(() => {
    const starred = blocks.filter((b) => b.is_starred);
    if (!q) return starred;
    return starred.filter((b) => b.title.toLowerCase().includes(q) || b.content.slice(0, 5000).toLowerCase().includes(q));
  }, [blocks, q]);

  const links = useMemo(() => {
    if (!q) return bookmarks;
    return bookmarks.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
  }, [bookmarks, q]);

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

  const nothingYet = bookmarks.length === 0 && !blocks.some((b) => b.is_starred);

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
          <Plus size={14} /> Add URL
        </button>
      </div>

      {/* Add / edit form */}
      {/* URL first (the one required field); on a phone the title and buttons wrap to a second row. */}
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="glass-card border border-white/15 rounded-xl p-3 flex flex-wrap items-center gap-2 shadow-2xl"
        >
          <div className="flex items-center gap-2 flex-[2_1_14rem] min-w-0">
            <LinkIcon size={14} className="text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a URL (e.g. example.com)"
              aria-label="URL"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={FIELD}
            />
          </div>
          <div className="flex items-center gap-2 flex-[1_1_12rem] min-w-0">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              aria-label="Title"
              className={FIELD}
            />
            <button
              type="submit"
              disabled={!normalizedUrl(url)}
              className="text-xs px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground font-semibold disabled:opacity-40 shrink-0"
            >
              {editingId ? "Save" : "Add"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title="Cancel"
              aria-label="Cancel"
            >
              <X size={16} />
            </button>
          </div>
        </form>
      )}

      {nothingYet ? (
        <div className="text-center py-12 text-muted-foreground space-y-2">
          <span className="text-3xl block">⭐</span>
          <p>No bookmarks yet.</p>
          <p className="text-xs max-w-sm mx-auto">
            Star a note in the Library, choose "Bookmark link" in a link's menu, or add any URL above.
          </p>
        </div>
      ) : notes.length === 0 && links.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No bookmarks match your search.</div>
      ) : (
        <>
          {/* Bookmarked notes */}
          {notes.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes ({notes.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {notes.map((b) => (
                  <div key={b.id} className="group relative">
                    <button
                      onClick={() => setOpenNote(b)}
                      className="block w-full text-left glass-card p-4 h-full hover:border-primary/30 border border-transparent transition-all"
                    >
                      <p className="text-sm font-semibold text-foreground truncate pr-6 group-hover:text-primary transition-colors">{b.title || "Untitled"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{b.content.slice(0, 300)}</p>
                    </button>
                    <button
                      onClick={() => updateBlock(b.id, { is_starred: false })}
                      className="absolute top-3 right-3 text-amber-400 hover:opacity-70 transition-opacity"
                      title="Remove bookmark"
                      aria-label="Remove bookmark"
                    >
                      ★
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bookmarked links and URLs */}
          {links.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Links ({links.length})</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {links.map((b) => {
                  const favicon = getFavicon(b.url);
                  const hostname = getHostname(b.url);
                  const note = b.blockId ? blockById.get(b.blockId) : undefined;
                  return (
                    <div key={b.id} className="group relative">
                      <a
                        href={safeUrl(b.url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={b.url}
                        className={`block glass-card p-4 h-full hover:border-primary/30 border border-transparent transition-all ${note ? "pb-8" : ""}`}
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
                          <div className="flex-1 min-w-0 pr-12">
                            <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors flex items-center gap-1">
                              {b.title}
                              <ExternalLink size={11} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{hostname}</p>
                          </div>
                        </div>
                      </a>
                      {note && (
                        <button
                          onClick={() => setOpenNote(note)}
                          className="absolute left-[3.75rem] bottom-3 max-w-[60%] truncate text-[10px] text-muted-foreground hover:text-primary transition-colors"
                          title="Open the note this link is from"
                        >
                          from: {note.title || "Untitled"}
                        </button>
                      )}
                      {/* Edit / delete: on hover, always on touch screens */}
                      <div className="absolute top-2 right-2 hidden group-hover:flex [@media(hover:none)]:flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            startEdit(b);
                          }}
                          className="w-6 h-6 rounded-md bg-muted/80 backdrop-blur flex items-center justify-center hover:bg-accent transition-colors"
                          title="Edit"
                          aria-label="Edit bookmark"
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
                          aria-label="Delete bookmark"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      <ArchiveEditModal
        block={openNote}
        open={!!openNote}
        onClose={() => setOpenNote(null)}
        onSave={updateBlock}
        onDelete={deleteBlock}
      />
    </div>
  );
};

export default ArchiveBookmarksView;
