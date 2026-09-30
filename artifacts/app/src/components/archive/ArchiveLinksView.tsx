import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LayoutList, LayoutGrid, AlignJustify, FolderOpen, ChevronDown, ChevronRight, Trash2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { autoTitle, LINK_REGEX, removeUrls, type ArchiveBlock } from "@/lib/archive-data";
import type { useBookmarks } from "@/hooks/useBookmarks";
import ArchiveEditModal from "./ArchiveEditModal";
import LinkContextMenu, { type ContextMenuState } from "./LinkContextMenu";
import VideoSummaryPanel, { type VideoPanelTarget } from "./VideoSummaryPanel";
import WorkshopLibraryPanel from "./WorkshopLibraryPanel";
import { summaryBusy, useLinkSummaryIndex, type LinkSummaryMeta } from "@/hooks/useLinkSummaries";
import { youtubeId } from "@/lib/youtube";
import { safeUrl } from "@/lib/safe-url";

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
  updateBlock: (id: string, updates: Partial<ArchiveBlock>) => Promise<unknown>;
  deleteBlock: (id: string) => Promise<unknown>;
  addBlock: (block: Partial<ArchiveBlock>) => Promise<unknown>;
  bookmarks?: ReturnType<typeof useBookmarks>;
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

const URL_REGEX = LINK_REGEX;

// Rows rendered at a time. A pasted list can hold thousands of links, and this
// view stays mounted (hidden) behind the other archive tabs, so rendering them
// all froze the page for seconds on every change.
const PAGE = 200;

/** A note with more links than this is a list, not a note (see allLinks). */
const BULK_NOTE_LINKS = 100;

/** Marks a bookmarked link. */
const Star = () => <span className="text-amber-400 mr-1" title="Bookmarked" aria-label="Bookmarked">★</span>;

/** Shown on a link whose video has a summary (or one being made); opens it. */
function SummaryMarker({ summary, onOpen }: { summary?: LinkSummaryMeta; onOpen?: () => void }) {
  if (!summary || !onOpen || (summary.status === "none" && summary.workshop_status === "none")) return null;
  const busy = summaryBusy(summary);
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }}
      title={busy ? "Summary in progress" : "Open the summary"}
      aria-label="Open the video summary"
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors shrink-0"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} Summary
    </button>
  );
}

/** Takes links out of their notes. Always visible on touch screens, on hover elsewhere. */
function RemoveLinkButton({ onRemove, className, title = "Remove this link from its note", label = "Remove link" }: { onRemove: () => void; className: string; title?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
      title={title}
      aria-label={label}
      className={`absolute z-10 rounded-md bg-background/80 border border-white/10 text-muted-foreground hover:text-destructive hover:border-destructive/40 opacity-0 group-hover/link:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity ${className}`}
    >
      <Trash2 size={12} />
    </button>
  );
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <button
      onClick={onMore}
      className="w-full text-xs py-2 rounded-lg bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
    >
      Show {Math.min(PAGE, total - shown)} more ({total - shown} left)
    </button>
  );
}
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
  // Strip URLs from content to get the plain note text
  const note = block.content.replace(URL_REGEX, "").replace(/\n{2,}/g, "\n").trim();
  return Array.from(urls).map((url) => ({
    url,
    type: classifyUrl(url),
    blockTitle: block.title,
    blockId: block.id,
    block,
    note,
  }));
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

