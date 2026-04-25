import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useForestState, type SeedWithAuthor } from "@/hooks/useForestState";
import { usePillars } from "@/hooks/usePillars";
import { Input } from "@/components/ui/input";
import PillarIcon from "@/components/shared/PillarIcon";
import ForestSeedCard from "./ForestSeedCard";
import EditSeedModal from "./EditSeedModal";

type DiscoverSort = "trending" | "newest" | "watered" | "saved";
type SubTab = "discover" | "mine";

const ArchiveForestView = () => {
  const forest = useForestState();
  const pillars = usePillars();
  const [tab, setTab] = useState<SubTab>("discover");
  const [sort, setSort] = useState<DiscoverSort>("trending");
  const [search, setSearch] = useState("");
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [editSeed, setEditSeed] = useState<SeedWithAuthor | null>(null);

  const trending = (s: SeedWithAuthor) => {
    const ageH = (Date.now() - new Date(s.published_at).getTime()) / 3_600_000;
    return s.water_count / Math.pow(ageH + 2, 1.5);
  };

  const sortedDiscover = useMemo(() => {
    let list = forest.discoverSeeds;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
    }
    if (filterPillar) list = list.filter((s) => s.pillars.includes(filterPillar));
    return [...list].sort((a, b) => {
      if (sort === "trending") return trending(b) - trending(a);
      if (sort === "newest") return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
      if (sort === "watered") return b.water_count - a.water_count;
      return b.save_count - a.save_count;
    });
  }, [forest.discoverSeeds, sort, search, filterPillar]);

  const filteredMine = useMemo(() => {
    let list = forest.mySeeds;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q));
    }
    if (filterPillar) list = list.filter((s) => s.pillars.includes(filterPillar));
    return [...list].sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
  }, [forest.mySeeds, search, filterPillar]);

  const list = tab === "discover" ? sortedDiscover : filteredMine;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2">
        {([
          { id: "discover" as SubTab, label: "🔭 Discover", count: forest.discoverSeeds.length },
          { id: "mine" as SubTab, label: "🌱 My seeds", count: forest.mySeeds.length },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.id ? "gradient-purple text-primary-foreground glow-sm" : "glass-card text-muted-foreground hover:text-foreground"
            }`}>
            {t.label} <span className="opacity-70 ml-1">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-card p-3 space-y-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search seeds..." className="bg-background/50 border-white/10" />
        {tab === "discover" && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {([
              { id: "trending" as DiscoverSort, label: "🔥 Trending" },
              { id: "newest" as DiscoverSort, label: "🆕 Newest" },
              { id: "watered" as DiscoverSort, label: "💧 Most watered" },
              { id: "saved" as DiscoverSort, label: "📥 Most saved" },
            ]).map((s) => (
              <button key={s.id} onClick={() => setSort(s.id)}
                className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all ${
                  sort === s.id ? "gradient-purple text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}>
                {s.label}
              </button>
            ))}
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
      </div>

      {/* List */}
      {forest.loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-2xl animate-pulse">🌳</span>
          <p className="mt-2">Growing the Forest...</p>
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <span className="text-3xl mb-2 block">🌱</span>
          <p className="text-sm">
            {tab === "discover"
              ? "Nothing here yet. Add friends or be the first to plant a seed!"
              : "You haven't planted anything yet. Open any block in your Library and tap 🌱 Plant."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((seed) => (
            <ForestSeedCard key={seed.id} seed={seed} isMine={tab === "mine"} onEdit={setEditSeed} />
          ))}
        </div>
      )}

      <EditSeedModal open={editSeed !== null} seed={editSeed} onClose={() => setEditSeed(null)} />
    </motion.div>
  );
};

export default ArchiveForestView;