import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Local block-list of authors. Used to client-side filter the Forest Discover feed.
 * (We deliberately don't enforce in RLS so author can still see their own seeds.)
 */
export function useForestBlocks() {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (!user) {
      setBlocked(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("forest_blocks" as any)
      .select("blocked_id")
      .eq("blocker_id", user.id);
    setBlocked(new Set(((data as any) || []).map((r: any) => r.blocked_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const blockAuthor = useCallback(async (authorId: string) => {
    if (!user) return;
    if (authorId === user.id) {
      toast.error("You can't block yourself");
      return;
    }
    const { error } = await supabase
      .from("forest_blocks" as any)
      .insert({ blocker_id: user.id, blocked_id: authorId } as any);
    if (error && !String(error.message).includes("duplicate")) {
      toast.error("Failed to block");
      return;
    }
    setBlocked((prev) => new Set(prev).add(authorId));
    toast.success("🚫 Author blocked. Their seeds are hidden from your Forest.");
  }, [user]);

  const unblockAuthor = useCallback(async (authorId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("forest_blocks" as any)
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", authorId);
    if (error) {
      toast.error("Failed to unblock");
      return;
    }
    setBlocked((prev) => {
      const next = new Set(prev);
      next.delete(authorId);
      return next;
    });
    toast.success("Author unblocked");
  }, [user]);

  return { blocked, loading, blockAuthor, unblockAuthor, refetch: fetchBlocks };
}