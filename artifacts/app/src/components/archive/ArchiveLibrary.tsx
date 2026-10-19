import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue, memo } from "react";
import { Input } from "@/components/ui/input";
import { Link2Off, Download, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { ARCHIVE_BLOCKS_CHANGED_EVENT, ArchiveSaveError } from "@/lib/archive-data";
import { usePillars, type Pillar } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import ArchiveBlockCard from "./ArchiveBlockCard";
import ArchiveEditModal from "./ArchiveEditModal";
import ObsidianImportModal from "./ObsidianImportModal";
import VideoSummaryPanel, { type VideoPanelTarget } from "./VideoSummaryPanel";
import type { VideoMatch } from "@/hooks/useArchiveState";
import { useSavedSeedUpdates } from "@/hooks/useForestState";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ArchiveBlock } from "@/lib/archive-data";
import { todayKey } from "@/lib/today";
import { filterLibrary, filterRanked, type SortMode } from "./archive-index";
import { useRemembered } from "./remembered";

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, u: Partial<ArchiveBlock>) => Promise<unknown>;
  deleteBlock: (id: string) => Promise<unknown>;
  addBlocks: (blocks: Partial<ArchiveBlock>[]) => Promise<unknown>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  semanticSearch: (query: string) => Promise<ArchiveBlock[]>;
  /** Search that also returns matching video summaries; used for Smart search when given. */
  searchArchive?: (query: string) => Promise<{ blocks: ArchiveBlock[]; videos: VideoMatch[] }>;
  embedAll: () => Promise<any>;
  onPlant?: (block: ArchiveBlock) => void;
  /**
   * Opening a note (a click on its card). Gets the note and the whole list in
   * the order shown, the current search, filters and sort applied, so a
   * reader can step to the previous and next note. Without it the editor opens.
   */
  onOpen?: (block: ArchiveBlock, list: ArchiveBlock[]) => void;
}

/** Cards rendered at first, and added each time the end of the list comes near. */
const CARDS_PAGE = 40;

const announceChanged = () => window.dispatchEvent(new CustomEvent(ARCHIVE_BLOCKS_CHANGED_EVENT));

/** The pillar filter row; its own component so typing in the search does not re-render it. */
const PillarFilter = memo(function PillarFilter({ pillars, value, onChange }: { pillars: Pillar[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <button
        onClick={() => onChange(null)}
        className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors ${!value ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}
      >
        All
      </button>
      {pillars.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(value === p.id ? null : p.id)}
          className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors flex items-center gap-1"
          style={{
            backgroundColor: value === p.id ? p.color : p.color + "18",
            color: value === p.id ? "#fff" : p.color,
          }}
        >
          <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={14} className="inline-block" /> {p.name}
        </button>
      ))}
    </div>
  );
});

