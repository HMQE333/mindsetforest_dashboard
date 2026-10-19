import { useState, useMemo, useCallback, useEffect, useTransition, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchiveState } from "@/hooks/useArchiveState";
import { useBookmarks } from "@/hooks/useBookmarks";
import ArchiveInbox from "./ArchiveInbox";
import ArchiveLibrary from "./ArchiveLibrary";
import ArchiveAIPromptModal from "./ArchiveAIPromptModal";
import type { RecordingFocus } from "./RecordingsView";
import { useKosRecordings, useKosVault } from "@/hooks/useKnowledgeOS";
import { useAssistant } from "@/hooks/useAssistant";
import { useAuth } from "@/hooks/useAuth";
import { useStudyPrompts } from "@/hooks/useStudyPrompts";
import { groupSessions, type LectureSummary } from "@/lib/kos-vault";
import { loadLectureRecordings } from "@/lib/lecture-tutor";
import type { StudySource } from "./lectures/study-actions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";
import { lazyModule, whenIdle, canPrefetch } from "@/lib/lazy-module";
import { countImages, countLinks } from "./archive-index";
import { useRemembered } from "./remembered";

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

type SubView = "inbox" | "library" | "lectures" | "recordings" | "links" | "images" | "digest" | "forest" | "bookmarks" | "fileshare";

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

