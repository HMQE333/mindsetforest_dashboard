import { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue, memo, Suspense, type DragEvent } from "react";
import { Input } from "@/components/ui/input";
import { Link2Off, Download, Upload, FileText, FolderTree as FoldersIcon, Tags, CheckSquare, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ARCHIVE_BLOCKS_CHANGED_EVENT, ArchiveSaveError } from "@/lib/archive-data";
import { usePillars, type Pillar } from "@/hooks/usePillars";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useIsMobile } from "@/hooks/use-mobile";
import PillarIcon from "@/components/shared/PillarIcon";
import ChunkErrorBoundary, { reloadIfOnline } from "@/components/ChunkErrorBoundary";
import ArchiveBlockCard, { type CardPress } from "./ArchiveBlockCard";
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
import type { NoteAIAction } from "@/lib/archive-ai";
import { TYPE_INFO, TYPE_TAGS, tagTree, type TypeTag } from "@/lib/archive-tags";
import { todayKey } from "@/lib/today";
import { UNTAGGED, cardView, filterLibrary, filterRanked, isUntagged, tagStats, type SortMode, type TagStats, type TypeFilter } from "./archive-index";
import { useRemembered } from "./remembered";
import NoteReader, { preloadNoteReader, readerRequest, type ReaderRequest } from "./NoteReader";
import { canPrefetch, lazyModule, whenIdle } from "@/lib/lazy-module";
import { dialogOpen, isShortcutKey, isTypingTarget } from "./keyboard";
import { deleteWithUndo, usePendingDeletes } from "./pending-deletes";
import { ARM_MS, type Armed } from "./DeleteConfirm";
import { neighbourAfterRemoval } from "./reader-model";
import { NOTE_DRAG_TYPE, addToFolder, folderLabel, moveToFolder, removeFromFolder } from "./folder-ops";
import { applyWithUndo, useSavedFolders } from "./folder-store";
import { TYPE_CHIP, TYPE_ICONS, keyedPillars, tagText } from "./TagChips";
import { usePillarToggle } from "./pillar-toggle";

// The peek and the tag queue render notes with the reader's Markdown renderer: code-split, fetched on idle.
const ArchivePeek = lazyModule(() => import("./ArchivePeek"));
const ArchiveTagQueue = lazyModule(() => import("./ArchiveTagQueue"));
// The folder tree only with Folders on (off unless he turns it on).
const FolderTree = lazyModule(() => import("./FolderTree"));
const preloadPeek = () => {
  void ArchivePeek.preload();
  preloadNoteReader();
};

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, u: Partial<ArchiveBlock>) => Promise<unknown>;
  deleteBlock: (id: string) => Promise<unknown>;
  addBlocks: (blocks: Partial<ArchiveBlock>[]) => Promise<unknown>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  /** Replace the selection at once (a Shift range, Ctrl+A, Esc); without it the Library toggles one id at a time. */
  setSelection?: (ids: Set<string>) => void;
  semanticSearch: (query: string) => Promise<ArchiveBlock[]>;
  /** Search that also returns matching video summaries; used for Smart search when given. */
  searchArchive?: (query: string) => Promise<{ blocks: ArchiveBlock[]; videos: VideoMatch[] }>;
  embedAll: () => Promise<any>;
  onPlant?: (block: ArchiveBlock) => void;
  /**
   * One note's AI action from the peek (the Archive's flow through the
   * preview). Without it the peek runs Shorten, Expand and Clean itself.
   */
  onAIAction?: (block: ArchiveBlock, action: NoteAIAction) => void;
  /**
   * Opening a note in the full reader. Gets the note and the whole list in
   * the order shown, the current search, filters and sort applied, so a
   * reader can step to the previous and next note. Without it the Library's
   * own reader opens.
   */
  onOpen?: (block: ArchiveBlock, list: ArchiveBlock[]) => void;
}

/** Cards rendered at first, and added each time the end of the list comes near. */
const CARDS_PAGE = 40;
/** Tags the filter row shows before "+N more". */
const TAG_ROW = 12;

/** One Smart search's answer, kept for a switch to another sub-tab and back. */
interface SemanticHits {
  query: string;
  blocks: ArchiveBlock[];
  videos: VideoMatch[];
  scores: Record<string, number>;
}

const announceChanged = () => window.dispatchEvent(new CustomEvent(ARCHIVE_BLOCKS_CHANGED_EVENT));

/**
 * A row of filter chips: on a phone one line that scrolls sideways (the four
 * rows wrapped took more than a screen above the first note), wrapped from sm.
 */
const FILTER_ROW = "flex items-center gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible";

