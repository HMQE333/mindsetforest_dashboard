import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LayoutList, LayoutGrid, AlignJustify, FolderOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { ArchiveBlock } from "@/lib/archive-data";
import ArchiveEditModal from "./ArchiveEditModal";
import LinkContextMenu, { type ContextMenuState } from "./LinkContextMenu";

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<void>;
  deleteBlock: (id: string) => Promise<void>;
}

type LinkType = "all" | "link" | "video" | "image" | "other";
type ViewMode = "list" | "grid" | "compact" | "domain";

const LINK_FILTERS: { id: LinkType; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "🔗" },
  { id: "link", label: "Links", icon: "🌐" },
  { id: "video", label: "Videos", icon: "🎬" },
  { id: "image", label: "Images", icon: "🖼️" },
  { id: "other", label: "Other", icon: "📎" },
];

const VIEW_MODES: { id: ViewMode; icon: typeof LayoutList; label: string }[] = [
  { id: "list", icon: LayoutList, label: "List" },
  { id: "grid", icon: LayoutGrid, label: "Grid" },
  { id: "compact", icon: AlignJustify, label: "Compact" },
  { id: "domain", icon: FolderOpen, label: "By Domain" },
];

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
const VIDEO_DOMAINS = ["youtube.com", "youtu.be", "vimeo.com", "twitch.tv", "dailymotion.com"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"];

function classifyUrl(url: string): "video" | "image" | "link" {
  try {
    const u = new URL(url);
    if (VIDEO_DOMAINS.some((d) => u.hostname.includes(d))) return "video";
    if (IMAGE_EXTENSIONS.some((ext) => u.pathname.toLowerCase().endsWith(ext))) return "image";
  } catch {}
  return "link";
}

interface ExtractedLink {
  url: string;
  type: "video" | "image" | "link";
  blockTitle: string;
  blockId: string;
  block: ArchiveBlock;
  note: string;
}

function extractLinks(block: ArchiveBlock): ExtractedLink[] {
  const urls = new Set<string>();
  const matches = block.content.match(URL_REGEX) || [];
  matches.forEach((u) => urls.add(u));
  if (block.source_url) urls.add(block.source_url);
  return Array.from(urls).map((url) => ({
    url,
    type: classifyUrl(url),
    blockTitle: block.title,
    blockId: block.id,
    block,
  }));
}

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch {}
  return null;
}

function getFavicon(url: string) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return null;
  }
}

function getHostname(url: string) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
}

// ── Sub-renderers ──────────────────────────────────────────────

