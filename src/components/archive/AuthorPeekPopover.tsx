import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { Droplet, BookmarkPlus, Sprout, ShieldOff } from "lucide-react";
import { useForestState, type ForestAuthor } from "@/hooks/useForestState";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  author?: ForestAuthor;
  authorId: string;
  children: React.ReactNode;
}

interface AuthorStats {
  seeds: number;
  watersReceived: number;
  savesReceived: number;
}

const AuthorPeekPopover = ({ author, authorId, children }: Props) => {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<AuthorStats | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const f = useForestState();
  const isSelf = user?.id === authorId;

  useEffect(() => {
    if (!open || stats !== null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Aggregate from seeds visible to me (RLS-scoped)
      const { data } = await supabase
        .from("forest_seeds" as any)
        .select("water_count, save_count")
        .eq("author_id", authorId)
        .eq("is_active", true);
      if (cancelled) return;
      const rows = ((data as any) || []) as { water_count: number; save_count: number }[];
      setStats({
        seeds: rows.length,
        watersReceived: rows.reduce((s, r) => s + (r.water_count || 0), 0),
        savesReceived: rows.reduce((s, r) => s + (r.save_count || 0), 0),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, stats, authorId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="glass-card border-white/10 w-64 p-3" align="start">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{author?.avatar_emoji || "🦊"}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">
              {author?.display_name || `@${author?.username || "unknown"}`}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">@{author?.username || "unknown"}</p>
          </div>
        </div>
        {loading ? (
          <p className="text-[11px] text-muted-foreground animate-pulse">Loading…</p>
        ) : stats ? (
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-muted/30 py-1.5">
              <Sprout className="w-3.5 h-3.5 mx-auto text-emerald-400 mb-0.5" />
              <p className="text-sm font-bold text-foreground">{stats.seeds}</p>
              <p className="text-[9px] text-muted-foreground">seeds</p>
            </div>
            <div className="rounded-lg bg-muted/30 py-1.5">
              <Droplet className="w-3.5 h-3.5 mx-auto text-cyan-400 mb-0.5" />
              <p className="text-sm font-bold text-foreground">{stats.watersReceived}</p>
              <p className="text-[9px] text-muted-foreground">waters</p>
            </div>
            <div className="rounded-lg bg-muted/30 py-1.5">
              <BookmarkPlus className="w-3.5 h-3.5 mx-auto text-primary mb-0.5" />
              <p className="text-sm font-bold text-foreground">{stats.savesReceived}</p>
              <p className="text-[9px] text-muted-foreground">saved</p>
            </div>
          </div>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground/80 leading-snug">
          Stats are based on seeds shared with you.
        </p>
        {!isSelf && (
          <button
            onClick={async () => {
              if (!confirm(`Block @${author?.username || "this author"}? Their seeds will be hidden everywhere.`)) return;
              await f.blockAuthor(authorId);
              setOpen(false);
            }}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-destructive/10 text-destructive font-bold hover:bg-destructive/20 transition-all"
          >
            <ShieldOff className="w-3 h-3" /> Block author
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default AuthorPeekPopover;