/** The pillar filter row; its own component so typing in the search does not re-render it. */
const PillarFilter = memo(function PillarFilter({ pillars, value, onChange }: { pillars: Pillar[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className={FILTER_ROW}>
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

/** His eight types as a filter row, with how many notes each holds. */
const TypeFilterRow = memo(function TypeFilterRow({ stats, value, onChange }: { stats: TagStats; value: TypeFilter | null; onChange: (t: TypeFilter | null) => void }) {
  return (
    <div className={FILTER_ROW} role="group" aria-label="Filter by type">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
      {TYPE_TAGS.map((t) => {
        const Icon = TYPE_ICONS[t];
        const n = stats.types.get(t) ?? 0;
        const on = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(on ? null : t)}
            aria-pressed={on}
            title={`${TYPE_INFO[t].hint} (${n})`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              on ? "border border-sky-300 bg-sky-400/30 text-sky-100 uppercase tracking-wide" : `${TYPE_CHIP} ${n === 0 ? "opacity-45" : "hover:bg-sky-400/20"}`
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden /> {TYPE_INFO[t].label}
            <span className="tabular-nums opacity-70">{n}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onChange(value === "none" ? null : "none")}
        aria-pressed={value === "none"}
        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${value === "none" ? "bg-muted text-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}
        title="Notes without a type"
      >
        No type <span className="tabular-nums opacity-70">{stats.untyped}</span>
      </button>
    </div>
  );
});

/** His tags as a filter row (when the folder tree is off): the most used first, the rest behind "+N more". */
const TagFilterRow = memo(function TagFilterRow({ stats, value, onChange }: { stats: TagStats; value: string | null; onChange: (t: string | null) => void }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...stats.counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pl")), [stats.counts]);
  if (sorted.length === 0 && stats.untagged === 0) return null;
  const head = all ? [...sorted].sort((a, b) => a[0].localeCompare(b[0], "pl")) : sorted.slice(0, TAG_ROW);
  const activeHidden = value && value !== UNTAGGED && !head.some(([t]) => t === value);
  const chip = (on: boolean) => `max-w-[14rem] truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${on ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`;
  return (
    <div className={FILTER_ROW} role="group" aria-label="Filter by tag">
      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</span>
      <button type="button" onClick={() => onChange(value === UNTAGGED ? null : UNTAGGED)} aria-pressed={value === UNTAGGED} className={chip(value === UNTAGGED)} title="Notes in no folder">
        Untagged <span className="tabular-nums opacity-70">{stats.untagged}</span>
      </button>
      {activeHidden && (
        <button type="button" onClick={() => onChange(null)} aria-pressed className={chip(true)} title={`#${value}: press to show every note`}>
          {tagText(value!)} ✕
        </button>
      )}
      {head.map(([t, n]) => (
        <button key={t} type="button" onClick={() => onChange(value === t ? null : t)} aria-pressed={value === t} className={chip(value === t)} title={`#${t}`}>
          {tagText(t)} <span className="tabular-nums opacity-70">{n}</span>
        </button>
      ))}
      {sorted.length > TAG_ROW && (
        <button type="button" onClick={() => setAll((a) => !a)} className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          {all ? "Fewer" : `+${sorted.length - TAG_ROW} more`}
        </button>
      )}
    </div>
  );
});

/** While the peek's code arrives (only without the prefetch): the panel's frame at once. */
function PeekShell({ phone }: { phone: boolean }) {
  return phone ? (
    <div className="fixed inset-x-0 bottom-0 z-50 flex h-[70vh] items-center justify-center rounded-t-2xl border-t border-white/10 bg-background" aria-busy="true">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Opening the note" />
    </div>
  ) : (
    <div className="fixed bottom-0 right-0 top-0 z-40 flex w-[440px] max-w-[92vw] items-center justify-center border-l border-white/10 bg-background" aria-busy="true">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Opening the note" />
    </div>
  );
}

const ArchiveLibrary = ({ blocks: allBlocks, loading, updateBlock, deleteBlock, addBlocks, selectedIds, toggleSelect, setSelection: setSelectionProp, semanticSearch, searchArchive, embedAll, onPlant, onAIAction, onOpen }: Props) => {
  const pillars = usePillars();
  const pillarById = useMemo(() => new Map(pillars.map((p) => [p.id, p])), [pillars]);
  const { preferences, saveArchiveFolders, loading: settingsLoading } = useUserSettings();
  const foldersOn = !!preferences.archiveFolders;
  const phone = useIsMobile();
  // Notes deleted with their Undo still showing are out of every list here.
  const pending = usePendingDeletes();
  const blocks = useMemo(() => (pending.size ? allBlocks.filter((b) => !pending.has(b.id)) : allBlocks), [allBlocks, pending]);
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  // "Update" on notes saved from the Forest, without loading the Forest.
  const { availableUpdates, resync } = useSavedSeedUpdates(blocks, announceChanged);
  // Search, filters and sort survive a switch to another sub-tab and back.
  const [search, setSearch] = useRemembered("library.search", "");
  const [filterPillar, setFilterPillar] = useRemembered<string | null>("library.pillar", null);
  const [folder, setFolder] = useRemembered<string | null>("library.folder", null);
  const [typeFilter, setTypeFilter] = useRemembered<TypeFilter | null>("library.type", null);
  // Phones: the type and tag rows sit behind a "Filters" toggle so the first note is not pushed below the fold.
  const [moreFilters, setMoreFilters] = useRemembered<boolean>("library.moreFilters", false);
  const [hideLinks, setHideLinks] = useRemembered("library.hideLinks", false);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);
  const [reading, setReading] = useState<ReaderRequest | null>(null);
  const [sortMode, setSortMode] = useRemembered<SortMode>("library.sort", "newest");
  const [smartSearch, setSmartSearch] = useRemembered("library.smart", false);
  // The last Smart search's answer: coming back to the Library with the same query shows it at
  // once, without a second embedding call or keyword results reshuffling into the semantic order.
  const [lastHits, setLastHits] = useRemembered<SemanticHits | null>("library.semantic", null);
  const lastHitsRef = useRef(lastHits);
  lastHitsRef.current = lastHits;
  const [restored] = useState(() => (smartSearch && lastHits && lastHits.query === search.trim() ? lastHits : null));
  const [semanticResults, setSemanticResults] = useState<ArchiveBlock[] | null>(restored?.blocks ?? null);
  const [videoResults, setVideoResults] = useState<VideoMatch[]>(restored?.videos ?? []);
  const [video, setVideo] = useState<VideoPanelTarget | null>(null);
  const [similarityScores, setSimilarityScores] = useState<Record<string, number>>(restored?.scores ?? {});
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [includeTags, setIncludeTags] = useRemembered("library.tags", false);
  const [selectMode, setSelectMode] = useState(false);
  // Phones: a selection that empties (the bar's Clear, a confirmed bulk Delete, the last note tapped
  // off) ends Select mode too, so the next tap opens the peek again.
  const hadSelection = useRef(false);
  useEffect(() => {
    if (hadSelection.current && selectedIds.size === 0) setSelectMode(false);
    hadSelection.current = selectedIds.size > 0;
  }, [selectedIds]);
  const [foldersPanel, setFoldersPanel] = useRemembered("library.foldersPanel", false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [armed, setArmed] = useState<(Armed & { id: string; where: "card" | "peek" }) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<string[] | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
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
    const kept = lastHitsRef.current;
    if (kept && kept.query === query.trim()) {
      setSemanticResults(kept.blocks);
      setVideoResults(kept.videos);
      setSimilarityScores(kept.scores);
      return;
    }
    const timer = setTimeout(async () => {
      setSemanticLoading(true);
      let results: ArchiveBlock[];
      let videos: VideoMatch[] = [];
      if (searchArchive) {
        const found = await searchArchive(query.trim());
        results = found.blocks;
        videos = found.videos;
        setVideoResults(videos);
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
      setLastHits({ query: query.trim(), blocks: results, videos, scores });
    }, 500);
    return () => clearTimeout(timer);
  }, [query, smartSearch, semanticSearch, searchArchive, setLastHits]);

  // Counts for the type and tag rows, the folder tree and "Tag untagged": one pass per change of the notes.
  const stats = useMemo(() => tagStats(blocks), [blocks]);
  const { folders: savedFolders } = useSavedFolders();
  const tree = useMemo(
    () => (foldersOn ? tagTree([...stats.counts, ...savedFolders.map((f) => [f, 0] as const)], { noteCounts: stats.folderCounts }) : []),
    [foldersOn, stats, savedFolders],
  );

  // Which notes match, in order: the regex and lower-casing work behind it is
  // done once per note (archive-index), not per note per key.
  const filtered = useMemo(() => {
    if (smartSearch && semanticResults !== null) return filterRanked(semanticResults, blocks, { pillar: filterPillar, hideLinks, folder, type: typeFilter }, pending);
    return filterLibrary(blocks, { search: query, includeTags, pillar: filterPillar, hideLinks, sort: sortMode, folder, type: typeFilter });
  }, [blocks, query, includeTags, filterPillar, hideLinks, sortMode, smartSearch, semanticResults, folder, typeFilter, pending]);
  const order = useMemo(() => filtered.map((b) => b.id), [filtered]);

  // The first cards render at once and the rest as the end of the list comes
  // near, so a new search shows its top matches without building every card.
  const [limit, setLimit] = useState(CARDS_PAGE);
  useEffect(() => setLimit(CARDS_PAGE), [query, includeTags, filterPillar, hideLinks, sortMode, smartSearch, semanticResults, folder, typeFilter]);
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

  // -- refs the keys and the cards' callbacks read, so those keep one identity ---------------
  const live = useRef({ filtered, order, byId, selectedIds, peekId, focusId, armed, folder, limit, phone, selectMode, pillars });
  live.current = { filtered, order, byId, selectedIds, peekId, focusId, armed, folder, limit, phone, selectMode, pillars };
  const anchorRef = useRef<string | null>(null);

  // -- selection -----------------------------------------------------------------------------
  const setSelection = useCallback(
    (ids: Set<string>) => {
      if (setSelectionProp) return setSelectionProp(ids);
      const cur = live.current.selectedIds;
      for (const id of cur) if (!ids.has(id)) toggleSelect(id);
      for (const id of ids) if (!cur.has(id)) toggleSelect(id);
    },
    [setSelectionProp, toggleSelect],
  );
  const toggleOne = useCallback(
    (id: string) => {
      anchorRef.current = id;
      toggleSelect(id);
    },
    [toggleSelect],
  );
  const selectRange = useCallback(
    (toId: string) => {
      const { order: ids, selectedIds: sel, peekId: peeked, focusId: focused } = live.current;
      const from = anchorRef.current ?? peeked ?? focused ?? toId;
      let a = ids.indexOf(from);
      const b = ids.indexOf(toId);
      if (b < 0) return;
      if (a < 0) a = b;
      const next = new Set(sel);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(ids[i]);
      setSelection(next);
    },
    [setSelection],
  );

  // -- focus (one tab stop for the list; the arrows move it) --------------------------------
  const focusTarget = useRef<string | null>(null);
  const focusCard = useCallback((id: string) => {
    const at = live.current.order.indexOf(id);
    setFocusId(id);
    if (at >= live.current.limit) {
      // Not rendered yet: render up to it, then focus it (the effect below).
      focusTarget.current = id;
      setLimit(Math.ceil((at + 1) / CARDS_PAGE) * CARDS_PAGE);
      return;
    }
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);
  useEffect(() => {
    const id = focusTarget.current;
    if (!id) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"]`);
    if (el) {
      focusTarget.current = null;
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  }, [visible]);
  // The tab stop: the card last focused, or the first one.
  const tabStop = focusId && order.includes(focusId) ? focusId : order[0] ?? null;

  // -- the peek ------------------------------------------------------------------------------
  const openPeek = useCallback((id: string) => {
    setArmed(null);
    setPeekId(id);
  }, []);
  const closePeek = useCallback(() => {
    setPeekId(null);
    setArmed((a) => (a?.where === "peek" ? null : a));
  }, []);
  const stepPeek = useCallback(
    (step: 1 | -1) => {
      const { order: ids, peekId: id } = live.current;
      if (!id) return;
      const at = ids.indexOf(id);
      const next = at < 0 ? null : ids[at + step];
      if (!next) return;
      setArmed(null);
      setPeekId(next);
      focusCard(next);
    },
    [focusCard],
  );
  // A peeked note that is gone (deleted elsewhere, or by a poll) closes the peek.
  const peekBlock = peekId ? byId.get(peekId) : undefined;
  useEffect(() => {
    if (peekId && !peekBlock && !loading) setPeekId(null);
  }, [peekId, peekBlock, loading]);

  // -- the full reader -----------------------------------------------------------------------
  const fromPeek = useRef(false);
  const openFull = useCallback(
    (block: ArchiveBlock) => {
      setArmed(null);
      if (onOpen) return onOpen(block, live.current.filtered);
      fromPeek.current = live.current.peekId !== null;
      setReading(readerRequest(block, live.current.filtered));
    },
    [onOpen],
  );
  const closeReader = useCallback((lastId?: string) => {
    setReading(null);
    // Back from the reader opened over the peek: the peek shows the note the reader ended on.
    if (fromPeek.current && lastId) setPeekId(lastId);
    fromPeek.current = false;
    if (lastId) setFocusId(lastId);
  }, []);
  const editOne = useCallback((block: ArchiveBlock) => setEditBlock(block), []);

  // -- delete: "Delete?" first, then the Undo toast -----------------------------------------
  const armTimer = useRef<number>();
  const disarm = useCallback(() => {
    window.clearTimeout(armTimer.current);
    setArmed(null);
  }, []);
  const arm = useCallback((id: string, where: "card" | "peek", keys = false) => {
    window.clearTimeout(armTimer.current);
    setArmed({ id, where, keys });
    armTimer.current = window.setTimeout(() => setArmed(null), ARM_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  const armCard = useCallback((id: string) => arm(id, "card"), [arm]);
  const confirmDelete = useCallback(
    (block: ArchiveBlock) => {
      disarm();
      const { order: ids, peekId: peeked, focusId: focused, selectedIds: sel } = live.current;
      const next = neighbourAfterRemoval(ids, block.id, (id) => id !== block.id);
      if (peeked === block.id) setPeekId(next);
      if (focused === block.id && next) focusCard(next);
      if (sel.has(block.id)) toggleSelect(block.id);
      deleteWithUndo([block.id], deleteBlock, { label: cardView(block).title });
    },
    [deleteBlock, disarm, focusCard, toggleSelect],
  );

  // -- pillars, pin, filters -----------------------------------------------------------------
  const pillarToggle = usePillarToggle(updateBlock);
  const togglePillar = pillarToggle.toggle;
  const togglePin = useCallback((b: ArchiveBlock) => void updateBlock(b.id, { is_pinned: !b.is_pinned }), [updateBlock]);
  const filterTag = useCallback(
    (tag: string) => {
      setFolder((cur) => (cur === tag ? null : tag));
      if (live.current.phone) setPeekId(null);
    },
    [setFolder],
  );
  const filterType = useCallback(
    (t: TypeTag) => {
      setTypeFilter((cur) => (cur === t ? null : t));
      if (live.current.phone) setPeekId(null);
    },
    [setTypeFilter],
  );
  const filterTagFromReader = useCallback((tag: string) => {
    setReading(null);
    fromPeek.current = false;
    setFolder(tag);
  }, [setFolder]);
  const filterTypeFromReader = useCallback((t: TypeTag) => {
    setReading(null);
    fromPeek.current = false;
    setTypeFilter(t);
  }, [setTypeFilter]);

  // -- a press on a card ---------------------------------------------------------------------
  const pressCard = useCallback(
    (block: ArchiveBlock, how: CardPress) => {
      setFocusId(block.id);
      if (live.current.selectMode || how.toggle) return toggleOne(block.id);
      if (how.shift) return selectRange(block.id);
      anchorRef.current = block.id;
      openPeek(block.id);
    },
    [toggleOne, selectRange, openPeek],
  );

  // -- drag a card onto a folder -------------------------------------------------------------
  const dragNote = useCallback((block: ArchiveBlock, e: DragEvent) => {
    const sel = live.current.selectedIds;
    const ids = sel.has(block.id) && sel.size > 1 ? live.current.order.filter((id) => sel.has(id)) : [block.id];
    e.dataTransfer.setData(NOTE_DRAG_TYPE, JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "copyMove";
    if (ids.length > 1) {
      const ghost = document.createElement("div");
      ghost.textContent = `${ids.length} notes`;
      ghost.style.cssText = "position:fixed;top:-100px;left:0;padding:6px 10px;border-radius:10px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));font:600 12px system-ui";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 12, 12);
      window.setTimeout(() => ghost.remove(), 0);
    }
    setDragging(true);
  }, []);
  const dragEnd = useCallback(() => setDragging(false), []);
  const dropNotes = useCallback(
    (ids: string[], target: string, move: boolean) => {
      setDragging(false);
      const notes = ids.map((id) => live.current.byId.get(id)).filter((b): b is ArchiveBlock => !!b);
      if (!notes.length) return;
      const viewed = live.current.folder && live.current.folder !== UNTAGGED ? live.current.folder : null;
      const what = (n: number) => (n === 1 ? "1 note" : `${n} notes`);
      if (target === UNTAGGED) {
        if (!viewed) {
          toast("Open a folder first: dropping a note on Untagged takes it out of the folder you are viewing.");
          return;
        }
        const list = removeFromFolder(notes, viewed);
        if (!list.length) return;
        void applyWithUndo(list, updateBlock, (n) => `Took ${what(n)} out of ${folderLabel(viewed)}`);
        return;
      }
      const moving = move && !!viewed && viewed !== target;
      const list = moving ? moveToFolder(notes, target, viewed) : addToFolder(notes, target);
      if (!list.length) {
        toast(`Already in ${folderLabel(target)}`);
        return;
      }
      void applyWithUndo(list, updateBlock, (n) => (moving ? `Moved ${what(n)} to ${folderLabel(target)}` : `Added ${what(n)} to ${folderLabel(target)}`));
    },
    [updateBlock],
  );
  const canDrag = foldersOn && !phone && typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
  // "Hold Shift to move it" with Shift pressed first: Chrome starts no drag from a Shift press on
  // text (it extends a selection instead), so while Shift is down a card's text does not take the
  // press and the card itself does (index.css, body[data-archive-shift]).
  useEffect(() => {
    if (!canDrag) return;
    const set = (on: boolean) => {
      if (on) document.body.dataset.archiveShift = "";
      else delete document.body.dataset.archiveShift;
    };
    const onKey = (e: KeyboardEvent) => e.key === "Shift" && set(e.type === "keydown");
    const off = () => set(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", off);
      off();
    };
  }, [canDrag]);

  // -- the keys ------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = live.current;
      // Ctrl/Cmd+A: every note of the list, unless a field (or a dialog) has the keys.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "a") {
        if (e.defaultPrevented || isTypingTarget(e.target) || dialogOpen() || s.order.length === 0) return;
        e.preventDefault();
        setSelection(new Set(s.order));
        return;
      }
      if (!isShortcutKey(e) || dialogOpen()) return;
      const target = e.target as HTMLElement | null;
      const onCard = target?.closest?.("[data-note-id]") as HTMLElement | null;
      const cardId = onCard && gridRef.current?.contains(onCard) && onCard === target ? onCard.dataset.noteId ?? null : null;
      const inPeek = !!target?.closest?.("[data-archive-peek]");
      // A focused button or link keeps its own Enter and Space.
      const ownKeys = !!target?.closest?.("button, a, [role='button']") && !cardId;
      const plain = target === document.body || cardId !== null || target?.hasAttribute?.("data-archive-peek");
      const subject = s.peekId ?? cardId;

      // "Delete?" waits: Enter or Delete again deletes, Esc keeps the note.
      if (s.armed) {
        if (e.key === "Escape") {
          e.preventDefault();
          disarm();
          return;
        }
        if (e.key === "Enter" || e.key === "Delete") {
          const b = s.byId.get(s.armed.id);
          e.preventDefault();
          if (b) confirmDelete(b);
          return;
        }
      }

      if (e.key === "Escape") {
        if (s.peekId) {
          e.preventDefault();
          closePeek();
          if (s.peekId) focusCard(s.peekId);
        } else if (s.selectedIds.size > 0) {
          e.preventDefault();
          setSelection(new Set());
        }
        return;
      }

      const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown";
      if (arrow && !e.shiftKey) {
        if (s.peekId && (plain || inPeek || cardId)) {
          e.preventDefault();
          stepPeek(e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1);
          return;
        }
        if (!cardId) return;
        e.preventDefault();
        const at = s.order.indexOf(cardId);
        // Up and down move a row: as many cards as the grid has columns.
        const cols = gridRef.current ? getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").filter(Boolean).length || 1 : 1;
        const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? cols : -cols;
        const next = s.order[Math.max(0, Math.min(s.order.length - 1, at + d))];
        if (next && next !== cardId) focusCard(next);
        return;
      }

      if (!subject || (!plain && !inPeek)) return;
      const block = s.byId.get(subject);
      if (!block) return;
      const k = e.key.toLowerCase();
      if (e.key === " " && !ownKeys) {
        e.preventDefault();
        if (s.peekId) closePeek();
        else openPeek(subject);
      } else if (e.key === "Enter" && !ownKeys) {
        e.preventDefault();
        openFull(block);
      } else if (e.key === "Delete") {
        e.preventDefault();
        arm(block.id, s.peekId ? "peek" : "card", true);
      } else if (k === "e" && !e.shiftKey) {
        e.preventDefault();
        setEditBlock(block);
      } else if (k === "p" && !e.shiftKey) {
        e.preventDefault();
        togglePin(block);
      } else if (s.peekId && /^[1-9]$/.test(e.key)) {
        // Digits toggle the peeked note's pillars, as numbered on its chips (1-8: his life areas).
        const p = keyedPillars(s.pillars)[Number(e.key) - 1];
        if (p) {
          e.preventDefault();
          void togglePillar(block, p.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelection, disarm, confirmDelete, closePeek, focusCard, stepPeek, openPeek, openFull, arm, togglePin, togglePillar]);

  // The reader's, the peek's and the queue's code are fetched once the page is quiet, so the first note opens at once.
  useEffect(() => (canPrefetch() ? whenIdle(preloadPeek, 3000) : undefined), []);
  useEffect(() => {
    if (foldersOn) void FolderTree.preload();
  }, [foldersOn]);
  const resyncSeed = useCallback((seedId: string) => void resync(seedId), [resync]);
  const showScores = smartSearch && semanticResults !== null;

  const openQueue = useCallback(() => {
    const ids = blocks
      .filter(isUntagged)
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))
      .map((b) => b.id);
    setPeekId(null);
    setQueue(ids);
  }, [blocks]);

  const handleExport = useCallback(() => {
    const exportData = allBlocks.map(({ embedding, ...rest }: any) => rest);
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `archive-export-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${allBlocks.length} blocks`);
  }, [allBlocks]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importConfirm, setImportConfirm] = useState<{ parsed: any[]; dupes: number; total: number } | null>(null);
  const [filterDupes, setFilterDupes] = useState(true);
  const [obsidianOpen, setObsidianOpen] = useState(false);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const findDuplicates = useCallback((incoming: any[]) => {
    return incoming.filter((item) =>
      allBlocks.some(
        (b) => b.title === item.title && b.content === item.content
      )
    ).length;
  }, [allBlocks]);

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
        (item) => !allBlocks.some((b) => b.title === item.title && b.content === item.content)
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
  }, [importConfirm, filterDupes, allBlocks, addBlocks]);

  const saveNew = useCallback(async (note: Partial<ArchiveBlock>) => {
    try {
      await addBlocks([note]);
      toast.success("Saved as a new note");
    } catch (e) {
      toast.error("Couldn't save the new note", { description: e instanceof Error ? e.message : undefined });
    }
  }, [addBlocks]);

  const peekPos = peekBlock ? order.indexOf(peekBlock.id) : -1;
  const peekFailed = useCallback(() => {
    setPeekId(null);
    toast.error("Couldn't open the note. Check your connection, then reload.", { action: { label: "Reload", onClick: () => void reloadIfOnline() } });
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-2xl animate-pulse">📚</span>
        <p className="mt-2">Loading library...</p>
      </div>
    );
  }

  const allSelected = filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id));
  const selecting = selectedIds.size > 0 || selectMode;
  const folderName = folder === UNTAGGED ? "Untagged" : folder ? `#${folder}` : null;
  const toggleBtn = (on: boolean) =>
    `text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all flex items-center gap-1 ${on ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
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
              {phone && (
                <button
                  onClick={() => setMoreFilters(!moreFilters)}
                  aria-expanded={moreFilters}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg font-semibold transition-all ${
                    moreFilters || typeFilter || (folder && !foldersOn) ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                  title="Show type and tag filters"
                >
                  Filters{(typeFilter ? 1 : 0) + (folder && !foldersOn ? 1 : 0) ? ` (${(typeFilter ? 1 : 0) + (folder && !foldersOn ? 1 : 0)})` : ""} {moreFilters ? "▴" : "▾"}
                </button>
              )}
              <button
                onClick={() => setSelection(allSelected ? new Set([...selectedIds].filter((id) => !filtered.some((b) => b.id === id))) : new Set([...selectedIds, ...order]))}
                className="text-[11px] px-2.5 py-1.5 rounded-lg font-semibold bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
                title="Ctrl+A selects every note shown, Esc clears"
              >
                {allSelected ? (phone ? "☐ None" : "☐ Deselect All") : (phone ? "☑ All" : "☑ Select All")}
              </button>
            </div>
          ) : null}
        </div>
        <PillarFilter pillars={pillars} value={filterPillar} onChange={setFilterPillar} />
        {(!phone || moreFilters) && <TypeFilterRow stats={stats} value={typeFilter} onChange={setTypeFilter} />}
        {(!phone || moreFilters) && !foldersOn && <TagFilterRow stats={stats} value={folder} onChange={setFolder} />}
        <div className={FILTER_ROW}>
          <button onClick={() => setHideLinks(!hideLinks)} className={toggleBtn(hideLinks)}>
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
          <span className="w-px h-4 bg-white/10" />
          <button
            onClick={() => void saveArchiveFolders(!foldersOn)}
            onPointerEnter={() => void FolderTree.preload()}
            disabled={settingsLoading}
            aria-pressed={foldersOn}
            className={`${toggleBtn(foldersOn)} disabled:opacity-40`}
            title={foldersOn ? "Folders ON: your tags as a folder tree. Click to turn off" : "Show your tags as folders (a/b is a sub-folder) and drag notes onto them"}
          >
            <FoldersIcon size={12} /> Folders
          </button>
          <button
            onClick={openQueue}
            onPointerEnter={() => void ArchiveTagQueue.preload()}
            disabled={stats.untagged === 0}
            className={`${toggleBtn(false)} disabled:opacity-40`}
            title="Go through the notes in no folder, newest first, with suggested tags"
          >
            <Tags size={12} /> Tag untagged ({stats.untagged})
          </button>
          <button
            onClick={() => setSelectMode((m) => !m)}
            aria-pressed={selectMode}
            className={`${toggleBtn(selectMode)} md:hidden`}
            title="Taps select notes instead of opening them"
          >
            <CheckSquare size={12} /> Select
          </button>
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

      <div className={foldersOn ? "grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]" : ""}>
        {foldersOn && (
          <div className="space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <button
              type="button"
              onClick={() => setFoldersPanel((o) => !o)}
              aria-expanded={foldersPanel}
              className="glass-card flex w-full items-center gap-2 px-3 py-2 text-left text-sm lg:hidden"
            >
              <FoldersIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{folderName ?? "All notes"}</span>
              <span className="text-xs text-muted-foreground">{foldersPanel ? "Hide folders" : "Folders"}</span>
            </button>
            <div className={foldersPanel ? "" : "hidden lg:block"}>
              <Suspense fallback={<div className="glass-card h-64 animate-pulse" aria-busy="true" />}>
              <FolderTree
                tree={tree}
                total={blocks.length}
                untagged={stats.untagged}
                value={folder}
                onChange={setFolder}
                onDropNotes={dropNotes}
                blocks={blocks}
                updateBlock={updateBlock}
                dragging={dragging}
              />
              </Suspense>
            </div>
          </div>
        )}

        <div className="min-w-0 space-y-3">
          {(folderName || typeFilter) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              <span>
                {filtered.length} note{filtered.length === 1 ? "" : "s"}
                {folderName && <> in <span className="font-semibold text-foreground [overflow-wrap:anywhere]">{folderName}</span></>}
                {typeFilter && <> · {typeFilter === "none" ? "no type" : TYPE_INFO[typeFilter].label}</>}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFolder(null);
                  setTypeFilter(null);
                }}
                className="inline-flex items-center gap-0.5 rounded-full bg-muted/40 px-2 py-0.5 hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden /> Show all
              </button>
              {canDrag && <span className="hidden text-[10px] opacity-70 xl:inline">Drag a note onto a folder to add it there; hold Shift to move it.</span>}
            </div>
          )}

          {/* Blocks grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="text-3xl mb-2 block">📭</span>
              <p>{blocks.length === 0 ? "No blocks yet. Add some from the Inbox!" : folderName ? `No notes in ${folderName} match.` : "No blocks match your filters."}</p>
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 gap-3" onPointerEnter={preloadPeek} onFocus={preloadPeek}>
              {visible.map((block) => (
                <ArchiveBlockCard
                  key={block.id}
                  block={block}
                  pillars={pillarById}
                  selected={selectedIds.has(block.id)}
                  selecting={selecting}
                  peeked={peekId === block.id}
                  focused={tabStop === block.id}
                  armed={armed?.id === block.id && armed.where === "card" ? armed : null}
                  draggable={!!canDrag}
                  activeFolder={folder}
                  onPress={pressCard}
                  onOpenFull={openFull}
                  onToggleSelect={toggleOne}
                  onArmDelete={armCard}
                  onDisarmDelete={disarm}
                  onConfirmDelete={confirmDelete}
                  onFilterTag={filterTag}
                  onFilterType={filterType}
                  onFocusCard={setFocusId}
                  onDragNote={dragNote}
                  onDragEndNote={dragEnd}
                  similarityScore={showScores ? similarityScores[block.id] : undefined}
                  updateAvailable={!!block.from_seed_id && !!availableUpdates[block.from_seed_id]}
                  onResync={resyncSeed}
                />
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-1" />
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={onFileSelected}
      />

      <div
        className={`flex justify-center gap-3 transition-all duration-500 ${
          showExport && allBlocks.length > 0
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
        existingBlocks={allBlocks}
        addBlocks={addBlocks}
      />

      {/* The peek: code-split; its frame shows at once while the code arrives (only without the prefetch). */}
      {peekBlock && (
        <ChunkErrorBoundary fallback={null} resetKey={peekBlock.id} onChunkError={peekFailed}>
          <Suspense fallback={<PeekShell phone={phone} />}>
            <ArchivePeek
              block={peekBlock}
              index={peekPos}
              total={order.length}
              phone={phone}
              pillars={pillars}
              pillarMap={pillarById}
              pillarsOn={pillarToggle.pillarsOf(peekBlock)}
              onTogglePillar={(id) => void pillarToggle.toggle(peekBlock, id)}
              blocks={blocks}
              viewedFolder={folder}
              armed={armed?.id === peekBlock.id && armed.where === "peek" ? armed : null}
              onArm={() => arm(peekBlock.id, "peek")}
              onDisarm={disarm}
              onConfirmDelete={() => confirmDelete(peekBlock)}
              onClose={closePeek}
              onStep={stepPeek}
              onOpenFull={() => openFull(peekBlock)}
              onEdit={() => setEditBlock(peekBlock)}
              onUpdate={updateBlock}
              onFilterTag={filterTag}
              onFilterType={filterType}
              onAIAction={onAIAction}
              onSaveNew={saveNew}
              onPlant={onPlant}
            />
          </Suspense>
        </ChunkErrorBoundary>
      )}

      <NoteReader
        request={reading}
        blocks={blocks}
        from={peekId ? "Preview" : "Library"}
        onClose={closeReader}
        onEdit={editOne}
        onUpdate={updateBlock}
        onDelete={deleteBlock}
        onFilterTag={filterTagFromReader}
        onFilterType={filterTypeFromReader}
        viewedFolder={folder}
      />

      {queue && (
        <ChunkErrorBoundary fallback={null} resetKey={queue.length} onChunkError={() => setQueue(null)}>
          <Suspense fallback={null}>
            <ArchiveTagQueue ids={queue} blocks={blocks} pillarMap={pillarById} onClose={() => setQueue(null)} onUpdate={updateBlock} />
          </Suspense>
        </ChunkErrorBoundary>
      )}

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