const ArchiveLibrary = ({ blocks, loading, updateBlock, deleteBlock, addBlocks, selectedIds, toggleSelect, semanticSearch, searchArchive, embedAll, onPlant, onOpen }: Props) => {
  const pillars = usePillars();
  const pillarById = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);
  // "Update" on notes saved from the Forest, without loading the Forest.
  const { availableUpdates, resync } = useSavedSeedUpdates(blocks, announceChanged);
  // Search, filters and sort survive a switch to another sub-tab and back.
  const [search, setSearch] = useRemembered("library.search", "");
  const [filterPillar, setFilterPillar] = useRemembered<string | null>("library.pillar", null);
  const [hideLinks, setHideLinks] = useRemembered("library.hideLinks", false);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);
  const [sortMode, setSortMode] = useRemembered<SortMode>("library.sort", "newest");
  const [smartSearch, setSmartSearch] = useRemembered("library.smart", false);
  const [semanticResults, setSemanticResults] = useState<ArchiveBlock[] | null>(null);
  const [videoResults, setVideoResults] = useState<VideoMatch[]>([]);
  const [video, setVideo] = useState<VideoPanelTarget | null>(null);
  const [similarityScores, setSimilarityScores] = useState<Record<string, number>>({});
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [includeTags, setIncludeTags] = useRemembered("library.tags", false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // The field shows every key at once; the list follows a moment later, when
  // React has time, so typing never waits for the cards.
  const query = useDeferredValue(search);

  // Semantic search debounce
  useEffect(() => {
    if (!smartSearch || query.trim().length < 2) {
      setSemanticResults(null);
      setVideoResults([]);
      setSimilarityScores({});
      return;
    }
    const timer = setTimeout(async () => {
      setSemanticLoading(true);
      let results: ArchiveBlock[];
      if (searchArchive) {
        const found = await searchArchive(query.trim());
        results = found.blocks;
        setVideoResults(found.videos);
      } else {
        results = await semanticSearch(query.trim());
      }
      const scores: Record<string, number> = {};
      for (const r of results as any[]) {
        if (r.similarity !== undefined) scores[r.id] = r.similarity;
      }
      setSimilarityScores(scores);
      setSemanticResults(results);
      setSemanticLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [query, smartSearch, semanticSearch, searchArchive]);

  // Which notes match, in order: the regex and lower-casing work behind it is
  // done once per note (archive-index), not per note per key.
  const filtered = useMemo(() => {
    if (smartSearch && semanticResults !== null) return filterRanked(semanticResults, blocks, { pillar: filterPillar, hideLinks });
    return filterLibrary(blocks, { search: query, includeTags, pillar: filterPillar, hideLinks, sort: sortMode });
  }, [blocks, query, includeTags, filterPillar, hideLinks, sortMode, smartSearch, semanticResults]);

  // The first cards render at once and the rest as the end of the list comes
  // near, so a new search shows its top matches without building every card.
  const [limit, setLimit] = useState(CARDS_PAGE);
  useEffect(() => setLimit(CARDS_PAGE), [query, includeTags, filterPillar, hideLinks, sortMode, smartSearch, semanticResults]);
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);
  const complete = limit >= filtered.length;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !complete) setLimit((n) => n + CARDS_PAGE);
        setShowExport(entry.isIntersecting && complete);
      },
      { rootMargin: "0px 0px 600px 0px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [complete, visible]);

  // Card callbacks with one identity, so a card re-renders only when its own note does.
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const openBlock = useCallback((block: ArchiveBlock) => {
    if (onOpen) onOpen(block, filteredRef.current);
    else setEditBlock(block);
  }, [onOpen]);
  const editOne = useCallback((block: ArchiveBlock) => setEditBlock(block), []);
  const resyncSeed = useCallback((seedId: string) => void resync(seedId), [resync]);
  const showScores = smartSearch && semanticResults !== null;

  const handleExport = useCallback(() => {
    const exportData = blocks.map(({ embedding, ...rest }: any) => rest);
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-export-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${blocks.length} blocks`);
  }, [blocks]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importConfirm, setImportConfirm] = useState<{ parsed: any[]; dupes: number; total: number } | null>(null);
  const [filterDupes, setFilterDupes] = useState(true);
  const [obsidianOpen, setObsidianOpen] = useState(false);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const findDuplicates = useCallback((incoming: any[]) => {
    return incoming.filter((item) =>
      blocks.some(
        (b) => b.title === item.title && b.content === item.content
      )
    ).length;
  }, [blocks]);

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        toast.error("Invalid file: expected an array of blocks");
        return;
      }
      const cleaned = parsed.map(({ id, user_id, embedding, ...rest }: any) => rest);
      const dupes = findDuplicates(cleaned);
      setImportConfirm({ parsed: cleaned, dupes, total: cleaned.length });
    } catch {
      toast.error("Failed to parse file. Make sure it's a valid archive JSON");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [findDuplicates]);

  const confirmImport = useCallback(async () => {
    if (!importConfirm) return;
    let toImport = importConfirm.parsed;
    if (filterDupes) {
      toImport = toImport.filter(
        (item) => !blocks.some((b) => b.title === item.title && b.content === item.content)
      );
    }
    if (toImport.length === 0) {
      toast.info("All blocks are duplicates. Nothing to import");
    } else {
      try {
        await addBlocks(toImport);
        toast.success(`Imported ${toImport.length} blocks`);
      } catch (e) {
        const saved = e instanceof ArchiveSaveError ? e.saved : 0;
        toast.error(`Imported ${saved} of ${toImport.length} blocks, then the save failed`, {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    }
    setImportConfirm(null);
  }, [importConfirm, filterDupes, blocks, addBlocks]);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-2xl animate-pulse">📚</span>
        <p className="mt-2">Loading library...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={smartSearch ? "🧠 Search blocks by meaning..." : "🔍 Search blocks..."}
              className="bg-background/50 border-white/10"
            />
            {search && (
              <button
                onClick={() => { setSearch(""); setSemanticResults(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={() => setIncludeTags(!includeTags)}
            className={`shrink-0 w-10 h-10 rounded-xl text-sm font-bold transition-all flex items-center justify-center ${
              includeTags
                ? "gradient-purple text-primary-foreground glow-sm"
                : "bg-muted/40 text-muted-foreground hover:text-foreground"
            }`}
            title={includeTags ? "Tag search ON. Click to disable" : "Tag search OFF. Click to include tags"}
          >
            #
          </button>
          <div className="flex items-center gap-1">
            {([
              { id: "newest" as SortMode, label: "Newest" },
              { id: "oldest" as SortMode, label: "Oldest" },
              { id: "az" as SortMode, label: "A-Z" },
            ]).map((s) => (
              <button
                key={s.id}
                onClick={() => setSortMode(s.id)}
                className={`text-[11px] px-2.5 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap ${
                  sortMode === s.id ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
          ))}
          </div>
          {selectedIds.size > 0 || filtered.length > 0 ? (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => {
                  const allSelected = filtered.every((b) => selectedIds.has(b.id));
                  if (allSelected) {
                    filtered.forEach((b) => toggleSelect(b.id));
                  } else {
                    filtered.forEach((b) => { if (!selectedIds.has(b.id)) toggleSelect(b.id); });
                  }
                }}
                className="text-[11px] px-2.5 py-1.5 rounded-lg font-semibold bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
              >
                {filtered.every((b) => selectedIds.has(b.id)) && filtered.length > 0 ? "☐ Deselect All" : "☑ Select All"}
              </button>
            </div>
          ) : null}
        </div>
        <PillarFilter pillars={pillars} value={filterPillar} onChange={setFilterPillar} />
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setHideLinks(!hideLinks)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all flex items-center gap-1 ${
              hideLinks ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Link2Off size={12} /> Hide Links
          </button>
          <span className="w-px h-4 bg-white/10" />
          <button
            onClick={() => { setSmartSearch(!smartSearch); setSemanticResults(null); }}
            className={`text-[11px] px-2.5 py-1 rounded-full font-bold transition-all ${
              smartSearch
                ? "gradient-purple text-primary-foreground glow-sm"
                : "bg-muted/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            🧠 Smart Search {smartSearch ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => embedAll()}
            className="text-[11px] px-2.5 py-1 rounded-full font-bold bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
            title="Generate embeddings for all unembedded blocks"
          >
            🔄 Re-index
          </button>
          {semanticLoading && (
            <span className="text-[11px] text-muted-foreground animate-pulse ml-1">Searching...</span>
          )}
        </div>
      </div>

      {/* Video summaries that matched a smart search */}
      {smartSearch && videoResults.length > 0 && (
        <div className="glass-card p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Videos</p>
          {videoResults.map((v) => (
            <button
              key={v.id}
              onClick={() => setVideo({ url: v.url, videoId: v.video_id })}
              className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors"
            >
              <span className="text-sm">🎬</span>
              <span className="text-sm text-foreground truncate flex-1">{v.title}</span>
              <span className="text-[11px] text-muted-foreground truncate max-w-[30%]">{v.channel}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary shrink-0">{Math.round(v.similarity * 100)}%</span>
            </button>
          ))}
        </div>
      )}
      <VideoSummaryPanel target={video} onClose={() => setVideo(null)} />

      {/* Blocks grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">📭</span>
          <p>{blocks.length === 0 ? "No blocks yet. Add some from the Inbox!" : "No blocks match your filters."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {visible.map((block) => (
            <ArchiveBlockCard
              key={block.id}
              block={block}
              pillars={pillarById}
              selected={selectedIds.has(block.id)}
              onToggleSelect={toggleSelect}
              onOpen={openBlock}
              onEdit={editOne}
              onUpdate={updateBlock}
              similarityScore={showScores ? similarityScores[block.id] : undefined}
              onPlant={onPlant}
              updateAvailable={!!block.from_seed_id && !!availableUpdates[block.from_seed_id]}
              onResync={resyncSeed}
            />
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={onFileSelected}
      />

      <div
        className={`flex justify-center gap-3 transition-all duration-500 ${
          showExport && blocks.length > 0
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <button
          onClick={handleExport}
          className="glass-card px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Download size={16} />
          💾 Export
        </button>
        <button
          onClick={handleImport}
          className="glass-card px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <Upload size={16} />
          📂 Import
        </button>
        <button
          onClick={() => setObsidianOpen(true)}
          className="glass-card px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <FileText size={16} />
          🪨 Obsidian
        </button>
      </div>

      <ObsidianImportModal
        open={obsidianOpen}
        onClose={() => setObsidianOpen(false)}
        existingBlocks={blocks}
        addBlocks={addBlocks}
      />

      <ArchiveEditModal
        block={editBlock}
        open={editBlock !== null}
        onClose={() => setEditBlock(null)}
        onSave={updateBlock}
        onDelete={deleteBlock}
        semanticSearch={semanticSearch}
        onEditBlock={(b) => setEditBlock(b)}
      />

      <Dialog open={importConfirm !== null} onOpenChange={(open) => { if (!open) setImportConfirm(null); }}>
        <DialogContent className="glass-card border-white/10">
          <DialogHeader>
            <DialogTitle>Import Archive</DialogTitle>
            <DialogDescription>
              Found <span className="font-bold text-foreground">{importConfirm?.total ?? 0}</span> blocks in the file.
              {(importConfirm?.dupes ?? 0) > 0 && (
                <span className="block mt-1 text-yellow-400">
                  ⚠️ {importConfirm?.dupes} potential duplicate{importConfirm?.dupes === 1 ? "" : "s"} detected (same title &amp; content).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {(importConfirm?.dupes ?? 0) > 0 && (
            <label className="flex items-center gap-2 cursor-pointer px-1">
              <input
                type="checkbox"
                checked={filterDupes}
                onChange={(e) => setFilterDupes(e.target.checked)}
                className="rounded border-white/20 bg-background/50 accent-primary"
              />
              <span className="text-sm text-muted-foreground">Skip duplicates</span>
            </label>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setImportConfirm(null)}>Cancel</Button>
            <Button onClick={confirmImport} className="gradient-purple text-primary-foreground">
              Import {filterDupes && importConfirm ? importConfirm.total - importConfirm.dupes : importConfirm?.total ?? 0} blocks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArchiveLibrary;
