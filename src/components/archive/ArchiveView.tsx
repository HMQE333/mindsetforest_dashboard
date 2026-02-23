import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchiveState } from "@/hooks/useArchiveState";
import ArchiveInbox from "./ArchiveInbox";
import ArchiveLibrary from "./ArchiveLibrary";
import ArchiveLinksView from "./ArchiveLinksView";
import ArchiveImagesView from "./ArchiveImagesView";
import ArchiveAIPromptModal from "./ArchiveAIPromptModal";
import type { ArchiveBlock } from "@/lib/archive-data";

type SubView = "inbox" | "library" | "links" | "images";

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
  const archive = useArchiveState();

  const linkCount = useMemo(() => countLinks(archive.blocks), [archive.blocks]);
  const imageCount = useMemo(() => countImages(archive.blocks), [archive.blocks]);

  const NAV_ITEMS: { id: SubView; label: string; icon: string; count?: number }[] = [
    { id: "inbox", label: "Inbox", icon: "📥" },
    { id: "library", label: "Library", icon: "📚", count: archive.blocks.length },
    { id: "links", label: "Links", icon: "🔗", count: linkCount },
    { id: "images", label: "Images", icon: "🖼️", count: imageCount },
  ];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedBlocks = archive.blocks.filter((b) => selectedIds.has(b.id));

  const handleAIResult = async (result: { title: string; content: string }) => {
    await archive.addBlock({
      title: result.title,
      content: result.content,
      pillars: [],
      directions: [],
      tags: ["ai-generated"],
    });
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

      {/* Content */}
      <AnimatePresence mode="wait">
        {subView === "inbox" && (
          <motion.div key="inbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArchiveInbox addBlock={archive.addBlock} addBlocks={archive.addBlocks} />
          </motion.div>
        )}
        {subView === "library" && (
          <motion.div key="library" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArchiveLibrary
              blocks={archive.blocks}
              loading={archive.loading}
              updateBlock={archive.updateBlock}
              deleteBlock={archive.deleteBlock}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
            />
          </motion.div>
        )}
        {subView === "links" && (
          <motion.div key="links" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArchiveLinksView blocks={archive.blocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
          </motion.div>
        )}
        {subView === "images" && (
          <motion.div key="images" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <ArchiveImagesView blocks={archive.blocks} loading={archive.loading} updateBlock={archive.updateBlock} deleteBlock={archive.deleteBlock} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Multi-select floating bar */}
      <AnimatePresence>
        {selectedIds.size >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-2xl glass-card border border-white/20 glow-md"
          >
            <span className="text-sm font-semibold">{selectedIds.size} selected</span>
            <button
              onClick={() => setAiPromptOpen(true)}
              className="px-4 py-2 rounded-xl gradient-purple text-primary-foreground text-sm font-bold glow-sm hover:opacity-90 transition-all"
            >
              🤖 AI Prompt
            </button>
            <button onClick={clearSelection} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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
      />
    </motion.div>
  );
};

export default ArchiveView;
