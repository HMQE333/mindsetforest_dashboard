import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useForestState } from "@/hooks/useForestState";
import { Ban, RotateCcw } from "lucide-react";

interface AuthorRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
}

/**
 * Lists currently-blocked authors with an unblock action.
 * Surfaced inside the My Forest dashboard when the user has blocked anyone.
 */
const BlockedAuthorsList = () => {
  const f = useForestState();
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = Array.from(f.blockedAuthors);
    if (ids.length === 0) {
      setAuthors([]);
      return;
    }
    setLoading(true);
    supabase
      .from("user_profiles" as any)
      .select("user_id, username, display_name, avatar_emoji")
      .in("user_id", ids)
      .then(({ data }) => {
        setAuthors(((data as any) || []) as AuthorRow[]);
        setLoading(false);
      });
  }, [f.blockedAuthors]);

  if (f.blockedAuthors.size === 0) return null;

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
        <Ban className="w-3.5 h-3.5 text-destructive" />
        Blocked authors <span className="text-muted-foreground font-normal">({f.blockedAuthors.size})</span>
      </div>
      {loading ? (
        <p className="text-[11px] text-muted-foreground animate-pulse">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {authors.map((a) => (
            <div key={a.user_id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/40 text-[11px] text-foreground">
              <span className="text-base leading-none">{a.avatar_emoji || "🦊"}</span>
              <span className="font-semibold truncate max-w-[120px]">
                {a.display_name || `@${a.username}`}
              </span>
              <button onClick={() => f.unblockAuthor(a.user_id)} title="Unblock"
                className="p-0.5 rounded hover:bg-emerald-500/20 text-muted-foreground hover:text-emerald-400">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        Their seeds are hidden from your Discover feed and Daily grove.
      </p>
    </div>
  );
};

export default BlockedAuthorsList;