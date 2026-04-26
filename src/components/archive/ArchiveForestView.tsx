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
import RecentAppreciationStrip from "./RecentAppreciationStrip";
import { Sprout, Droplet, BookmarkPlus, Eye, Trophy, Leaf } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

  // Friend-saved counts per seed (social proof on Discover)
  const [friendsSavedCounts, setFriendsSavedCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const seedIds = forest.discoverSeeds.map((s) => s.id);
    const friendIdsArr = Array.from(friendIds);
    if (seedIds.length === 0 || friendIdsArr.length === 0) {
      setFriendsSavedCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("forest_saves" as any)
        .select("seed_id, user_id")
        .in("seed_id", seedIds)
        .in("user_id", friendIdsArr);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      ((data as any) || []).forEach((row: any) => {
        counts[row.seed_id] = (counts[row.seed_id] || 0) + 1;
      });
      setFriendsSavedCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [forest.discoverSeeds, friendIds]);

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

  // Per-pillar heat (sum of waters on seeds <48h old, per pillar) — surfaces what's hot today
  const pillarHeat = useMemo(() => {
    const cutoff = Date.now() - 48 * 3_600_000;
    const heat = new Map<string, number>();
    for (const s of forest.discoverSeeds) {
      if (new Date(s.published_at).getTime() < cutoff) continue;
      const w = s.water_count || 0;
      if (w === 0) continue;
      for (const pid of s.pillars) {
        heat.set(pid, (heat.get(pid) || 0) + w);
      }
    }
    const max = Math.max(1, ...Array.from(heat.values()));
    return pillars
      .map((p) => ({ ...p, heat: heat.get(p.id) || 0, intensity: (heat.get(p.id) || 0) / max }))
      .filter((p) => p.heat > 0)
      .sort((a, b) => b.heat - a.heat);
  }, [forest.discoverSeeds, pillars]);

  // Stats for My Forest
  const myStats = useMemo(() => {
    const totalWaters = forest.mySeeds.reduce((s, x) => s + (x.water_count || 0), 0);
    const totalSaves = forest.mySeeds.reduce((s, x) => s + (x.save_count || 0), 0);
    const totalViews = forest.mySeeds.reduce((s, x) => s + (x.view_count || 0), 0);
    const top = forest.mySeeds.slice().sort((a, b) => b.water_count - a.water_count)[0];
    return { count: forest.mySeeds.length, totalWaters, totalSaves, totalViews, top };
  }, [forest.mySeeds]);

  // Daily grove count (mirrors the logic in ForestDailyStack header)
  const dailyCount = useMemo(() => {
    const friendIdsSet = friendIds;
    const pool = forest.discoverSeeds.filter((s) => !s.iSaved);
    const fromFriends = pool.filter((s) => friendIdsSet.has(s.author_id)).length;
    return Math.min(5, Math.max(0, fromFriends >= 3 ? 5 : Math.min(5, pool.length)));
  }, [forest.discoverSeeds, friendIds]);

  const tabTagline: Record<SubTab, string> = {
    daily: "Today's curated grove",
    discover: "What's growing right now",
    collections: "Curated bundles of seeds",
    mine: "Seeds you've planted",
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 forest-backdrop">
      {/* ── Living grove hero band ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card relative overflow-hidden px-5 py-4 flex items-center gap-4"
      >
        {/* Soft radial accent behind sprout */}
        <div
          className="absolute -left-10 -top-10 w-40 h-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(150 60% 45% / 0.25), transparent 70%)", filter: "blur(20px)" }}
        />
        {/* Drifting light */}
        <motion.div
          aria-hidden
          className="absolute right-10 top-2 w-24 h-24 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, hsl(180 70% 55% / 0.18), transparent 70%)", filter: "blur(18px)" }}
          animate={{ y: [0, 8, 0], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Animated sprout */}
        <motion.div
          className="relative shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(150 50% 25% / 0.4), hsl(180 60% 25% / 0.3))" }}
          animate={{ rotate: [-3, 3, -3] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Leaf className="w-6 h-6 text-emerald-300" style={{ filter: "drop-shadow(0 0 6px hsl(150 70% 55% / 0.6))" }} />
        </motion.div>

        {/* Title + tagline */}
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-bold tracking-[0.18em] uppercase text-foreground/90 leading-none">
            🌳 The Forest
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{tabTagline[tab]}</p>
        </div>

        {/* Vital signs */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          {[
            { Icon: Sprout, value: forest.mySeeds.length, label: "Planted", color: "text-emerald-400" },
            { Icon: Droplet, value: myStats.totalWaters, label: "Waters", color: "text-cyan-400" },
            { Icon: Eye, value: dailyCount, label: "Today", color: "text-primary" },
          ].map(({ Icon, value, label, color }) => (
            <div key={label} className="px-2.5 py-1.5 rounded-xl bg-background/30 border border-white/5 text-center min-w-[58px]">
              <div className="flex items-center justify-center gap-1">
                <Icon className={`w-3 h-3 ${color}`} />
                <span className="text-sm font-bold font-mono text-foreground">{value}</span>
              </div>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="shrink-0">
          <ForestInboxBell />
        </div>
      </motion.div>

      {/* ── Segmented sub-tabs ── */}
      <div className="glass-card p-1 inline-flex items-center gap-0.5 flex-wrap relative">
        {([
          { id: "daily" as SubTab, label: "🍃 Daily", count: null as number | null },
          { id: "discover" as SubTab, label: "🔭 Discover", count: forest.discoverSeeds.length },
          { id: "collections" as SubTab, label: "📚 Collections", count: null },
          { id: "mine" as SubTab, label: "🌱 My seeds", count: forest.mySeeds.length },
        ]).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3.5 py-2 rounded-xl text-sm font-bold transition-colors ${
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="forest-tab-pill"
                  className="absolute inset-0 rounded-xl gradient-purple glow-sm"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative">
                {t.label}
                {t.count !== null && (
                  <span className={`ml-1.5 text-[10px] font-mono ${active ? "opacity-80" : "opacity-60"}`}>
                    {t.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
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

      {/* Recent appreciation activity */}
      {tab === "mine" && myStats.count > 0 && (
        <RecentAppreciationStrip mySeedIds={forest.mySeeds.map((s) => s.id)} />
      )}

      {/* Filters */}
      {(tab === "discover" || tab === "mine") && (
      <div className="glass-card p-3 space-y-2">
        {tab === "discover" && pillarHeat.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center -mx-1 px-1 pb-1 border-b border-white/5 mb-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1 flex items-center gap-1">
              🔥 Hot pillars · 48h
            </span>
            {pillarHeat.slice(0, 8).map((p) => {
              const active = filterPillar === p.id;
              const opacity = 0.25 + p.intensity * 0.65;
              return (
                <button
                  key={p.id}
                  onClick={() => setFilterPillar(active ? null : p.id)}
                  title={`${p.heat} waters in last 48h`}
                  className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1 transition-all"
                  style={{
                    backgroundColor: active ? p.color : p.color + Math.round(opacity * 255).toString(16).padStart(2, "0"),
                    color: active || p.intensity > 0.55 ? "#fff" : p.color,
                  }}
                >
                  <PillarIcon icon={p.icon} iconUrl={p.iconUrl} size={12} className="inline-block" />
                  {p.name}
                  <span className="opacity-80 text-[10px]">{p.heat}</span>
                </button>
              );
            })}
          </div>
        )}
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
        <div className="text-center py-14 text-muted-foreground space-y-3">
          <motion.div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "radial-gradient(circle, hsl(150 60% 45% / 0.25), transparent 70%)" }}
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sprout className="w-7 h-7 text-emerald-400" />
          </motion.div>
          <p className="text-sm max-w-xs mx-auto">
            {tab === "discover"
              ? smartSearch && search.trim()
                ? "No seeds match that meaning. Try different words."
                : "Nothing here yet. Add friends or be the first to plant a seed."
              : "You haven't planted anything yet. Open any block in your Library and tap 🌱 Plant."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((seed) => (
            <div key={seed.id} id={`forest-seed-${seed.id}`} className="rounded-2xl">
              <ForestSeedCard seed={seed} isMine={tab === "mine"} onEdit={setEditSeed}
                friendsSavedCount={tab === "discover" ? (friendsSavedCounts[seed.id] || 0) : 0} />
            </div>
          ))}
        </div>
      ))}

      <EditSeedModal open={editSeed !== null} seed={editSeed} onClose={() => setEditSeed(null)} />
    </motion.div>
  );
};

export default ArchiveForestView;
