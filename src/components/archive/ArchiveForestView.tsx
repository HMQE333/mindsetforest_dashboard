import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useForestState, type SeedWithAuthor } from "@/hooks/useForestState";
import { useFriends } from "@/hooks/useFriends";
import { usePillars } from "@/hooks/usePillars";
import { DIRECTIONS } from "@/lib/archive-data";
import { Input } from "@/components/ui/input";
import PillarIcon from "@/components/shared/PillarIcon";
import ForestSeedCard from "./ForestSeedCard";
import EditSeedModal from "./EditSeedModal";
import ForestInboxBell from "./ForestInboxBell";
import ForestCollectionsView from "./ForestCollectionsView";
import ForestDailyStack from "./ForestDailyStack";
import BlockedAuthorsList from "./BlockedAuthorsList";
import { Sprout, Droplet, BookmarkPlus, Eye, Trophy } from "lucide-react";

type DiscoverSort = "trending" | "newest" | "watered" | "saved" | "friends";
type SubTab = "daily" | "discover" | "collections" | "mine";

const ArchiveForestView = () => {
  const forest = useForestState();
  const friends = useFriends();
  const pillars = usePillars();
  const [tab, setTab] = useState<SubTab>("daily");
  const [sort, setSort] = useState<DiscoverSort>("trending");
  const [search, setSearch] = useState("");
  const [smartSearch, setSmartSearch] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SeedWithAuthor[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [filterDirection, setFilterDirection] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState("");
  const [hideSaved, setHideSaved] = useState(false);
  const [editSeed, setEditSeed] = useState<SeedWithAuthor | null>(null);

  const friendIds = useMemo(() => new Set(friends.accepted.map((f) => f.friend.user_id)), [friends.accepted]);

  // Inbox bell deep-open: switch to the right tab + scroll/flash the card
  useEffect(() => {
    const handler = (e: Event) => {
      const seedId = (e as CustomEvent).detail?.seedId as string | undefined;
      if (!seedId) return;
      const isMine = forest.mySeeds.some((s) => s.id === seedId);
      setTab(isMine ? "mine" : "discover");
      // Clear filters so the seed is reachable
      setFilterPillar(null); setFilterDirection(null); setFilterTag(""); setHideSaved(false);
      setSearch(""); setSemanticResults(null);
      // Defer scroll until after re-render
      setTimeout(() => {
        const el = document.getElementById(`forest-seed-${seedId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-primary", "transition-all");
          setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
        }
      }, 350);
    };
    window.addEventListener("lov:forest-focus-seed", handler as EventListener);
    return () => window.removeEventListener("lov:forest-focus-seed", handler as EventListener);
  }, [forest.mySeeds]);

  // Smart search debounce
  useEffect(() => {
    if (!smartSearch || search.trim().length < 2) {
      setSemanticResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const r = await forest.semanticSearchForest(search.trim());
      setSemanticResults(r);
      setSearching(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, smartSearch, forest]);

  const trending = (s: SeedWithAuthor) => {
    const ageH = (Date.now() - new Date(s.published_at).getTime()) / 3_600_000;
    return s.water_count / Math.pow(ageH + 2, 1.5);
  };

  const applyFilters = (list: SeedWithAuthor[]) => {
    let l = list;
    if (filterPillar) l = l.filter((s) => s.pillars.includes(filterPillar));
    if (filterDirection) l = l.filter((s) => s.directions.includes(filterDirection));
    if (filterTag.trim()) {
      const q = filterTag.trim().toLowerCase().replace(/^#/, "");
      l = l.filter((s) => s.tags.some((t) => t.toLowerCase().includes(q)));
    }
    if (hideSaved) l = l.filter((s) => !s.iSaved);
    if (sort === "friends") l = l.filter((s) => friendIds.has(s.author_id));
    return l;
  };

  const sortedDiscover = useMemo(() => {
    // Smart search results
    if (smartSearch && semanticResults) {
      const fromOthers = semanticResults.filter((s) => forest.mySeeds.every((m) => m.id !== s.id));
      return applyFilters(fromOthers);
    }
    let list = forest.discoverSeeds;
    if (search.trim() && !smartSearch) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
    }
    list = applyFilters(list);
    return [...list].sort((a, b) => {
      if (sort === "trending") return trending(b) - trending(a);
      if (sort === "newest") return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      if (sort === "watered") return b.water_count - a.water_count;
      if (sort === "saved") return b.save_count - a.save_count;
      // friends: newest within filter
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forest.discoverSeeds, sort, search, filterPillar, filterDirection, filterTag, hideSaved, smartSearch, semanticResults, friendIds]);

  const filteredMine = useMemo(() => {
    let list = forest.mySeeds;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
    }
    if (filterPillar) list = list.filter((s) => s.pillars.includes(filterPillar));
    if (filterDirection) list = list.filter((s) => s.directions.includes(filterDirection));
    if (filterTag.trim()) {
      const q = filterTag.trim().toLowerCase().replace(/^#/, "");
      list = list.filter((s) => s.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  }, [forest.mySeeds, search, filterPillar, filterDirection, filterTag]);

  const list = tab === "discover" ? sortedDiscover : filteredMine;

  // Top tags across the discover pool — surfaced as one-tap chips
  const topDiscoverTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of forest.discoverSeeds) {
      for (const t of s.tags || []) {
        const k = t.trim().toLowerCase();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t, n]) => ({ tag: t, count: n }));
  }, [forest.discoverSeeds]);

  // Stats for My Forest
  const myStats = useMemo(() => {
    const totalWaters = forest.mySeeds.reduce((s, x) => s + (x.water_count || 0), 0);
    const totalSaves = forest.mySeeds.reduce((s, x) => s + (x.save_count || 0), 0);
    const totalViews = forest.mySeeds.reduce((s, x) => s + (x.view_count || 0), 0);
    const top = forest.mySeeds.slice().sort((a, b) => b.water_count - a.water_count)[0];
    return { count: forest.mySeeds.length, totalWaters, totalSaves, totalViews, top };
  }, [forest.mySeeds]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { id: "daily" as SubTab, label: "🍃 Daily", count: null },
          { id: "discover" as SubTab, label: "🔭 Discover", count: forest.discoverSeeds.length },
          { id: "collections" as SubTab, label: "📚 Collections", count: null },
          { id: "mine" as SubTab, label: "🌱 My seeds", count: forest.mySeeds.length },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.id ? "gradient-purple text-primary-foreground glow-sm" : "glass-card text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
            {t.count !== null && <span className="opacity-70 ml-1">({t.count})</span>}
          </button>
        ))}
        <div className="ml-auto">
          <ForestInboxBell />
        </div>
      </div>

      {/* Daily curated grove */}
      {tab === "daily" && (
        <ForestDailyStack onOpenDiscover={() => setTab("discover")} />
      )}

      {/* Collections */}
      {tab === "collections" && <ForestCollectionsView />}

      {/* My Forest dashboard (only on My Seeds tab, only if user has any seeds) */}
      {tab === "mine" && myStats.count > 0 && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Trophy className="w-4 h-4 text-primary" /> My Forest
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { Icon: Sprout, label: "Seeds", value: myStats.count, color: "text-emerald-400" },
              { Icon: Droplet, label: "Waters", value: myStats.totalWaters, color: "text-cyan-400" },
              { Icon: BookmarkPlus, label: "Saves", value: myStats.totalSaves, color: "text-primary" },
              { Icon: Eye, label: "Views", value: myStats.totalViews, color: "text-muted-foreground" },
            ].map(({ Icon, label, value, color }) => (
              <div key={label} className="rounded-xl bg-muted/30 p-2 text-center">
                <Icon className={`w-4 h-4 mx-auto mb-0.5 ${color}`} />
                <p className="text-base font-bold text-foreground">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {myStats.top && myStats.top.water_count > 0 && (
            <div className="rounded-xl bg-primary/10 border border-primary/20 p-2.5 flex items-center gap-2">
              <span className="text-base">🌟</span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Most appreciated</p>
                <p className="text-xs font-bold text-foreground truncate">{myStats.top.title || "Untitled"}</p>
              </div>
              <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                <Droplet className="w-3 h-3" /> {myStats.top.water_count}
              </span>
            </div>
          )}
          {/* Achievements row */}
          <div className="flex flex-wrap gap-1.5">
            {forest.achievements.map((a) => (
              <span key={a.id} title={`${a.description} (${a.current}/${a.target})`}
                className={`text-[11px] px-2 py-1 rounded-full font-semibold flex items-center gap-1 ${
                  a.unlocked ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground opacity-60"
                }`}>
                <span className={a.unlocked ? "" : "grayscale"}>{a.icon}</span> {a.title}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Blocked authors panel — visible on My Seeds tab when there are any */}
      {tab === "mine" && <BlockedAuthorsList />}

      {/* Filters */}
      {(tab === "discover" || tab === "mine") && (
      <div className="glass-card p-3 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={smartSearch ? "🧠 Search the Forest by meaning..." : "🔍 Search seeds..."}
              className="bg-background/50 border-white/10" />
            {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground animate-pulse">…</span>}
          </div>
          {tab === "discover" && (
            <button
              onClick={() => { setSmartSearch(!smartSearch); setSemanticResults(null); }}
              className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all whitespace-nowrap ${
                smartSearch ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              🧠 Smart {smartSearch ? "ON" : "OFF"}
            </button>
          )}
        </div>

        {tab === "discover" && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {([
              { id: "trending" as DiscoverSort, label: "🔥 Trending" },
              { id: "newest" as DiscoverSort, label: "🆕 Newest" },
              { id: "watered" as DiscoverSort, label: "💧 Most watered" },
              { id: "saved" as DiscoverSort, label: "📥 Most saved" },
              { id: "friends" as DiscoverSort, label: "🤝 From friends" },
            ]).map((s) => (
              <button key={s.id} onClick={() => setSort(s.id)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                  sort === s.id ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}>
                {s.label}
              </button>
            ))}
            <span className="w-px h-4 bg-white/10 mx-0.5" />
            <button onClick={() => setHideSaved(!hideSaved)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                hideSaved ? "gradient-purple text-primary-foreground glow-sm" : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}>
              {hideSaved ? "🙈 Hiding saved" : "👁 All seeds"}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 items-center">
          <button onClick={() => setFilterPillar(null)}
            className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
              !filterPillar ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground"
            }`}>All pillars</button>
          {pillars.map((p) => (
            <button key={p.id} onClick={() => setFilterPillar(filterPillar === p.id ? null : p.id)}
              className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1"
              style={{ backgroundColor: filterPillar === p.id ? p.color : p.color + "18", color: filterPillar === p.id ? "#fff" : p.color }}>
              <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={12} className="inline-block" /> {p.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          {DIRECTIONS.map((d) => (
            <button key={d.id} onClick={() => setFilterDirection(filterDirection === d.id ? null : d.id)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                filterDirection === d.id ? "gradient-purple text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:text-foreground"
              }`}>
              {d.icon} {d.label}
            </button>
          ))}
          <span className="w-px h-4 bg-white/10" />
          <Input value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
            placeholder="#tag…"
            className="bg-background/50 border-white/10 h-7 text-[11px] w-24" />
          {(filterPillar || filterDirection || filterTag || hideSaved) && (
            <button onClick={() => { setFilterPillar(null); setFilterDirection(null); setFilterTag(""); setHideSaved(false); }}
              className="text-[11px] text-muted-foreground hover:text-foreground underline">
              Clear filters
            </button>
          )}
        </div>

        {tab === "discover" && topDiscoverTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              Trending tags
            </span>
            {topDiscoverTags.map(({ tag, count }) => {
              const active = filterTag.trim().toLowerCase().replace(/^#/, "") === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setFilterTag(active ? "" : `#${tag}`)}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-semibold transition-all ${
                    active
                      ? "gradient-purple text-primary-foreground glow-sm"
                      : "bg-muted/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  #{tag} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* List */}
      {(tab === "discover" || tab === "mine") && (
        forest.loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-2xl animate-pulse">🌳</span>
          <p className="mt-2">Growing the Forest...</p>
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">🌱</span>
          <p className="text-sm">
            {tab === "discover"
              ? smartSearch && search.trim()
                ? "No seeds match that meaning. Try different words."
                : "Nothing here yet. Add friends or be the first to plant a seed!"
              : "You haven't planted anything yet. Open any block in your Library and tap 🌱 Plant."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((seed) => (
            <div key={seed.id} id={`forest-seed-${seed.id}`} className="rounded-2xl">
              <ForestSeedCard seed={seed} isMine={tab === "mine"} onEdit={setEditSeed} />
            </div>
          ))}
        </div>
      ))}

      <EditSeedModal open={editSeed !== null} seed={editSeed} onClose={() => setEditSeed(null)} />
    </motion.div>
  );
};

export default ArchiveForestView;
