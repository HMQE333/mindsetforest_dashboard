import { useMemo } from "react";
import { usePillars } from "@/hooks/usePillars";
import PillarIcon from "@/components/shared/PillarIcon";
import type { ArchiveBlock } from "@/lib/archive-data";

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/;
const IMAGE_REGEX = /\[image\]\s*https?:\/\/[^\s]+|https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg|bmp)/i;

function getBlockType(block: ArchiveBlock): string {
  if (IMAGE_REGEX.test(block.content)) return "🖼️ Images";
  if (URL_REGEX.test(block.content) || block.source_url) return "🔗 Links";
  return "📚 Library";
}

interface Props {
  blocks: ArchiveBlock[];
  query: string;
  onNavigate: (view: string) => void;
  onClearSearch: () => void;
  skipFilter?: boolean;
}

const ArchiveSearchResults = ({ blocks, query, onNavigate, onClearSearch, skipFilter }: Props) => {
  const pillars = usePillars();

  const results = useMemo(() => {
    if (skipFilter) return blocks;
    const q = query.toLowerCase();
    return blocks.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.content.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q)) ||
        b.pillars.some((p) => p.toLowerCase().includes(q)) ||
        b.directions.some((d) => d.toLowerCase().includes(q))
    );
  }, [blocks, query]);

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-3xl mb-2 block">🔍</span>
        <p>No results for "{query}"</p>
        <button onClick={onClearSearch} className="text-xs text-primary mt-2 hover:underline">
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {results.length} result{results.length !== 1 ? "s" : ""} for "<span className="text-foreground font-semibold">{query}</span>"
        </p>
        <button onClick={onClearSearch} className="text-xs text-primary hover:underline">
          Clear
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {results.map((block) => {
          const type = getBlockType(block);
          const pillarColors = block.pillars.map((p) => pillars.find((pl) => pl.id === p)).filter(Boolean);
          return (
            <div
              key={block.id}
              className="glass-card-hover p-4 space-y-2 cursor-pointer"
              onClick={() => {
                onClearSearch();
                if (type.includes("Images")) onNavigate("images");
                else if (type.includes("Links")) onNavigate("links");
                else onNavigate("library");
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-semibold">
                  {type}
                </span>
                {block.is_pinned && <span className="text-[10px]">📌</span>}
              </div>
              <h4 className="font-semibold text-sm truncate">{block.title || "Untitled"}</h4>
              <p className="text-xs text-muted-foreground line-clamp-2">{block.content}</p>
              {pillarColors.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {pillarColors.map((p) => (
                    <span
                      key={p!.id}
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"
                      style={{ backgroundColor: p!.color + "22", color: p!.color }}
                    >
                      <PillarIcon icon={p!.icon} iconUrl={p!.iconUrl} size={12} className="inline-block" /> {p!.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ArchiveSearchResults;
