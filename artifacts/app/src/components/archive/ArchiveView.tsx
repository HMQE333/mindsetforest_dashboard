import { useState, useMemo, useCallback, useEffect, useRef, useTransition, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchiveState } from "@/hooks/useArchiveState";
import { useBookmarks } from "@/hooks/useBookmarks";
import ArchiveInbox from "./ArchiveInbox";
import ArchiveLibrary from "./ArchiveLibrary";
import { ArchiveAIProvider, useArchiveAI } from "./ArchiveAIProvider";
import type { RecordingFocus } from "./RecordingsView";
import { useKosRecordings, useKosVault } from "@/hooks/useKnowledgeOS";
import { useAssistant } from "@/hooks/useAssistant";
import { useAuth } from "@/hooks/useAuth";
import { useStudyPrompts } from "@/hooks/useStudyPrompts";
import { groupSessions, type LectureSummary } from "@/lib/kos-vault";
import { loadLectureRecordings } from "@/lib/lecture-tutor";
import type { StudySource } from "./lectures/study-actions";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";
import type { NoteAIAction } from "@/lib/archive-ai";
import { lazyModule, whenIdle, canPrefetch } from "@/lib/lazy-module";
import ChunkErrorBoundary, { ChunkRetry, reloadIfOnline } from "@/components/ChunkErrorBoundary";
import { countImages, countLinks } from "./archive-index";
import { usePendingDeletes } from "./pending-deletes";
import { setRemembered, useRemembered } from "./remembered";

// Only the open sub-tab is mounted (Wykłady always worked that way): the others
// used to stay mounted behind CSS, re-rendering with every change to the notes,
// listening for keys (the Digest ate Spaces typed into the Library search) and
// opening Forest connections nobody looked at. Inbox and Library ship with the
// Archive; the rest load the first time they open, or on idle just before.
const LecturesView = lazyModule(() => import("./lectures/LecturesView"));
const RecordingsView = lazyModule(() => import("./RecordingsView"));
const ArchiveLinksView = lazyModule(() => import("./ArchiveLinksView"));
const ArchiveImagesView = lazyModule(() => import("./ArchiveImagesView"));
const ArchiveDigestView = lazyModule(() => import("./ArchiveDigestView"));
const ArchiveForestView = lazyModule(() => import("./ArchiveForestView"));
const ArchiveBookmarksView = lazyModule(() => import("./ArchiveBookmarksView"));
const FileShareView = lazyModule(() => import("./FileShareView"));
const PlantSeedModal = lazyModule(() => import("./PlantSeedModal"));
// The selection bar (with its folder picker and the suggestion list) shows only once a note is
// selected: fetched on idle while the Library is open, so the first selection still feels instant.
const ArchiveSelectionBar = lazyModule(() => import("./ArchiveSelectionBar"));

type SubView = "inbox" | "library" | "lectures" | "recordings" | "links" | "images" | "digest" | "forest" | "bookmarks" | "fileshare";

const NAMES: Record<SubView, string> = {
  inbox: "Inbox", library: "Library", lectures: "Wykłady", recordings: "Recordings", links: "Links",
  images: "Images", digest: "Digest", forest: "Forest", bookmarks: "Bookmarks", fileshare: "File Share",
};

const PRELOAD: Partial<Record<SubView, () => Promise<void>>> = {
  lectures: LecturesView.preload,
  recordings: RecordingsView.preload,
  links: ArchiveLinksView.preload,
  images: ArchiveImagesView.preload,
  digest: ArchiveDigestView.preload,
  forest: ArchiveForestView.preload,
  bookmarks: ArchiveBookmarksView.preload,
  fileshare: FileShareView.preload,
};
/** Fetched on idle once the Archive is up, most used first. */
const IDLE_ORDER: SubView[] = ["links", "lectures", "recordings", "images", "bookmarks", "fileshare", "digest", "forest"];

/** While a sub-tab's code downloads: the same quiet line the views show while their data loads, after a beat. */
function TabFallback() {
  return (
    <p className="text-center py-12 text-muted-foreground text-sm animate-in fade-in duration-300 delay-150 fill-mode-both" aria-busy="true">
      Loading…
    </p>
  );
}

