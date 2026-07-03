import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Droplet, BookmarkPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Activity = {
  id: string;
  kind: "water" | "save";
  created_at: string;
  seed_id: string;
  seed_title: string;
  actor: { user_id: string; username: string; display_name: string; avatar_emoji: string } | null;
};

const RecentAppreciationStrip = ({ mySeedIds }: { mySeedIds: string[] }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || mySeedIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [{ data: waters }, { data: saves }, { data: seeds }] = await Promise.all([
        supabase.from("forest_waters" as any).select("id, seed_id, user_id, created_at")
          .in("seed_id", mySeedIds).neq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(15),
        supabase.from("forest_saves" as any).select("id, seed_id, user_id, created_at")
          .in("seed_id", mySeedIds).neq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(15),
        supabase.from("forest_seeds" as any).select("id, title").in("id", mySeedIds),
      ]);

      const seedTitle: Record<string, string> = {};
      ((seeds as any) || []).forEach((s: any) => { seedTitle[s.id] = s.title || "Untitled"; });

      const actorIds = Array.from(new Set([
        ...((waters as any) || []).map((w: any) => w.user_id),
        ...((saves as any) || []).map((s: any) => s.user_id),
      ]));
      let actorMap: Record<string, Activity["actor"]> = {};
      if (actorIds.length) {
        const { data: profs } = await supabase.from("user_profiles" as any)
          .select("user_id, username, display_name, avatar_emoji")
          .in("user_id", actorIds);
        ((profs as any) || []).forEach((p: any) => { actorMap[p.user_id] = p; });
      }

      const merged: Activity[] = [
        ...((waters as any) || []).map((w: any) => ({
          id: `w-${w.id}`, kind: "water" as const, created_at: w.created_at, seed_id: w.seed_id,
          seed_title: seedTitle[w.seed_id] || "Untitled", actor: actorMap[w.user_id] || null,
        })),
        ...((saves as any) || []).map((s: any) => ({
          id: `s-${s.id}`, kind: "save" as const, created_at: s.created_at, seed_id: s.seed_id,
          seed_title: seedTitle[s.seed_id] || "Untitled", actor: actorMap[s.user_id] || null,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12);

      if (!cancelled) { setItems(merged); setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [user, mySeedIds.join(",")]);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs">💖</span>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
          Recent appreciation
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const focus = () =>
            window.dispatchEvent(new CustomEvent("lov:forest-focus-seed", { detail: { seedId: it.seed_id } }));
          return (
            <button key={it.id} onClick={focus}
              title={`${it.actor?.display_name || "@" + (it.actor?.username || "someone")} ${it.kind === "water" ? "watered" : "saved"} "${it.seed_title}"`}
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
              <span className="text-base">{it.actor?.avatar_emoji || "🦊"}</span>
              {it.kind === "water"
                ? <Droplet className="w-3 h-3 text-cyan-400" />
                : <BookmarkPlus className="w-3 h-3 text-emerald-400" />}
              <span className="text-[10px] text-foreground font-semibold max-w-[120px] truncate">
                {it.seed_title}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};

export default RecentAppreciationStrip;