function ListItem({ link, onContextMenu }: { link: ExtractedLink; onContextMenu: (e: React.MouseEvent) => void }) {
  const ytId = link.type === "video" ? getYouTubeId(link.url) : null;
  const favicon = getFavicon(link.url);
  const hostname = getHostname(link.url);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onContextMenu={onContextMenu}
      className="block glass-card p-3 hover:border-primary/30 border border-transparent transition-all group"
    >
      {ytId && (
        <div className="mb-3 rounded-lg overflow-hidden aspect-video bg-muted">
          <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="Video thumbnail" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      {link.type === "image" && (
        <div className="mb-3 rounded-lg overflow-hidden max-h-48 bg-muted">
          <img src={link.url} alt="Image preview" className="w-full h-full object-contain" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 w-5 h-5 rounded bg-muted/50 flex items-center justify-center overflow-hidden">
          {favicon ? <img src={favicon} alt="" className="w-4 h-4" loading="lazy" /> : <span className="text-xs">🔗</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{hostname}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{link.url}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10">
              {link.type === "video" ? "🎬 Video" : link.type === "image" ? "🖼️ Image" : "🌐 Link"}
            </Badge>
            <span className="text-[10px] text-muted-foreground truncate">from: {link.blockTitle}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

function GridCard({ link, onContextMenu }: { link: ExtractedLink; onContextMenu: (e: React.MouseEvent) => void }) {
  const ytId = link.type === "video" ? getYouTubeId(link.url) : null;
  const favicon = getFavicon(link.url);
  const hostname = getHostname(link.url);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onContextMenu={onContextMenu}
      className="glass-card overflow-hidden hover:border-primary/30 border border-transparent transition-all group flex flex-col"
    >
      {ytId ? (
        <div className="aspect-video bg-muted">
          <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="Video thumbnail" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : link.type === "image" ? (
        <div className="aspect-square bg-muted">
          <img src={link.url} alt="Image preview" className="w-full h-full object-contain" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
        </div>
      ) : (
        <div className="aspect-video bg-muted/30 flex flex-col items-center justify-center gap-2">
          {favicon ? <img src={favicon} alt="" className="w-12 h-12" loading="lazy" /> : <span className="text-3xl">🔗</span>}
          <span className="text-xs text-muted-foreground font-medium">{hostname}</span>
        </div>
      )}
      <div className="p-2.5 flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{hostname}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge variant="outline" className="text-[9px] px-1 py-0 border-white/10">
            {link.type === "video" ? "🎬" : link.type === "image" ? "🖼️" : "🌐"}
          </Badge>
          <span className="text-[9px] text-muted-foreground truncate">{link.blockTitle}</span>
        </div>
      </div>
    </a>
  );
}

function CompactRow({ link, onContextMenu }: { link: ExtractedLink; onContextMenu: (e: React.MouseEvent) => void }) {
  const favicon = getFavicon(link.url);
  const hostname = getHostname(link.url);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      onContextMenu={onContextMenu}
      className="flex items-center gap-2 px-3 py-1.5 glass-card hover:border-primary/30 border border-transparent transition-all group"
    >
      <div className="shrink-0 w-4 h-4 rounded overflow-hidden flex items-center justify-center">
        {favicon ? <img src={favicon} alt="" className="w-4 h-4" loading="lazy" /> : <span className="text-[10px]">🔗</span>}
      </div>
      <span className="text-xs font-semibold text-foreground w-28 truncate shrink-0 group-hover:text-primary transition-colors">{hostname}</span>
      <span className="text-xs text-muted-foreground truncate flex-1">{link.url}</span>
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/10 shrink-0">
        {link.type === "video" ? "🎬" : link.type === "image" ? "🖼️" : "🌐"}
      </Badge>
    </a>
  );
}

function DomainGroupView({ links, onContextMenu }: { links: ExtractedLink[]; onContextMenu: (e: React.MouseEvent, link: ExtractedLink) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map: Record<string, ExtractedLink[]> = {};
    links.forEach((l) => {
      const h = getHostname(l.url) || "unknown";
      if (!map[h]) map[h] = [];
      map[h].push(l);
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [links]);

  const toggle = (domain: string) => setExpanded((p) => ({ ...p, [domain]: !p[domain] }));

  return (
    <div className="space-y-2">
      {grouped.map(([domain, domainLinks]) => {
        const isOpen = expanded[domain] ?? false;
        const favicon = getFavicon(domainLinks[0].url);
        return (
          <div key={domain}>
            <button
              onClick={() => toggle(domain)}
              className="w-full glass-card p-3 flex items-center gap-3 hover:border-primary/30 border border-transparent transition-all"
            >
              <div className="shrink-0 w-5 h-5 rounded overflow-hidden flex items-center justify-center">
                {favicon ? <img src={favicon} alt="" className="w-4 h-4" loading="lazy" /> : <span className="text-xs">🔗</span>}
              </div>
              <span className="text-sm font-semibold text-foreground">{domain}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10 ml-1">
                {domainLinks.length}
              </Badge>
              <div className="ml-auto text-muted-foreground">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </div>
            </button>
            {isOpen && (
              <div className="ml-4 mt-1 space-y-1">
                {domainLinks.map((link, i) => (
                  <CompactRow key={`${link.url}-${i}`} link={link} onContextMenu={(e) => onContextMenu(e, link)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

const ArchiveLinksView = ({ blocks, loading, updateBlock, deleteBlock }: Props) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<LinkType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const allLinks = useMemo(() => blocks.flatMap(extractLinks), [blocks]);

  const filtered = useMemo(() => {
    return allLinks.filter((link) => {
      if (typeFilter !== "all" && link.type !== typeFilter) return false;
      if (search && !link.url.toLowerCase().includes(search.toLowerCase()) && !link.blockTitle.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allLinks, typeFilter, search]);

  const counts = useMemo(() => {
    const c = { all: allLinks.length, link: 0, video: 0, image: 0, other: 0 };
    allLinks.forEach((l) => {
      if (l.type in c) c[l.type as keyof typeof c]++;
      else c.other++;
    });
    return c;
  }, [allLinks]);

  const handleContextMenu = useCallback((e: React.MouseEvent, link: ExtractedLink) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, url: link.url, block: link.block });
  }, []);

  const handleEditBlock = useCallback((block: ArchiveBlock) => {
    setEditBlock(block);
    setEditModalOpen(true);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <span className="text-2xl animate-pulse">🔗</span>
        <p className="mt-2">Loading links...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + type filters + view toggle */}
      <div className="glass-card p-4 space-y-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search links or block titles..." className="bg-background/50 border-white/10" />
        <div className="flex flex-wrap items-center gap-1.5">
          {LINK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all flex items-center gap-1 ${
                typeFilter === f.id ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.icon} {f.label}
              <span className="ml-0.5 opacity-70">({counts[f.id]})</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1">
            {VIEW_MODES.map((vm) => {
              const Icon = vm.icon;
              return (
                <button
                  key={vm.id}
                  onClick={() => setViewMode(vm.id)}
                  title={vm.label}
                  className={`p-1.5 rounded-md transition-all ${
                    viewMode === vm.id ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">🔗</span>
          <p>{allLinks.length === 0 ? "No links found in your blocks." : "No links match your filter."}</p>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {filtered.map((link, i) => (
            <ListItem key={`${link.url}-${i}`} link={link} onContextMenu={(e) => handleContextMenu(e, link)} />
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((link, i) => (
            <GridCard key={`${link.url}-${i}`} link={link} onContextMenu={(e) => handleContextMenu(e, link)} />
          ))}
        </div>
      ) : viewMode === "compact" ? (
        <div className="space-y-1">
          {filtered.map((link, i) => (
            <CompactRow key={`${link.url}-${i}`} link={link} onContextMenu={(e) => handleContextMenu(e, link)} />
          ))}
        </div>
      ) : (
        <DomainGroupView links={filtered} onContextMenu={handleContextMenu} />
      )}

      {/* Context menu */}
      <LinkContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onEditBlock={handleEditBlock}
        updateBlock={updateBlock}
      />

      {/* Edit modal */}
      <ArchiveEditModal
        block={editBlock}
        open={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditBlock(null); }}
        onSave={updateBlock}
        onDelete={deleteBlock}
      />
    </div>
  );
};

export default ArchiveLinksView;
