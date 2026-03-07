import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Link2Off } from "lucide-react";
import { PILLARS, DIRECTIONS } from "@/lib/archive-data";
import ArchiveBlockCard from "./ArchiveBlockCard";
import ArchiveEditModal from "./ArchiveEditModal";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, u: Partial<ArchiveBlock>) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
}

type SortMode = "newest" | "oldest" | "az";

const ArchiveLibrary = ({ blocks, loading, updateBlock, deleteBlock, selectedIds, toggleSelect }: Props) => {
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [filterDirection, setFilterDirection] = useState<string | null>(null);
  const [hideLinks, setHideLinks] = useState(false);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/;

  const filtered = useMemo(() => {
    const list = blocks.filter((b) => {
      if (filterPillar && !b.pillars.includes(filterPillar)) return false;
      if (filterDirection && !b.directions.includes(filterDirection)) return false;
      if (hideLinks && (URL_REGEX.test(b.content) || b.source_url)) return false;
      return true;
    });
    const sorted = (() => {
      if (sortMode === "oldest") return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sortMode === "az") return [...list].sort((a, b) => a.title.localeCompare(b.title));
      return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    })();
    // Pinned blocks always on top
    return [...sorted.filter((b) => b.is_pinned), ...sorted.filter((b) => !b.is_pinned)];
  }, [blocks, filterPillar, filterDirection, hideLinks, sortMode]);

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
          {/* Select All / Deselect All */}
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
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterPillar(null)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${!filterPillar ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}
          >
            All
          </button>
          {PILLARS.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilterPillar(filterPillar === p.id ? null : p.id)}
              className="text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all"
              style={{
                backgroundColor: filterPillar === p.id ? p.color : p.color + "18",
                color: filterPillar === p.id ? "#fff" : p.color,
              }}
            >
              {p.icon} {p.name}
            </button>
          ))}
        </div>
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
          {DIRECTIONS.map((d) => (
            <button
              key={d.id}
              onClick={() => setFilterDirection(filterDirection === d.id ? null : d.id)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                filterDirection === d.id ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.icon} {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Blocks grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">📭</span>
          <p>{blocks.length === 0 ? "No blocks yet. Add some from the Inbox!" : "No blocks match your filters."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((block) => (
            <ArchiveBlockCard
              key={block.id}
              block={block}
              selected={selectedIds.has(block.id)}
              onToggleSelect={() => toggleSelect(block.id)}
              onEdit={() => setEditBlock(block)}
              onUpdate={updateBlock}
            />
          ))}
        </div>
      )}

      <ArchiveEditModal
        block={editBlock}
        open={editBlock !== null}
        onClose={() => setEditBlock(null)}
        onSave={updateBlock}
        onDelete={deleteBlock}
      />
    </div>
  );
};

export default ArchiveLibrary;