function ListItem({ link, onContextMenu, onRemove, summary, onOpenSummary, bookmarked }: { link: ExtractedLink; onContextMenu: (e: React.MouseEvent) => void; onRemove: () => void; summary?: LinkSummaryMeta; onOpenSummary?: () => void; bookmarked?: boolean }) {
  const ytId = link.type === "video" ? youtubeId(link.url) : null;
  const favicon = getFavicon(link.url);
  const hostname = getHostname(link.url);

  return (
    <div className="relative group/link">
      <a
        href={safeUrl(link.url) ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        onContextMenu={onContextMenu}
        className="pr-11 block glass-card p-3 hover:border-primary/30 border border-transparent transition-all group"
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
            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{bookmarked && <Star />}{hostname}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{link.url}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10">
                {link.type === "video" ? "🎬 Video" : link.type === "image" ? "🖼️ Image" : "🌐 Link"}
              </Badge>
              <SummaryMarker summary={summary} onOpen={onOpenSummary} />
              <span className="text-[10px] text-muted-foreground truncate">from: {link.blockTitle}</span>
            </div>
            {link.note && (
              <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2 italic">{link.note}</p>
            )}
          </div>
        </div>
      </a>
      <RemoveLinkButton onRemove={onRemove} className="p-1.5 top-2.5 right-2.5" />
    </div>
  );
}

function GridCard({ link, onContextMenu, onRemove, summary, onOpenSummary, bookmarked }: { link: ExtractedLink; onContextMenu: (e: React.MouseEvent) => void; onRemove: () => void; summary?: LinkSummaryMeta; onOpenSummary?: () => void; bookmarked?: boolean }) {
  const ytId = link.type === "video" ? youtubeId(link.url) : null;
  const favicon = getFavicon(link.url);
  const hostname = getHostname(link.url);

  return (
    <div className="relative group/link h-full">
      <a
        href={safeUrl(link.url) ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        onContextMenu={onContextMenu}
        className="h-full glass-card overflow-hidden hover:border-primary/30 border border-transparent transition-all group flex flex-col"
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
          <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">{bookmarked && <Star />}{hostname}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-white/10">
              {link.type === "video" ? "🎬" : link.type === "image" ? "🖼️" : "🌐"}
            </Badge>
            <SummaryMarker summary={summary} onOpen={onOpenSummary} />
            <span className="text-[9px] text-muted-foreground truncate">{link.blockTitle}</span>
          </div>
          {link.note && (
            <p className="text-[9px] text-muted-foreground/70 mt-1 line-clamp-1 italic">{link.note}</p>
          )}
        </div>
      </a>
      <RemoveLinkButton onRemove={onRemove} className="p-1.5 top-2 right-2" />
    </div>
  );
}

function CompactRow({ link, onContextMenu, onRemove, summary, onOpenSummary, bookmarked }: { link: ExtractedLink; onContextMenu: (e: React.MouseEvent) => void; onRemove: () => void; summary?: LinkSummaryMeta; onOpenSummary?: () => void; bookmarked?: boolean }) {
  const favicon = getFavicon(link.url);
  const hostname = getHostname(link.url);

  return (
    <div className="relative group/link">
      <a
        href={safeUrl(link.url) ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        onContextMenu={onContextMenu}
        className="pr-10 flex items-center gap-2 px-3 py-1.5 glass-card hover:border-primary/30 border border-transparent transition-all group"
      >
        <div className="shrink-0 w-4 h-4 rounded overflow-hidden flex items-center justify-center">
          {favicon ? <img src={favicon} alt="" className="w-4 h-4" loading="lazy" /> : <span className="text-[10px]">🔗</span>}
        </div>
        <span className="text-xs font-semibold text-foreground w-28 truncate shrink-0 group-hover:text-primary transition-colors">{bookmarked && <Star />}{hostname}</span>
        <span className="text-xs text-muted-foreground truncate flex-1">{link.url}</span>
        {link.note && (
          <span className="text-[9px] text-muted-foreground/60 truncate max-w-[180px] italic shrink-0">{link.note}</span>
        )}
        <SummaryMarker summary={summary} onOpen={onOpenSummary} />
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/10 shrink-0">
          {link.type === "video" ? "🎬" : link.type === "image" ? "🖼️" : "🌐"}
        </Badge>
      </a>
      <RemoveLinkButton onRemove={onRemove} className="p-1 top-1/2 -translate-y-1/2 right-1.5" />
    </div>
  );
}

function DomainGroupView({ links, onContextMenu, onRemove, onRemoveDomain, summaryOf, onOpenSummary, isBookmarked }: {
  links: ExtractedLink[];
  onContextMenu: (e: React.MouseEvent, link: ExtractedLink) => void;
  onRemove: (link: ExtractedLink) => void;
  onRemoveDomain: (domain: string, links: ExtractedLink[]) => void;
  summaryOf: (link: ExtractedLink) => LinkSummaryMeta | undefined;
  onOpenSummary: (link: ExtractedLink) => void;
  isBookmarked: (url: string) => boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [groupsShown, setGroupsShown] = useState(PAGE);
  const [linksShown, setLinksShown] = useState<Record<string, number>>({});

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
      {grouped.slice(0, groupsShown).map(([domain, domainLinks]) => {
        const isOpen = expanded[domain] ?? false;
        const shown = linksShown[domain] ?? PAGE;
        const favicon = getFavicon(domainLinks[0].url);
        return (
          <div key={domain}>
            <div className="relative group/link">
              <button
                onClick={() => toggle(domain)}
                className="w-full glass-card p-3 pr-12 flex items-center gap-3 hover:border-primary/30 border border-transparent transition-all"
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
              <RemoveLinkButton
                onRemove={() => onRemoveDomain(domain, domainLinks)}
                title={`Remove all ${domainLinks.length} links from ${domain}`}
                label={`Remove all links from ${domain}`}
                className="p-1.5 top-1/2 -translate-y-1/2 right-2.5"
              />
            </div>
            {isOpen && (
              <div className="ml-4 mt-1 space-y-1">
                {domainLinks.slice(0, shown).map((link, i) => (
                  <CompactRow key={`${link.url}-${i}`} link={link} onContextMenu={(e) => onContextMenu(e, link)} onRemove={() => onRemove(link)} summary={summaryOf(link)} onOpenSummary={() => onOpenSummary(link)} bookmarked={isBookmarked(link.url)} />
                ))}
                <ShowMore shown={shown} total={domainLinks.length} onMore={() => setLinksShown((p) => ({ ...p, [domain]: shown + PAGE }))} />
              </div>
            )}
          </div>
        );
      })}
      <ShowMore shown={groupsShown} total={grouped.length} onMore={() => setGroupsShown((n) => n + PAGE)} />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

const ArchiveLinksView = ({ blocks, loading, updateBlock, deleteBlock, addBlock, bookmarks }: Props) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<LinkType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editBlock, setEditBlock] = useState<ArchiveBlock | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // A pasted list of thousands of links is one note, and the newest one; its
  // links go after those of ordinary notes, or it buries them (and their
  // previews) behind page after page of "show more".
  const allLinks = useMemo(() => {
    const perNote = blocks.map(extractLinks);
    return [...perNote.filter((l) => l.length <= BULK_NOTE_LINKS), ...perNote.filter((l) => l.length > BULK_NOTE_LINKS)].flat();
  }, [blocks]);

  const filtered = useMemo(() => {
    return allLinks.filter((link) => {
      if (typeFilter !== "all" && link.type !== typeFilter) return false;
      if (search && !link.url.toLowerCase().includes(search.toLowerCase()) && !link.blockTitle.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allLinks, typeFilter, search]);

  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [typeFilter, search, viewMode]);
  const visible = filtered.slice(0, shown);
  const more = <ShowMore shown={shown} total={filtered.length} onMore={() => setShown((n) => n + PAGE)} />;

  const counts = useMemo(() => {
    const c = { all: allLinks.length, link: 0, video: 0, image: 0, other: 0 };
    allLinks.forEach((l) => {
      if (l.type in c) c[l.type as keyof typeof c]++;
      else c.other++;
    });
    return c;
  }, [allLinks]);

  // Removals run one at a time on the newest copy of each note, so two quick
  // clicks in one note never write back a link the first one took out.
  const blocksRef = useRef(blocks);
  const written = useRef(new Map<string, ArchiveBlock>());
  useEffect(() => { blocksRef.current = blocks; written.current.clear(); }, [blocks]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const current = (id: string) => written.current.get(id) ?? blocksRef.current.find((b) => b.id === id);

  /** A note as it was before a removal, and its content after (null: the note was deleted). */
  type Change = { before: ArchiveBlock; after: string | null };

  const undoChanges = useCallback(async (changes: Change[]) => {
    let restored = 0;
    let moved = 0;
    for (const { before, after } of changes) {
      if (after === null) {
        if (await addBlock(before)) restored++;
        continue;
      }
      const now = current(before.id);
      if (!now || now.content !== after) { moved++; continue; }
      const back = { content: before.content, title: before.title, source_url: before.source_url };
      if ((await updateBlock(before.id, back)) === false) continue;
      written.current.set(before.id, { ...now, ...back });
      restored++;
    }
    if (moved === 0) toast.success(changes.length === 1 ? "Restored" : `Restored ${restored} notes`);
    else toast.error(`Restored ${restored}. ${moved} ${moved === 1 ? "note has" : "notes have"} changed since and ${moved === 1 ? "was" : "were"} left as ${moved === 1 ? "it is" : "they are"}.`);
  }, [updateBlock, addBlock]);

  /**
   * Take links out of their notes: their text goes from the content (and from
   * source_url). A note left with nothing, under the title the inbox gave it,
   * is deleted instead of kept empty. Each note is written once, and the whole
   * removal can be undone from its toast.
   */
  const removeLinks = useCallback((targets: { url: string; blockId: string }[], domain?: string) => {
    queue.current = queue.current.then(async () => {
      const byBlock = new Map<string, string[]>();
      for (const t of targets) byBlock.set(t.blockId, [...(byBlock.get(t.blockId) ?? []), t.url]);
      const changes: Change[] = [];
      for (const [blockId, urls] of byBlock) {
        const block = current(blockId);
        if (!block) continue;
        const content = removeUrls(block.content, urls);
        const source_url = block.source_url && urls.includes(block.source_url) ? null : block.source_url;
        if (content === block.content && source_url === block.source_url) continue;
        const titled = block.title === autoTitle(block.content);
        if (!content && !source_url && titled) {
          if ((await deleteBlock(block.id)) === false) break;
          changes.push({ before: block, after: null });
          continue;
        }
        const next = { content, source_url, title: titled ? autoTitle(content) || block.title : block.title };
        if ((await updateBlock(block.id, next)) === false) break;
        written.current.set(block.id, { ...block, ...next });
        changes.push({ before: block, after: content });
      }
      if (changes.length === 0) return;
      const deleted = changes.filter((c) => c.after === null).length;
      const message = domain
        ? `Removed ${targets.length} ${targets.length === 1 ? "link" : "links"} from ${domain}` +
          (deleted > 0 ? `. ${deleted} ${deleted === 1 ? "note" : "notes"} left empty ${deleted === 1 ? "was" : "were"} deleted.` : "")
        : deleted > 0
          ? "Link removed. The note held only this link, so it was deleted."
          : "Link removed from the note";
      toast.success(message, {
        duration: domain ? 12000 : 6000,
        action: { label: "Undo", onClick: () => void undoChanges(changes) },
      });
    }).catch(() => { /* the failure was toasted by the write */ });
  }, [updateBlock, deleteBlock, undoChanges]);

  const removeLink = useCallback((url: string, blockId: string) => removeLinks([{ url, blockId }]), [removeLinks]);

  // Video summaries: which links have one, and the panel that shows them.
  const { index: summaries, refresh: refreshSummaries } = useLinkSummaryIndex();
  const summaryOf = useCallback((link: ExtractedLink) => {
    if (link.type !== "video") return undefined;
    const id = youtubeId(link.url);
    return id ? summaries.get(id) : undefined;
  }, [summaries]);
  const [video, setVideo] = useState<VideoPanelTarget | null>(null);
  /** Open a video's panel; with an action, start that pass unless it is done or running. */
  const openVideo = useCallback((url: string, action?: "summarize" | "workshop") => {
    const id = youtubeId(url);
    if (!id) return;
    const meta = summaries.get(id);
    const done = action === "workshop"
      ? meta?.workshop_status === "ready" || meta?.workshop_status === "running"
      : meta?.status === "ready" || meta?.status === "transcribing" || meta?.status === "summarizing";
    setVideo({ url, videoId: id, tab: action === "workshop" ? "workshop" : "summary", start: action && !done ? action : undefined });
  }, [summaries]);

  // Bookmarks of links, shared with the Bookmarks tab.
  const isMarked = useCallback((url: string) => bookmarks?.isBookmarked(url) ?? false, [bookmarks]);
  const toggleBookmark = useCallback((url: string, block: ArchiveBlock) => {
    if (!bookmarks) return;
    const id = youtubeId(url);
    const title = id ? summaries.get(id)?.title ?? "" : "";
    void bookmarks.toggleBookmark(url, title, block.id).then((done) => {
      if (done) toast.success(done === "added" ? "Bookmarked" : "Bookmark removed");
    });
  }, [bookmarks, summaries]);

  // Every workshop in one place, once there is one.
  const [workshopsOpen, setWorkshopsOpen] = useState(false);
  const workshopCount = useMemo(() => [...summaries.values()].filter((s) => s.workshop_status === "ready").length, [summaries]);

  // Removing a whole domain asks first.
  const [confirmDomain, setConfirmDomain] = useState<{ domain: string; links: ExtractedLink[] } | null>(null);
  const confirmNotes = confirmDomain ? new Set(confirmDomain.links.map((l) => l.blockId)).size : 0;

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
          {workshopCount > 0 && (
            <button
              onClick={() => setWorkshopsOpen(true)}
              title="How your saved videos are made: every workshop in one place"
              className="text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all flex items-center gap-1 bg-muted/40 text-muted-foreground hover:text-foreground"
            >
              🎬 Workshops <span className="opacity-70">({workshopCount})</span>
            </button>
          )}
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
          {visible.map((link, i) => (
            <ListItem key={`${link.url}-${i}`} link={link} onContextMenu={(e) => handleContextMenu(e, link)} onRemove={() => removeLink(link.url, link.blockId)} summary={summaryOf(link)} onOpenSummary={() => openVideo(link.url)} bookmarked={isMarked(link.url)} />
          ))}
          {more}
        </div>
      ) : viewMode === "grid" ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visible.map((link, i) => (
              <GridCard key={`${link.url}-${i}`} link={link} onContextMenu={(e) => handleContextMenu(e, link)} onRemove={() => removeLink(link.url, link.blockId)} summary={summaryOf(link)} onOpenSummary={() => openVideo(link.url)} bookmarked={isMarked(link.url)} />
            ))}
          </div>
          {more}
        </div>
      ) : viewMode === "compact" ? (
        <div className="space-y-1">
          {visible.map((link, i) => (
            <CompactRow key={`${link.url}-${i}`} link={link} onContextMenu={(e) => handleContextMenu(e, link)} onRemove={() => removeLink(link.url, link.blockId)} summary={summaryOf(link)} onOpenSummary={() => openVideo(link.url)} bookmarked={isMarked(link.url)} />
          ))}
          {more}
        </div>
      ) : (
        <DomainGroupView
          links={filtered}
          onContextMenu={handleContextMenu}
          onRemove={(link) => removeLink(link.url, link.blockId)}
          summaryOf={summaryOf}
          onOpenSummary={(link) => openVideo(link.url)}
          isBookmarked={isMarked}
          onRemoveDomain={(domain, links) => setConfirmDomain({ domain, links })}
        />
      )}

      <AlertDialog open={!!confirmDomain} onOpenChange={(open) => { if (!open) setConfirmDomain(null); }}>
        <AlertDialogContent className="glass-card border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all links from {confirmDomain?.domain}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDomain?.links.length} {confirmDomain?.links.length === 1 ? "link" : "links"} will be taken out of{" "}
              {confirmNotes} {confirmNotes === 1 ? "note" : "notes"}. A note left with nothing in it is deleted.
              {(search || typeFilter !== "all") && " Only the links your search and filter show here are removed."}
              {" "}You can undo it right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDomain) removeLinks(confirmDomain.links.map((l) => ({ url: l.url, blockId: l.blockId })), confirmDomain.domain);
                setConfirmDomain(null);
              }}
            >
              Remove {confirmDomain?.links.length} {confirmDomain?.links.length === 1 ? "link" : "links"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VideoSummaryPanel
        target={video}
        onClose={() => setVideo(null)}
        onChange={refreshSummaries}
        onOpenWorkshops={workshopCount > 0 ? () => { setVideo(null); setWorkshopsOpen(true); } : undefined}
      />
      <WorkshopLibraryPanel
        open={workshopsOpen}
        onClose={() => setWorkshopsOpen(false)}
        onOpenVideo={(url) => { setWorkshopsOpen(false); openVideo(url); }}
      />

      {/* Context menu */}
      <LinkContextMenu
        menu={contextMenu}
        onClose={() => setContextMenu(null)}
        onEditBlock={handleEditBlock}
        onRemoveLink={(url, block) => removeLink(url, block.id)}
        summaryFor={(id) => summaries.get(id)}
        onVideo={openVideo}
        isBookmarked={bookmarks ? isMarked : undefined}
        onToggleBookmark={bookmarks ? toggleBookmark : undefined}
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
