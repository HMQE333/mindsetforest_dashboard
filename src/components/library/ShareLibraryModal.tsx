import { useState, useEffect, useMemo, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Link2, Code2, Trash2, Eye, EyeOff, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useLibraryShares, type LibraryShare } from "@/hooks/useLibraryShares";
import { PUBLIC_SHARE_ORIGIN } from "@/lib/share-config";

type FilterKey = "search" | "status" | "rating" | "tag" | "format" | "pillar" | "viewMode";

interface ShareLibraryModalProps {
  open: boolean;
  onClose: () => void;
  currentTab: "books" | "courses";
  currentFilters: {
    search?: string;
    status?: string;
    rating?: number | null;
    tag?: string | null;
    format?: string | null;
    pillar?: string | null;
    viewMode?: "block" | "list";
  };
}

const FILTER_LABELS: Record<FilterKey, string> = {
  search: "Search term",
  status: "Status",
  rating: "Min rating",
  tag: "Tag",
  format: "Format",
  pillar: "Pillar",
  viewMode: "View mode",
};

export default function ShareLibraryModal({ open, onClose, currentTab, currentFilters }: ShareLibraryModalProps) {
  const { shares, createShare, updateShare, deleteShare, togglePublic } = useLibraryShares();

  const [name, setName] = useState("My Library");
  const [includedFilters, setIncludedFilters] = useState<Record<FilterKey, boolean>>({
    search: false,
    status: true,
    rating: false,
    tag: false,
    format: false,
    pillar: false,
    viewMode: true,
  });
  const [isPublic, setIsPublic] = useState(true);

  // Detect which filters have actual values (only those become toggleable defaults)
  useEffect(() => {
    if (!open) return;
    setIncludedFilters({
      search: !!currentFilters.search,
      status: !!currentFilters.status && currentFilters.status !== "all",
      rating: !!currentFilters.rating,
      tag: !!currentFilters.tag,
      format: !!currentFilters.format,
      pillar: !!currentFilters.pillar,
      viewMode: true,
    });
    setName(currentTab === "books" ? "My Reading List" : "My Courses");
  }, [open, currentFilters, currentTab]);

  const bakedFilters = useMemo(() => {
    const out: Record<string, any> = {};
    if (includedFilters.search && currentFilters.search) out.search = currentFilters.search;
    if (includedFilters.status && currentFilters.status && currentFilters.status !== "all") out.status = currentFilters.status;
    if (includedFilters.rating && currentFilters.rating) out.rating = currentFilters.rating;
    if (includedFilters.tag && currentFilters.tag) out.tag = currentFilters.tag;
    if (includedFilters.format && currentFilters.format) out.format = currentFilters.format;
    if (includedFilters.pillar && currentFilters.pillar) out.pillar = currentFilters.pillar;
    if (includedFilters.viewMode) out.viewMode = currentFilters.viewMode || "block";
    return out;
  }, [includedFilters, currentFilters]);

  const handleCreate = async () => {
    const created = await createShare({
      name: name.trim() || "My Library",
      tab: currentTab,
      filters: bakedFilters,
      is_public: isPublic,
    });
    if (created) {
      // Auto-copy URL
      const url = `${PUBLIC_SHARE_ORIGIN}/share/library/${created.id}`;
      navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    }
  };

  const copyUrl = (id: string) => {
    const url = `${PUBLIC_SHARE_ORIGIN}/share/library/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied!");
  };

  const copyEmbed = (id: string) => {
    const url = `${PUBLIC_SHARE_ORIGIN}/share/library/${id}`;
    const snippet = `<iframe src="${url}" width="100%" height="600" frameborder="0" style="border-radius:12px;"></iframe>`;
    navigator.clipboard.writeText(snippet);
    toast.success("Embed snippet copied!");
  };

  if (!open) return null;

  const activeFilterChips = Object.entries(bakedFilters).filter(([k]) => k !== "viewMode");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-card rounded-2xl border border-white/10 p-6 space-y-5"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" /> Share Library View
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Generate a public link or iframe embed</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* New share section */}
          <div className="space-y-4 p-4 rounded-xl bg-muted/20 border border-white/5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Share name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Reading list 2026"
                className="w-full px-3 py-2 rounded-lg bg-background/50 border border-white/5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">What to share</label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => {
                  const hasValue = key === "viewMode" ? true :
                    key === "search" ? !!currentFilters.search :
                    key === "status" ? (currentFilters.status && currentFilters.status !== "all") :
                    key === "rating" ? !!currentFilters.rating :
                    key === "tag" ? !!currentFilters.tag :
                    key === "format" ? !!currentFilters.format :
                    key === "pillar" ? !!currentFilters.pillar : false;
                  if (!hasValue) return null;
                  const active = includedFilters[key];
                  const value =
                    key === "search" ? currentFilters.search :
                    key === "status" ? currentFilters.status :
                    key === "rating" ? `${currentFilters.rating}+` :
                    key === "tag" ? currentFilters.tag :
                    key === "format" ? currentFilters.format :
                    key === "pillar" ? currentFilters.pillar :
                    key === "viewMode" ? currentFilters.viewMode : "";
                  return (
                    <button
                      key={key}
                      onClick={() => setIncludedFilters(p => ({ ...p, [key]: !p[key] }))}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                        active ? "bg-primary/20 text-primary ring-1 ring-primary/40" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                      {FILTER_LABELS[key]}: <span className="opacity-80">{String(value)}</span>
                    </button>
                  );
                })}
                {activeFilterChips.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No filters active — share will show your full {currentTab} list.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Visibility</p>
                <p className="text-[10px] text-muted-foreground">{isPublic ? "Anyone with the link can view" : "Link disabled — not viewable"}</p>
              </div>
              <button
                onClick={() => setIsPublic(p => !p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isPublic ? "bg-emerald-500/20 text-emerald-400" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {isPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {isPublic ? "Public" : "Private"}
              </button>
            </div>

            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90 transition-all"
            >
              <Plus className="w-4 h-4" /> Create share link
            </button>
            <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
              🔗 Links use your public domain <span className="font-mono text-foreground/80">hmqe.org</span> so anyone can view without logging in.
            </p>
          </div>

          {/* Existing shares */}
          {shares.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your shares ({shares.length})</h3>
              <div className="space-y-2">
                {shares.map(s => <ExistingShareRow key={s.id} share={s} onCopyUrl={copyUrl} onCopyEmbed={copyEmbed} onDelete={deleteShare} onTogglePublic={togglePublic} onRename={(id, n) => updateShare(id, { name: n })} />)}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ExistingShareRow({ share, onCopyUrl, onCopyEmbed, onDelete, onTogglePublic, onRename }: {
  share: LibraryShare;
  onCopyUrl: (id: string) => void;
  onCopyEmbed: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePublic: (id: string, p: boolean) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(share.name);

  const filterCount = Object.keys(share.filters || {}).filter(k => k !== "viewMode").length;

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/20 border border-white/5">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={() => { onRename(share.id, draftName.trim() || share.name); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") { onRename(share.id, draftName.trim() || share.name); setEditing(false); } }}
            autoFocus
            className="w-full px-2 py-1 rounded bg-background/60 border border-primary/40 text-sm text-foreground focus:outline-none"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="text-sm font-bold text-foreground truncate text-left hover:text-primary transition-colors">
            {share.name}
          </button>
        )}
        <p className="text-[10px] text-muted-foreground">
          {share.tab === "books" ? "📖 Books" : "🎓 Courses"} · {filterCount} filter{filterCount !== 1 ? "s" : ""} · 👁 {share.view_count}
        </p>
      </div>
      <button
        onClick={() => onTogglePublic(share.id, !share.is_public)}
        title={share.is_public ? "Click to make private" : "Click to make public"}
        className={`p-1.5 rounded-lg transition-all ${share.is_public ? "text-emerald-400 hover:bg-emerald-500/10" : "text-muted-foreground hover:bg-muted/40"}`}
      >
        {share.is_public ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      <button onClick={() => onCopyUrl(share.id)} title="Copy link" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
        <Copy className="w-4 h-4" />
      </button>
      <button onClick={() => onCopyEmbed(share.id)} title="Copy iframe embed" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
        <Code2 className="w-4 h-4" />
      </button>
      <button onClick={() => { if (confirm(`Delete "${share.name}"?`)) onDelete(share.id); }} title="Delete share" className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}