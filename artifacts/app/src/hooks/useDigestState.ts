import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ArchiveBlock } from "@/lib/archive-data";

interface BlockReview {
  id: string;
  block_id: string;
  rating: number;
  reviewed_at: string;
}

// Interval multipliers based on rating
const RATING_INTERVALS: Record<number, number> = {
  1: 1,   // forgot → 1 day
  2: 3,   // vague → 3 days
  3: 0,   // got it → double previous interval (handled in logic)
};

const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 60, 90];
const DAY_MS = 86400000;

function getNextReviewDate(reviews: BlockReview[]): Date | null {
  if (reviews.length === 0) return null;
  const sorted = [...reviews].sort(
    (a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime()
  );
  const last = sorted[0];
  const lastDate = new Date(last.reviewed_at);
  
  let intervalDays: number;
  if (last.rating === 3) {
    // Double the gap since previous review (min 7d, max 90d)
    if (sorted.length >= 2) {
      const prevDate = new Date(sorted[1].reviewed_at);
      const gap = (lastDate.getTime() - prevDate.getTime()) / DAY_MS;
      intervalDays = Math.min(90, Math.max(7, Math.round(gap * 2)));
    } else {
      intervalDays = 7;
    }
  } else {
    intervalDays = RATING_INTERVALS[last.rating] || 3;
  }
  
  return new Date(lastDate.getTime() + intervalDays * DAY_MS);
}

function isDueToday(nextReview: Date): boolean {
  return nextReview.getTime() <= Date.now() + DAY_MS * 0.5; // due if within half a day
}

export interface DigestBlock extends ArchiveBlock {
  reviewCount: number;
  lastRating: number | null;
  intervalLabel: string;
}

export function useDigestState(blocks: ArchiveBlock[]) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<BlockReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionRatings, setSessionRatings] = useState<Record<string, number>>({});

  // Fetch all reviews
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("block_reviews" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("reviewed_at", { ascending: false });
      if (!error) setReviews((data as any) || []);
      setLoading(false);
    })();
  }, [user]);

  // Compute due blocks
  const dueBlocks = useMemo((): DigestBlock[] => {
    const now = Date.now();
    const result: DigestBlock[] = [];

    for (const block of blocks) {
      const blockReviews = reviews.filter((r) => r.block_id === block.id);
      // Skip blocks already rated this session
      if (sessionRatings[block.id]) continue;

      let isDue = false;
      let reviewCount = blockReviews.length;
      let lastRating: number | null = null;
      let intervalLabel = "";

      if (blockReviews.length === 0) {
        // Never reviewed: use creation-date intervals
        const ageDays = (now - new Date(block.created_at).getTime()) / DAY_MS;
        const matchedInterval = DEFAULT_INTERVALS.find(
          (d) => Math.abs(ageDays - d) <= 1.5
        );
        if (matchedInterval) {
          isDue = true;
          intervalLabel = `New · ${matchedInterval}d ago`;
        }
      } else {
        const sorted = [...blockReviews].sort(
          (a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime()
        );
        lastRating = sorted[0].rating;
        const nextReview = getNextReviewDate(blockReviews);
        if (nextReview && isDueToday(nextReview)) {
          isDue = true;
          const daysSinceLast = Math.round(
            (now - new Date(sorted[0].reviewed_at).getTime()) / DAY_MS
          );
          intervalLabel = `Review #${reviewCount + 1} · ${daysSinceLast}d since last`;
        }
      }

      if (isDue) {
        result.push({ ...block, reviewCount, lastRating, intervalLabel });
      }
    }

    // Shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }, [blocks, reviews, sessionRatings]);

  const saveRating = useCallback(async (blockId: string, rating: number) => {
    if (!user) return;
    setSessionRatings((prev) => ({ ...prev, [blockId]: rating }));
    const { data, error } = await supabase
      .from("block_reviews" as any)
      .insert({ user_id: user.id, block_id: blockId, rating } as any)
      .select()
      .single();
    if (!error && data) {
      setReviews((prev) => [(data as any), ...prev]);
    }
  }, [user]);

  const sessionStats = useMemo(() => {
    const ratings = Object.values(sessionRatings);
    return {
      total: ratings.length,
      remembered: ratings.filter((r) => r === 3).length,
      vague: ratings.filter((r) => r === 2).length,
      forgot: ratings.filter((r) => r === 1).length,
    };
  }, [sessionRatings]);

  const resetSession = useCallback(() => setSessionRatings({}), []);

  return { dueBlocks, loading, saveRating, sessionStats, resetSession, totalDueCount: dueBlocks.length + Object.keys(sessionRatings).length };
}
