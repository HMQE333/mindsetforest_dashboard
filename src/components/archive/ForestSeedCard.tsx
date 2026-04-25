import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Users, Target, Eye, EyeOff, Trash2, Flag, Droplet, BookmarkPlus, Pencil, X, Library } from "lucide-react";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import { useForestState, type SeedWithAuthor } from "@/hooks/useForestState";
import AuthorPeekPopover from "./AuthorPeekPopover";
import { useForestCollections } from "@/hooks/useForestCollections";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  seed: SeedWithAuthor;
  isMine: boolean;
  onEdit?: (seed: SeedWithAuthor) => void;
}

const VIS_META = {
  public: { Icon: Globe, label: "Everyone" },
  friends: { Icon: Users, label: "Friends" },
  custom: { Icon: Target, label: "Specific" },
} as const;

const ForestSeedCard = ({ seed, isMine, onEdit }: Props) => {
  const allPillars = usePillars();
  const f = useForestState();
  const cols = useForestCollections();
  const [readerOpen, setReaderOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);

  const pillarObjs = seed.pillars.map((p) => allPillars.find((pl) => pl.id === p)).filter(Boolean);
  const Vis = VIS_META[seed.visibility];

  const openReader = () => {
    setReaderOpen(true);
    f.recordView(seed.id);
  };

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    await f.reportSeed(seed.id, reportReason);
    setReportOpen(false);
    setReportReason("");
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`glass-card-hover p-4 space-y-3 group ${!seed.is_active ? "opacity-60" : ""}`}
      >
        {/* Header: author + visibility */}
        <div className="flex items-center gap-2">
          <AuthorPeekPopover author={seed.author} authorId={seed.author_id}>
            <button className="flex items-center gap-2 min-w-0 flex-1 text-left rounded-lg hover:bg-white/5 -m-1 p-1 transition-colors">
              <span className="text-xl">{seed.author?.avatar_emoji || "🦊"}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">
                  {seed.author?.display_name || `@${seed.author?.username || "unknown"}`}
                  {seed.isEdited && (
                    <span className="ml-1.5 text-[9px] font-semibold text-muted-foreground">(edited)</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  @{seed.author?.username || "unknown"} · {new Date(seed.published_at).toLocaleDateString()}
                </p>
              </div>
            </button>
          </AuthorPeekPopover>
          {isMine && (
            <span title={Vis.label} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-muted/40 text-muted-foreground">
              <Vis.Icon className="w-3 h-3" /> {Vis.label}
            </span>
          )}
          {!seed.is_active && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/20 text-destructive font-bold">🔒 Hidden</span>
          )}
        </div>

        {/* Body */}
        <button onClick={openReader} className="text-left w-full space-y-1.5">
          <h4 className="font-bold text-sm text-foreground line-clamp-2">{seed.title || "Untitled"}</h4>
          <p className="text-xs text-muted-foreground line-clamp-3">{seed.content}</p>
        </button>

        {/* Tags */}
        {(pillarObjs.length > 0 || seed.directions.length > 0 || seed.tags.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {pillarObjs.map((p) => (
              <span key={p!.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5"
                    style={{ backgroundColor: p!.color + "22", color: p!.color }}>
                <PillarIcon icon={p!.icon} iconUrl={p!.iconUrl} size={11} className="inline-block" /> {p!.name}
              </span>
            ))}
            {seed.directions.slice(0, 3).map((d) => (
              <span key={d} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground font-semibold">
                {d}
              </span>
            ))}
            {seed.tags.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground font-medium">
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Actions row */}
        <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
          <button
            onClick={() => f.waterSeed(seed.id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
              seed.iWatered
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-muted/40 text-muted-foreground hover:text-cyan-400"
            }`}
            title={seed.iWatered ? "Unwater" : "Water this seed"}
          >
            <Droplet className="w-3 h-3" /> {seed.water_count}
          </button>

          {!isMine && (
            <button
              onClick={() => f.saveSeed(seed.id)}
              disabled={seed.iSaved}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                seed.iSaved
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-muted/40 text-muted-foreground hover:text-emerald-400"
              }`}
              title={seed.iSaved ? "Already in your Archive" : "Save to your Archive"}
            >
              <BookmarkPlus className="w-3 h-3" /> {seed.iSaved ? "Saved" : "Save"}
            </button>
          )}

          {/* Add-to-collection menu (only own seeds, since collections only accept own seeds) */}
          {isMine && cols.mine.length > 0 && (
            <Popover open={collectionMenuOpen} onOpenChange={setCollectionMenuOpen}>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-muted/40 text-muted-foreground hover:text-primary transition-all"
                  title="Add to a collection"
                >
                  <Library className="w-3 h-3" /> Bundle
                </button>
              </PopoverTrigger>
              <PopoverContent className="glass-card border-white/10 w-60 p-2" align="start">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 pb-1">
                  Add to collection
                </p>
                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {cols.mine.map((c) => (
                    <button
                      key={c.id}
                      onClick={async () => {
                        await cols.addSeedToCollection(c.id, seed.id);
                        setCollectionMenuOpen(false);
                      }}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground hover:bg-white/5 transition-colors"
                    >
                      <span className="text-base shrink-0">{c.emoji}</span>
                      <span className="truncate flex-1">{c.title}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {c.seedCount}
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <span className="ml-auto text-[10px] text-muted-foreground/70 flex items-center gap-2">
            <span>👁 {seed.view_count}</span>
            <span>📥 {seed.save_count}</span>
          </span>

          {isMine ? (
            <>
              <button onClick={() => onEdit?.(seed)} title="Edit"
                className="p-1 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {seed.is_active ? (
                <button onClick={() => f.unpublishSeed(seed.id)} title="Unpublish"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all">
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={() => f.republishSeed(seed.id)} title="Republish"
                  className="p-1 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all">
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => { if (confirm("Delete this seed permanently?")) f.deleteSeed(seed.id); }} title="Delete"
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => setReportOpen(true)} title="Report"
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>

      {/* Reader */}
      <AnimatePresence>
        {readerOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setReaderOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl max-h-[85vh] glass-card rounded-2xl flex flex-col overflow-hidden"
            >
              <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">{seed.author?.avatar_emoji || "🦊"}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{seed.author?.display_name || `@${seed.author?.username}`}</p>
                    <p className="text-[10px] text-muted-foreground">@{seed.author?.username}</p>
                  </div>
                </div>
                <button onClick={() => setReaderOpen(false)} className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40">
                  <X className="w-4 h-4" />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <h2 className="font-bold text-foreground text-xl mb-3">{seed.title || "Untitled"}</h2>
                {(pillarObjs.length > 0 || seed.directions.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {pillarObjs.map((p) => (
                      <span key={p!.id} className="text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1" style={{ backgroundColor: p!.color + "22", color: p!.color }}>
                        <PillarIcon icon={p!.icon} iconUrl={p!.iconUrl} size={12} className="inline-block" /> {p!.name}
                      </span>
                    ))}
                    {seed.directions.map((d) => (
                      <span key={d} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground font-semibold">{d}</span>
                    ))}
                  </div>
                )}
                <p className="text-[15px] leading-7 text-foreground/90 whitespace-pre-wrap font-serif">
                  {seed.content || "—"}
                </p>
                {seed.source_url && (
                  <a href={seed.source_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-xs text-primary hover:underline break-all">
                    🔗 {seed.source_url}
                  </a>
                )}
              </div>
              <footer className="flex items-center justify-between px-6 py-3 border-t border-white/5 text-[11px] text-muted-foreground shrink-0">
                <span>💧 {seed.water_count} · 📥 {seed.save_count} · 👁 {seed.view_count}</span>
                {!isMine && !seed.iSaved && (
                  <button onClick={() => f.saveSeed(seed.id)} className="text-primary hover:underline font-medium">
                    📥 Save to my Archive
                  </button>
                )}
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Report */}
      <AnimatePresence>
        {reportOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setReportOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card rounded-2xl p-5 max-w-md w-full space-y-3"
            >
              <h3 className="font-bold text-foreground">🚩 Report this seed</h3>
              <p className="text-xs text-muted-foreground">Tell us what's wrong. Reports are confidential.</p>
              <div className="flex flex-wrap gap-1.5">
                {["Spam", "Hate / Abuse", "Adult content", "Off-topic", "Other"].map((r) => (
                  <button key={r} onClick={() => setReportReason(r)}
                    className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                      reportReason === r ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}>
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Reason…"
                maxLength={500}
                className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-background/50 border border-white/10 text-xs text-foreground"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setReportOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
                <button
                  onClick={async () => { await f.blockAuthor(seed.author_id); setReportOpen(false); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-muted/40 text-foreground font-bold hover:bg-muted/60"
                >
                  🚫 Block author
                </button>
                <button onClick={handleReport} disabled={!reportReason.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-destructive/20 text-destructive font-bold hover:bg-destructive/30 disabled:opacity-40">
                  Report
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ForestSeedCard;