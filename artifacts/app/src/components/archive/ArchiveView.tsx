import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchiveState } from "@/hooks/useArchiveState";
import ArchiveInbox from "./ArchiveInbox";
import ArchiveLibrary from "./ArchiveLibrary";
import ArchiveLinksView from "./ArchiveLinksView";
import ArchiveImagesView from "./ArchiveImagesView";
import ArchiveAIPromptModal from "./ArchiveAIPromptModal";
import ArchiveDigestView from "./ArchiveDigestView";
import ArchiveForestView from "./ArchiveForestView";
import ArchiveBookmarksView from "./ArchiveBookmarksView";
import PlantSeedModal from "./PlantSeedModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ArchiveBlock } from "@/lib/archive-data";

type SubView = "inbox" | "library" | "links" | "images" | "digest" | "forest" | "bookmarks";

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
const IMAGE_TAG_REGEX = /\[image\]\s*(https?:\/\/[^\s]+)/g;
const BARE_IMG_REGEX = /https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)/gi;

function countLinks(blocks: ArchiveBlock[]): number {
  const urls = new Set<string>();
  for (const b of blocks) {
    const matches = b.content.match(URL_REGEX) || [];
    matches.forEach((u) => urls.add(u));
    if (b.source_url) urls.add(b.source_url);
  }
  return urls.size;
}

function countImages(blocks: ArchiveBlock[]): number {
  const urls = new Set<string>();
  for (const b of blocks) {
    let m: RegExpExecArray | null;
    const r1 = new RegExp(IMAGE_TAG_REGEX);
    while ((m = r1.exec(b.content))) urls.add(m[1]);
    const r2 = new RegExp(BARE_IMG_REGEX);
    while ((m = r2.exec(b.content))) urls.add(m[0]);
  }
  return urls.size;
}

const ArchiveView = () => {
  const [subView, setSubView] = useState<SubView>("inbox");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [plantOpen, setPlantOpen] = useState(false);
  const [singlePlantBlock, setSinglePlantBlock] = useState<ArchiveBlock | null>(null);
  const archive = useArchiveState();

  const linkCount = useMemo(() => countLinks(archive.blocks), [archive.blocks]);
  const imageCount = useMemo(() => countImages(archive.blocks), [archive.blocks]);

  // Digest count is now shown dynamically from the component itself

  const NAV_ITEMS: { id: SubView; label: string; icon: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", icon: "📥" },
    { id: "library", label: "Library", icon: "📚", count: archive.blocks.length },
    { id: "links", label: "Links", icon: "🔗", count: linkCount },
    { id: "images", label: "Images", icon: "🖼️", count: imageCount },
    { id: "digest", label: "Digest", icon: "🔁" },
    { id: "forest", label: "Forest", icon: "🌳" },
    { id: "bookmarks", label: "Bookmarks", icon: "⭐" },
  ];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeFromSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  const selectedBlocks = archive.blocks.filter((b) => selectedIds.has(b.id));

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
        directions: [...new Set(selectedBlocks.flatMap((b) => b.directions))],
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
            directions: data.directions || block.directions,
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
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
              subView === item.id
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

      {archive.hasStaleError && (
        <div className="text-[11px] text-yellow-400/80 px-1">
          ⚠️ Couldn't refresh — showing cached blocks.
        </div>
      )}

      {/* Content — all sub-views stay mounted so state (search, scroll, selection) survives switching. */}
      <div className="relative">
        <div className={subView === "inbox" ? "" : "hidden"}>
          <ArchiveInbox addBlock={archive.addBlock} addBlocks={archive.addBlocks} />
        </div>
        <div className={subView === "library" ? "" : "hidden"}>
          <ArchiveLibrary
            blocks={archive.blocks}
            loading={archive.loading}
            updateBlock={archive.updateBlock}
            deleteBlock={archive.deleteBlock}
            addBlocks={archive.addBlocks}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            semanticSearch={archive.semanticSearch}
            embedAll={archive.embedAll}
            onPlant={(b) => setSinglePlantBlock(b)}
          />
        </div>
        <div className={subView === "links" ? "" : "hidden"}>
          <ArchiveLinksView blocks={archive.blocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
        </div>
        <div className={subView === "images" ? "" : "hidden"}>
          <ArchiveImagesView blocks={archive.blocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
        </div>
        <div className={subView === "digest" ? "" : "hidden"}>
          <ArchiveDigestView blocks={archive.blocks} />
        </div>
        <div className={subView === "forest" ? "" : "hidden"}>
          <ArchiveForestView />
        </div>
        <div className={subView === "bookmarks" ? "" : "hidden"}>
          <ArchiveBookmarksView />
        </div>
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

      <PlantSeedModal
        open={plantOpen}
        blocks={selectedBlocks}
        onClose={() => setPlantOpen(false)}
        onPlanted={() => clearSelection()}
      />

      <PlantSeedModal
        open={singlePlantBlock !== null}
        blocks={singlePlantBlock ? [singlePlantBlock] : []}
        onClose={() => setSinglePlantBlock(null)}
      />
    </motion.div>
  );
};

export default ArchiveView;