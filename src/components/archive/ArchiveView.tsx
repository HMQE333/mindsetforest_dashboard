import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchiveState } from "@/hooks/useArchiveState";
import ArchiveInbox from "./ArchiveInbox";
import ArchiveLibrary from "./ArchiveLibrary";
import ArchiveAIPromptModal from "./ArchiveAIPromptModal";
import type { ArchiveBlock } from "@/lib/archive-data";

type SubView = "inbox" | "library" | "map";

const NAV_ITEMS: { id: SubView; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "📥" },
  { id: "library", label: "Library", icon: "📚" },
  { id: "map", label: "Map", icon: "🗺️" },
];

const ArchiveView = () => {
  const [subView, setSubView] = useState<SubView>("inbox");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const archive = useArchiveState();

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
      <div className="flex items-center gap-2">
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
          </button>
        ))}
        <div className="ml-auto text-sm text-muted-foreground">
          {archive.blocks.length} blocks
        </div>
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
        {subView === "map" && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-20">
            <span className="text-4xl mb-4 block">🗺️</span>
            <p className="text-muted-foreground">Knowledge Map coming soon...</p>
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