/** Every AI action in the Archive ends in one preview; the runner lives around the whole view. */
const ArchiveView = () => (
  <ArchiveAIProvider>
    <ArchiveViewBody />
  </ArchiveAIProvider>
);

const ArchiveViewBody = () => {
  // `selected` lights the tab at once; `subView` (what renders) follows as a
  // transition, so a heavy tab never holds up the press feedback, and a tab
  // whose code is still downloading keeps the old one on screen until it is in.
  const [selected, setSelected] = useRemembered<SubView>("archive.subView", "inbox");
  const [subView, setShown] = useState<SubView>(selected);
  const [switching, startTransition] = useTransition();
  const setSubView = useCallback((v: SubView) => {
    setSelected(v);
    startTransition(() => setShown(v));
  }, [setSelected]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [plantOpen, setPlantOpen] = useState(false);
  const [singlePlantBlock, setSinglePlantBlock] = useState<ArchiveBlock | null>(null);
  const archive = useArchiveState();
  // Notes deleted with their Undo still showing (pending-deletes.ts) are out of the lists and counts;
  // the Library leaves them out itself. Same identity as archive.blocks while nothing waits.
  const pending = usePendingDeletes();
  const liveBlocks = useMemo(
    () => (pending.size ? archive.blocks.filter((b) => !pending.has(b.id)) : archive.blocks),
    [archive.blocks, pending],
  );
  // The peek's AI actions run through the Archive's preview (one runner for the peek, the reader and the bar).
  // One identity for the view's life, so the Library does not re-render when a run opens or closes.
  const ai = useArchiveAI();
  const aiRef = useRef(ai);
  aiRef.current = ai;
  const runNoteAI = useCallback((b: ArchiveBlock, action: NoteAIAction) => aiRef.current?.run([b], action), []);
  // One store for both views, so a link bookmarked in Links is in Bookmarks at once;
  // it loads the first time either opens.
  const bookmarksWanted = subView === "links" || subView === "bookmarks";
  const [bookmarksStuck, setBookmarksStuck] = useState(false);
  useEffect(() => {
    if (bookmarksWanted) setBookmarksStuck(true);
  }, [bookmarksWanted]);
  const bookmarks = useBookmarks({ enabled: bookmarksStuck || bookmarksWanted });

  // The other sub-tabs' code, fetched while nothing else is going on, and only while the Archive is open.
  useEffect(() => {
    if (!canPrefetch()) return;
    let cancelled = false;
    let cancel = () => {};
    let i = 0;
    const next = () => {
      const view = IDLE_ORDER[i++];
      if (!view || cancelled) return;
      cancel = whenIdle(() => { if (!cancelled) void PRELOAD[view]?.().then(next); }, 4000);
    };
    cancel = whenIdle(next, 4000);
    return () => { cancelled = true; cancel(); };
  }, []);

  // Knowledge OS (the vault's lecture summaries and notes, and the recordings) loads the first time either tab opens.
  // Read during render, so the tab's first frame already shows it loading rather than empty.
  const kosWanted = subView === "lectures" || subView === "recordings";
  const [kosStuck, setKosStuck] = useState(false);
  useEffect(() => {
    if (kosWanted) setKosStuck(true);
  }, [kosWanted]);
  const kosOn = kosStuck || kosWanted;
  const kosVault = useKosVault(kosOn);
  const kosRecordings = useKosRecordings(kosOn);
  const sessions = useMemo(() => groupSessions(kosRecordings.rows, kosVault.index), [kosRecordings.rows, kosVault.index]);
  const vaultName = useMemo(() => {
    const i = kosVault.index;
    return i ? i.notes[0]?.vault ?? i.lectures[0]?.vault ?? [...i.sessions.values()][0]?.vault ?? null : null;
  }, [kosVault.index]);
  const [recordingFocus, setRecordingFocus] = useState<RecordingFocus | null>(null);
  const [lecturePath, setLecturePath] = useState<string | null>(null);
  const { refetch: refetchVault } = kosVault;
  const { refetch: refetchRecordings } = kosRecordings;
  const refreshKos = useCallback(() => {
    void refetchVault();
    void refetchRecordings();
  }, [refetchVault, refetchRecordings]);
  const openRecording = useCallback((note: string, seconds: number | null, paragraph?: number) => {
    setRecordingFocus({ note, seconds, paragraph: paragraph ?? null, n: Date.now() });
    setSubView("recordings");
  }, [setSubView]);
  const openSummary = useCallback((path: string) => {
    setLecturePath(path);
    setSubView("lectures");
  }, [setSubView]);

  // Studying runs in ChatGPT / Claude Desktop on the user's subscriptions: the reader copies a
  // study pack built from the settings' learning mode and the lecture's transcript.
  const { user } = useAuth();
  const studyPrompts = useStudyPrompts(kosOn);
  const userId = user?.id ?? null;
  const loadRecordings = useCallback(
    (l: LectureSummary) => (userId ? loadLectureRecordings(userId, l) : Promise.resolve([])),
    [userId],
  );
  const study: StudySource = useMemo(
    () => ({
      learningMode: studyPrompts.prompts.learning_mode,
      projectUrl: studyPrompts.prompts.chatgpt_project_url,
      recordings: loadRecordings,
    }),
    [studyPrompts.prompts, loadRecordings],
  );
  // On Wykłady the assistant starts in its "knowledge" scope (short questions; the Archive tab has none of its own).
  const { setCurrentScope } = useAssistant();
  useEffect(() => {
    if (subView !== "lectures") return;
    setCurrentScope("knowledge");
    return () => setCurrentScope(null);
  }, [subView, setCurrentScope]);

  const linkCount = useMemo(() => countLinks(liveBlocks), [liveBlocks]);
  const imageCount = useMemo(() => countImages(liveBlocks), [liveBlocks]);
  const existingTags = useMemo(() => {
    const s = new Set<string>();
    for (const b of archive.blocks) (b.tags || []).forEach((t) => s.add(t));
    return Array.from(s).sort();
  }, [archive.blocks]);

  // Digest count is now shown dynamically from the component itself

  const NAV_ITEMS: { id: SubView; label: string; icon: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", icon: "📥" },
    { id: "library", label: "Library", icon: "📚", count: liveBlocks.length },
    { id: "lectures", label: "Wykłady", icon: "🎓", count: kosVault.index?.lectures.length || undefined },
    { id: "recordings", label: "Recordings", icon: "🎙️", count: kosRecordings.rows.length || undefined },
    { id: "links", label: "Links", icon: "🔗", count: linkCount },
    { id: "images", label: "Images", icon: "🖼️", count: imageCount },
    { id: "digest", label: "Digest", icon: "🔁" },
    { id: "forest", label: "Forest", icon: "🌳" },
    { id: "bookmarks", label: "Bookmarks", icon: "⭐" },
    { id: "fileshare", label: "File Share", icon: "📁" },
  ];

  // One identity for the whole life of the view: the Library's memoised cards take it.
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds((prev) => (prev.size === 0 ? prev : new Set())), []);

  const selectedBlocks = useMemo(() => liveBlocks.filter((b) => selectedIds.has(b.id)), [liveBlocks, selectedIds]);
  const plantOne = useCallback((b: ArchiveBlock) => setSinglePlantBlock(b), []);
  const openPlant = useCallback(() => setPlantOpen(true), []);

  // The selection bar's code, on idle once the Library is open.
  useEffect(() => {
    if (subView !== "library" || !canPrefetch()) return;
    return whenIdle(() => void ArchiveSelectionBar.preload(), 3000);
  }, [subView]);

  // A tab whose code could not be fetched shows its error here, but the Archive opens on the Inbox
  // next time instead of on that tab again (browsers do not fetch a failed module twice).
  const forgetFailedTab = useCallback(() => setRemembered<SubView>("archive.subView", "inbox"), []);
  const plantLoadFailed = useCallback(() => {
    setPlantOpen(false);
    setSinglePlantBlock(null);
    toast.error("Couldn't open planting. Check your connection, then reload.", {
      action: { label: "Reload", onClick: () => void reloadIfOnline() },
    });
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Sub-nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => { setSubView(item.id); clearSelection(); }}
            onPointerEnter={() => void PRELOAD[item.id]?.()}
            aria-pressed={selected === item.id}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[0.97] ${
              selected === item.id
                ? "gradient-purple text-primary-foreground glow-sm"
                : "text-muted-foreground hover:text-foreground glass-card"
            }`}
          >
            {item.icon} {item.label}
            {item.count !== undefined && (
              <span className="ml-1 opacity-70">({item.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Dimmed only if the next tab takes a moment (its code is still downloading), as the app's tabs do. */}
      <div
        className={`relative transition-opacity ${switching ? "opacity-60 duration-200 delay-150" : "duration-0"}`}
        aria-busy={switching || undefined}
      >
        {subView === "inbox" && (
          <ArchiveInbox addBlock={archive.addBlock} addBlocks={archive.addBlocks} existingTags={existingTags} recent={archive.blocks} />
        )}
        {subView === "library" && (
          <ArchiveLibrary
            blocks={archive.blocks}
            loading={archive.loading}
            updateBlock={archive.updateBlock}
            deleteBlock={archive.deleteBlock}
            addBlocks={archive.addBlocks}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            setSelection={setSelectedIds}
            onAIAction={runNoteAI}
            semanticSearch={archive.semanticSearch}
            searchArchive={archive.searchArchive}
            embedAll={archive.embedAll}
            onPlant={plantOne}
          />
        )}
        {/* Offline, a tab whose code is not in yet says so; Inbox, Library and the other tabs keep working. */}
        <ChunkErrorBoundary resetKey={subView} fallback={<ChunkRetry what={NAMES[subView]} />} pending={<TabFallback />} onChunkError={forgetFailedTab}>
        <Suspense fallback={<TabFallback />}>
          {subView === "lectures" && (
            <LecturesView
              index={kosVault.index}
              loading={kosVault.loading}
              failed={!!kosVault.error}
              recordings={kosRecordings.rows}
              openPath={lecturePath}
              onOpen={setLecturePath}
              onOpenRecording={openRecording}
              study={study}
              onRefresh={refreshKos}
            />
          )}
          {subView === "recordings" && (
            <RecordingsView
              sessions={sessions}
              loading={kosRecordings.loading}
              failed={!!kosRecordings.error}
              vault={vaultName}
              focus={recordingFocus}
              onShowSummary={openSummary}
              onRefresh={refreshKos}
            />
          )}
          {subView === "links" && (
            <ArchiveLinksView blocks={liveBlocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} addBlock={archive.addBlock} bookmarks={bookmarks} />
          )}
          {subView === "images" && (
            <ArchiveImagesView blocks={liveBlocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
          )}
          {subView === "digest" && <ArchiveDigestView blocks={liveBlocks} />}
          {subView === "forest" && <ArchiveForestView />}
          {subView === "bookmarks" && (
            <ArchiveBookmarksView bookmarks={bookmarks} blocks={liveBlocks} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
          )}
          {subView === "fileshare" && <FileShareView blocks={archive.blocks} />}
        </Suspense>
        </ChunkErrorBoundary>
      </div>

      {/* One bar for one selected note or many. */}
      <ChunkErrorBoundary fallback={null} resetKey={selectedIds.size > 0}>
        <Suspense fallback={null}>
          <AnimatePresence>
            {/* Counted from the notes still listed: one deleted meanwhile (its Undo open) is not "selected". */}
            {selectedBlocks.length >= 1 && (
              <ArchiveSelectionBar
                key="selection-bar"
                selected={selectedBlocks}
                blocks={archive.blocks}
                updateBlock={archive.updateBlock}
                deleteBlock={archive.deleteBlock}
                onClear={clearSelection}
                onPlant={openPlant}
              />
            )}
          </AnimatePresence>
        </Suspense>
      </ChunkErrorBoundary>

      {/* Mounted only while open: planting needs the Forest and the friends list, which the Archive does not load otherwise. */}
      <ChunkErrorBoundary fallback={null} resetKey={plantOpen || singlePlantBlock !== null} onChunkError={plantLoadFailed}>
      <Suspense fallback={null}>
        {plantOpen && (
          <PlantSeedModal
            open
            blocks={selectedBlocks}
            onClose={() => setPlantOpen(false)}
            onPlanted={() => clearSelection()}
          />
        )}
        {singlePlantBlock !== null && (
          <PlantSeedModal
            open
            blocks={[singlePlantBlock]}
            onClose={() => setSinglePlantBlock(null)}
          />
        )}
      </Suspense>
      </ChunkErrorBoundary>
    </motion.div>
  );
};

export default ArchiveView;