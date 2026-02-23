import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ArchiveBlock } from "@/lib/archive-data";

interface Props {
  blocks: ArchiveBlock[];
  loading: boolean;
}

type LinkType = "all" | "link" | "video" | "image" | "other";

const LINK_FILTERS: { id: LinkType; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "🔗" },
  { id: "link", label: "Links", icon: "🌐" },
  { id: "video", label: "Videos", icon: "🎬" },
  { id: "image", label: "Images", icon: "🖼️" },
  { id: "other", label: "Other", icon: "📎" },
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

function extractLinks(block: ArchiveBlock) {
  const urls = new Set<string>();
  const matches = block.content.match(URL_REGEX) || [];
  matches.forEach((u) => urls.add(u));
  if (block.source_url) urls.add(block.source_url);
  return Array.from(urls).map((url) => ({
    url,
    type: classifyUrl(url),
    blockTitle: block.title,
    blockId: block.id,
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

const ArchiveLinksView = ({ blocks, loading }: Props) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<LinkType>("all");

  const allLinks = useMemo(() => {
    return blocks.flatMap(extractLinks);
  }, [blocks]);

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
      {/* Search + type filters */}
      <div className="glass-card p-4 space-y-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search links or block titles..."
          className="bg-background/50 border-white/10"
        />
        <div className="flex flex-wrap gap-1.5">
          {LINK_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={`text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all flex items-center gap-1 ${
                typeFilter === f.id
                  ? "gradient-purple text-primary-foreground glow-sm"
                  : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.icon} {f.label}
              <span className="ml-0.5 opacity-70">({counts[f.id]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Links list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">🔗</span>
          <p>{allLinks.length === 0 ? "No links found in your blocks." : "No links match your filter."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((link, i) => {
            const ytId = link.type === "video" ? getYouTubeId(link.url) : null;
            const favicon = getFavicon(link.url);
            let hostname = "";
            try { hostname = new URL(link.url).hostname.replace("www.", ""); } catch {}

            return (
              <a
                key={`${link.url}-${i}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block glass-card p-3 hover:border-primary/30 border border-transparent transition-all group"
              >
                {/* YouTube embed preview */}
                {ytId && (
                  <div className="mb-3 rounded-lg overflow-hidden aspect-video bg-muted">
                    <img
                      src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                      alt="Video thumbnail"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}

                {/* Image preview */}
                {link.type === "image" && (
                  <div className="mb-3 rounded-lg overflow-hidden max-h-48 bg-muted">
                    <img
                      src={link.url}
                      alt="Image preview"
                      className="w-full h-full object-contain"
                      loading="lazy"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Favicon */}
                  <div className="mt-0.5 shrink-0 w-5 h-5 rounded bg-muted/50 flex items-center justify-center overflow-hidden">
                    {favicon ? (
                      <img src={favicon} alt="" className="w-4 h-4" loading="lazy" />
                    ) : (
                      <span className="text-xs">🔗</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* URL */}
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {hostname}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{link.url}</p>
                    {/* Block source */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-white/10">
                        {link.type === "video" ? "🎬 Video" : link.type === "image" ? "🖼️ Image" : "🌐 Link"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate">
                        from: {link.blockTitle}
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArchiveLinksView;
