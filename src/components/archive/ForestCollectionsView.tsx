import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Globe, Lock, X, Library } from "lucide-react";
import { useForestCollections, type ForestCollection } from "@/hooks/useForestCollections";
import { useForestState, type SeedWithAuthor } from "@/hooks/useForestState";
import ForestSeedCard from "./ForestSeedCard";
import { toast } from "sonner";

const EMOJI_PRESETS = ["📚", "🌿", "🔥", "💡", "🧭", "🎯", "🛠️", "✨", "🌊", "🌙", "🪴", "🦋"];

const ForestCollectionsView = () => {
  const cols = useForestCollections();
  const forest = useForestState();
  const [tab, setTab] = useState<"discover" | "mine">("discover");
  const [createOpen, setCreateOpen] = useState(false);
  const [openCol, setOpenCol] = useState<ForestCollection | null>(null);

  const list = tab === "mine" ? cols.mine : cols.discover;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      {/* Tab switch */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "discover" as const, label: "🔭 Discover", count: cols.discover.length },
          { id: "mine" as const, label: "📚 My collections", count: cols.mine.length },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              tab === t.id ? "gradient-purple text-primary-foreground glow-sm" : "glass-card text-muted-foreground hover:text-foreground"
            }`}>
            {t.label} <span className="opacity-70 ml-1">({t.count})</span>
          </button>
        ))}
        <button onClick={() => setCreateOpen(true)}
          className="ml-auto px-3 py-1.5 rounded-xl text-xs font-bold gradient-purple text-primary-foreground glow-sm flex items-center gap-1">
          <Plus className="w-3 h-3" /> New collection
        </button>
      </div>

      {/* Grid */}
      {cols.loading ? (
        <p className="text-center py-12 text-muted-foreground animate-pulse">📚 Loading collections…</p>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Library className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {tab === "mine"
              ? "No collections yet. Bundle your best seeds into a curated set."
              : "No public collections yet. Be the first curator!"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((c) => (
            <button key={c.id} onClick={() => setOpenCol(c)}
              className="glass-card-hover p-4 text-left space-y-2 group">
              <div className="flex items-start gap-3">
                <span className="text-3xl shrink-0">{c.emoji}</span>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-sm text-foreground truncate">{c.title}</h4>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {c.ownerName || "Unknown"} · {c.seedCount} seed{c.seedCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span title={c.is_public ? "Public" : "Private"}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/40 text-muted-foreground flex items-center gap-0.5">
                  {c.is_public ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                </span>
              </div>
              {c.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateCollectionModal onClose={() => setCreateOpen(false)} onCreate={cols.createCollection} />
      )}

      {openCol && (
        <CollectionDetailModal
          collection={openCol}
          onClose={() => setOpenCol(null)}
          isMine={cols.mine.some((m) => m.id === openCol.id)}
          fetchSeedIds={cols.fetchCollectionSeedIds}
          allSeeds={[...forest.mySeeds, ...forest.discoverSeeds]}
          onDelete={async () => {
            if (!confirm("Delete this collection? Seeds themselves remain.")) return;
            await cols.deleteCollection(openCol.id);
            setOpenCol(null);
          }}
          onAddSeeds={(seedIds) => Promise.all(seedIds.map((id) => cols.addSeedToCollection(openCol.id, id)))}
          onRemoveSeed={(seedId) => cols.removeSeedFromCollection(openCol.id, seedId)}
        />
      )}
    </motion.div>
  );
};

/* ---------- Create modal ---------- */
const CreateCollectionModal = ({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: Partial<ForestCollection>) => Promise<ForestCollection | null>;
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Give your collection a title");
      return;
    }
    setSaving(true);
    const c = await onCreate({ title: title.trim(), description: description.trim(), emoji, is_public: isPublic });
    setSaving(false);
    if (c) onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-2xl p-5 max-w-md w-full space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">📚 New collection</h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Emoji</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {EMOJI_PRESETS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)}
                className={`w-8 h-8 rounded-lg text-base transition-all ${
                  emoji === e ? "bg-primary/20 ring-1 ring-primary" : "bg-muted/30 hover:bg-muted/50"
                }`}>{e}</button>
            ))}
          </div>
        </div>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
          placeholder="Collection title (e.g. 'Stoic wisdom')"
          className="w-full px-3 py-2 rounded-lg bg-background/50 border border-white/10 text-sm text-foreground"
        />
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500}
          placeholder="What ties these seeds together? (optional)"
          className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-background/50 border border-white/10 text-xs text-foreground"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)}
            className="rounded border-white/20" />
          <span>{isPublic ? "🌍 Public — anyone can browse" : "🔒 Private — only you"}</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
          <button onClick={submit} disabled={saving || !title.trim()}
            className="text-xs px-3 py-1.5 rounded-lg gradient-purple text-primary-foreground font-bold glow-sm disabled:opacity-40">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground text-center">Limit: 5 collections per day.</p>
      </motion.div>
    </motion.div>
  );
};

/* ---------- Detail modal ---------- */
const CollectionDetailModal = ({
  collection,
  onClose,
  isMine,
  fetchSeedIds,
  allSeeds,
  onDelete,
  onAddSeeds,
  onRemoveSeed,
}: {
  collection: ForestCollection;
  onClose: () => void;
  isMine: boolean;
  fetchSeedIds: (id: string) => Promise<string[]>;
  allSeeds: SeedWithAuthor[];
  onDelete: () => Promise<void>;
  onAddSeeds: (seedIds: string[]) => Promise<unknown>;
  onRemoveSeed: (seedId: string) => Promise<void>;
}) => {
  const [seedIds, setSeedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adderOpen, setAdderOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSeedIds(collection.id).then((ids) => {
      if (!cancelled) {
        setSeedIds(ids);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [collection.id, fetchSeedIds]);

  const seeds = useMemo(() => {
    const map = new Map(allSeeds.map((s) => [s.id, s]));
    return seedIds.map((id) => map.get(id)).filter(Boolean) as SeedWithAuthor[];
  }, [seedIds, allSeeds]);

  // Candidate seeds: only my own seeds can be added (we know they're visible)
  const myCandidates = useMemo(
    () => allSeeds.filter((s) => isMine && !seedIds.includes(s.id)),
    [allSeeds, isMine, seedIds],
  );

  const togglePick = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const commitAdd = async () => {
    if (picked.size === 0) return;
    await onAddSeeds(Array.from(picked));
    setSeedIds((prev) => [...prev, ...Array.from(picked)]);
    setPicked(new Set());
    setAdderOpen(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="glass-card rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl">{collection.emoji}</span>
            <div className="min-w-0">
              <h3 className="font-bold text-foreground truncate">{collection.title}</h3>
              <p className="text-[10px] text-muted-foreground truncate">
                {collection.ownerName || "Unknown"} · {seeds.length} seed{seeds.length === 1 ? "" : "s"}
                {collection.is_public ? " · 🌍 Public" : " · 🔒 Private"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isMine && (
              <>
                <button onClick={() => setAdderOpen(true)} title="Add seeds"
                  className="p-1.5 rounded-md text-primary hover:bg-primary/10"><Plus className="w-4 h-4" /></button>
                <button onClick={onDelete} title="Delete collection"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {collection.description && (
            <p className="text-xs text-muted-foreground italic">{collection.description}</p>
          )}

          {loading ? (
            <p className="text-center py-8 text-xs text-muted-foreground animate-pulse">Loading seeds…</p>
          ) : seeds.length === 0 ? (
            <p className="text-center py-8 text-xs text-muted-foreground">
              {isMine ? "Add seeds with the + button above." : "Empty collection."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {seeds.map((s) => (
                <div key={s.id} className="relative">
                  <ForestSeedCard seed={s} isMine={false} />
                  {isMine && (
                    <button onClick={async () => { await onRemoveSeed(s.id); setSeedIds((p) => p.filter((x) => x !== s.id)); }}
                      title="Remove from collection"
                      className="absolute top-2 right-2 p-1 rounded-md bg-background/80 text-muted-foreground hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adder picker */}
        <AnimatePresence>
          {adderOpen && (
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
              className="border-t border-white/10 bg-background/90 backdrop-blur p-4 shrink-0 max-h-[40vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-foreground">Pick from your seeds ({picked.size} selected)</p>
                <div className="flex gap-1">
                  <button onClick={() => { setAdderOpen(false); setPicked(new Set()); }}
                    className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1">Cancel</button>
                  <button onClick={commitAdd} disabled={picked.size === 0}
                    className="text-[11px] px-2 py-1 rounded-lg gradient-purple text-primary-foreground font-bold disabled:opacity-40">
                    Add {picked.size > 0 ? `(${picked.size})` : ""}
                  </button>
                </div>
              </div>
              {myCandidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-3">All your seeds are already in this collection.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {myCandidates.map((s) => (
                    <button key={s.id} onClick={() => togglePick(s.id)}
                      className={`text-left p-2 rounded-lg border transition-all ${
                        picked.has(s.id) ? "border-primary bg-primary/10" : "border-white/10 hover:border-white/20 bg-muted/20"
                      }`}>
                      <p className="text-xs font-bold text-foreground truncate">{s.title || "Untitled"}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-1">{s.content}</p>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default ForestCollectionsView;