const ArchiveView = () => {
  // `selected` lights the tab at once; `subView` (what renders) follows as a
  // transition, so a heavy tab never holds up the press feedback, and a tab
  // whose code is still downloading keeps the old one on screen until it is in.
  const [selected, setSelected] = useRemembered<SubView>("archive.subView", "inbox");
  const [subView, setShown] = useState<SubView>(selected);
  const [, startTransition] = useTransition();
  const setSubView = useCallback((v: SubView) => {
    setSelected(v);
    startTransition(() => setShown(v));
  }, [setSelected]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [plantOpen, setPlantOpen] = useState(false);
  const [singlePlantBlock, setSinglePlantBlock] = useState<ArchiveBlock | null>(null);
  const archive = useArchiveState();
  // One store for both views, so a link bookmarked in Links is in Bookmarks at once;
  // it loads the first time either opens.
  const bookmarksWanted = subView === "links" || subView === "bookmarks";
  const [bookmarksStuck, setBookmarksStuck] = useState(false);
  useEffect(() => {
    if (bookmarksWanted) setBookmarksStuck(true);
  }, [bookmarksWanted]);
  const bookmarks = useBookmarks({ enabled: bookmarksStuck || bookmarksWanted });

  // The other sub-tabs' code, fetched while nothing else is going on.
  useEffect(() => {
    if (!canPrefetch()) return;
    let cancel = () => {};
    let i = 0;
    const next = () => {
      const view = IDLE_ORDER[i++];
      if (!view) return;
      cancel = whenIdle(() => void PRELOAD[view]?.().then(next), 4000);
    };
    cancel = whenIdle(next, 4000);
    return () => cancel();
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

  const linkCount = useMemo(() => countLinks(archive.blocks), [archive.blocks]);
  const imageCount = useMemo(() => countImages(archive.blocks), [archive.blocks]);
  const existingTags = useMemo(() => {
    const s = new Set<string>();
    for (const b of archive.blocks) (b.tags || []).forEach((t) => s.add(t));
    return Array.from(s).sort();
  }, [archive.blocks]);

  // Digest count is now shown dynamically from the component itself

  const NAV_ITEMS: { id: SubView; label: string; icon: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", icon: "📥" },
    { id: "library", label: "Library", icon: "📚", count: archive.blocks.length },
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

  const removeFromSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds((prev) => (prev.size === 0 ? prev : new Set())), []);

  const selectedBlocks = useMemo(() => archive.blocks.filter((b) => selectedIds.has(b.id)), [archive.blocks, selectedIds]);
  const plantOne = useCallback((b: ArchiveBlock) => setSinglePlantBlock(b), []);

  const handleAIResult = async (result: { title: string; content: string }) => {
    return await archive.addBlock({
      title: result.title,
      content: result.content,
      pillars: [],
      directions: [],
      tags: ["ai-generated"],
    });
  };

  const handleReplaceBlocks = async (blockIds: string[], result: { title: string; content: string }) => {
    const [keepId, ...deleteIds] = blockIds;
    for (const id of deleteIds) {
      await archive.deleteBlock(id);
    }
    await archive.updateBlock(keepId, {
      title: result.title,
      content: result.content,
      tags: ["ai-generated"],
    });
    clearSelection();
  };

  const handleBulkMerge = async () => {
    if (selectedBlocks.length < 2) return;
    setBulkLoading("merge");
    try {
      const notes = selectedBlocks.map((b) => ({ title: b.title, content: b.content }));
      const { data, error } = await supabase.functions.invoke("ai-archive-multi", {
        body: { notes, preset: "merge" },
      });
      if (error) throw error;
      const merged = await archive.addBlock({
        title: `Merged (${selectedBlocks.length} notes)`,
        content: data?.content || "",
        pillars: [...new Set(selectedBlocks.flatMap((b) => b.pillars))],
        tags: ["ai-merged"],
      });
      if (merged) {
        toast.success("Merged into new block ✅");
        clearSelection();
      }
    } catch (e: any) {
      toast.error(e?.message || "Merge failed");
    }
    setBulkLoading(null);
  };

  const handleBulkSummarize = async () => {
    if (selectedBlocks.length < 2) return;
    setBulkLoading("summarize");
    try {
      const notes = selectedBlocks.map((b) => ({ title: b.title, content: b.content }));
      const { data, error } = await supabase.functions.invoke("ai-archive-multi", {
        body: { notes, preset: "summarize" },
      });
      if (error) throw error;
      await archive.addBlock({
        title: `Summary (${selectedBlocks.length} notes)`,
        content: data?.content || "",
        pillars: [],
        directions: [],
        tags: ["ai-summary"],
      });
      toast.success("Summary block created ✅");
      clearSelection();
    } catch (e: any) {
      toast.error(e?.message || "Summarize failed");
    }
    setBulkLoading(null);
  };

  const handleBulkOrganize = async () => {
    if (selectedBlocks.length < 1) return;
    setBulkLoading("organize");
    let count = 0;
    for (const block of selectedBlocks) {
      try {
        const { data, error } = await supabase.functions.invoke("ai-archive-expand", {
          body: { content: block.content, title: block.title, action: "organize" },
        });
        if (error) throw error;
        if (data?.pillars) {
          await archive.updateBlock(block.id, {
            pillars: data.pillars,
            tags: data.tags || block.tags,
          });
          count++;
        }
      } catch {
        // continue with others
      }
    }
    toast.success(`Organized ${count}/${selectedBlocks.length} blocks ✅`);
    clearSelection();
    setBulkLoading(null);
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} blocks? This cannot be undone.`)) return;
    setBulkLoading("delete");
    for (const id of selectedIds) {
      await archive.deleteBlock(id);
    }
    toast.success(`Deleted ${selectedIds.size} blocks`);
    clearSelection();
    setBulkLoading(null);
  };

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

      <div className="relative">
        {subView === "inbox" && (
          <ArchiveInbox addBlock={archive.addBlock} addBlocks={archive.addBlocks} existingTags={existingTags} />
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
            semanticSearch={archive.semanticSearch}
            searchArchive={archive.searchArchive}
            embedAll={archive.embedAll}
            onPlant={plantOne}
          />
        )}
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
            <ArchiveLinksView blocks={archive.blocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} addBlock={archive.addBlock} bookmarks={bookmarks} />
          )}
          {subView === "images" && (
            <ArchiveImagesView blocks={archive.blocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
          )}
          {subView === "digest" && <ArchiveDigestView blocks={archive.blocks} />}
          {subView === "forest" && <ArchiveForestView />}
          {subView === "bookmarks" && (
            <ArchiveBookmarksView bookmarks={bookmarks} blocks={archive.blocks} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
          )}
          {subView === "fileshare" && <FileShareView blocks={archive.blocks} />}
        </Suspense>
      </div>

      {/* Multi-select floating bar */}
      <AnimatePresence>
        {selectedIds.size >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-2xl glass-card border border-white/20 glow-md flex-wrap justify-center"
          >
            <span className="text-sm font-semibold">{selectedIds.size} selected</span>
            <span className="w-px h-5 bg-white/15" />
            <button onClick={handleBulkMerge} disabled={bulkLoading !== null} className="px-3 py-1.5 rounded-xl bg-muted/50 border border-white/10 text-[11px] font-bold hover:bg-muted transition-all disabled:opacity-40">
              {bulkLoading === "merge" ? "⏳" : "🔗 Merge"}
            </button>
            <button onClick={handleBulkSummarize} disabled={bulkLoading !== null} className="px-3 py-1.5 rounded-xl bg-muted/50 border border-white/10 text-[11px] font-bold hover:bg-muted transition-all disabled:opacity-40">
              {bulkLoading === "summarize" ? "⏳" : "📝 Summarize"}
            </button>
            <button onClick={handleBulkOrganize} disabled={bulkLoading !== null} className="px-3 py-1.5 rounded-xl bg-muted/50 border border-white/10 text-[11px] font-bold hover:bg-muted transition-all disabled:opacity-40">
              {bulkLoading === "organize" ? "⏳" : "🏷️ Organize All"}
            </button>
            <button onClick={() => setAiPromptOpen(true)} disabled={bulkLoading !== null} className="px-3 py-1.5 rounded-xl gradient-purple text-primary-foreground text-[11px] font-bold glow-sm hover:opacity-90 transition-all disabled:opacity-40">
              🤖 AI Prompt
            </button>
            <span className="w-px h-5 bg-white/15" />
            <button onClick={() => setPlantOpen(true)} disabled={bulkLoading !== null} className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-40">
              🌱 Plant {selectedIds.size}
            </button>
            <span className="w-px h-5 bg-white/15" />
            <button onClick={handleBulkDelete} disabled={bulkLoading !== null} className="px-3 py-1.5 rounded-xl bg-destructive/20 border border-destructive/30 text-[11px] font-bold text-destructive hover:bg-destructive/30 transition-all disabled:opacity-40">
              {bulkLoading === "delete" ? "⏳" : "🗑️ Delete"}
            </button>
            <button onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-1">
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ArchiveAIPromptModal
        open={aiPromptOpen}
        onClose={() => setAiPromptOpen(false)}
        selectedBlocks={selectedBlocks}
        onResult={handleAIResult}
        onReplaceBlocks={handleReplaceBlocks}
        onRemoveFromSelection={removeFromSelection}
      />

      {/* Mounted only while open: planting needs the Forest and the friends list, which the Archive does not load otherwise. */}
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
    </motion.div>
  );
};

export default ArchiveView;