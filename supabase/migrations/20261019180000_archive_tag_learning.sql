-- Archive: tag suggestions that learn from what he accepts and turns down.
--
-- ai-suggest-tags (mode "learn") scores a note's tags from his most similar tagged notes, then
-- moves those scores by his past answers on the same notes: a tag he turned down on a similar
-- note counts against it, one he accepted counts for it. This table holds those answers; the
-- function below finds the similar notes.
--
-- archive_tag_feedback: one row per answer, written by the app with his own token
-- (hooks/useTagSuggestions.ts): accepted chips, the chips he left out when he accepted the rest,
-- and the ones he turned down one by one. Dismissing the strip writes nothing. `source` says
-- where the chip came from ('manual' for a tag he typed himself). Rows go with the note.
-- Nothing here touches existing data.

CREATE TABLE IF NOT EXISTS public.archive_tag_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.archive_blocks(id) ON DELETE CASCADE,
  tag text NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 64),
  accepted boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('neighbours', 'ai', 'type-rule', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_tag_feedback_user_block
  ON public.archive_tag_feedback (user_id, block_id);

ALTER TABLE public.archive_tag_feedback ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.archive_tag_feedback TO authenticated;
GRANT ALL ON public.archive_tag_feedback TO service_role;

DROP POLICY IF EXISTS "Users can view own tag feedback" ON public.archive_tag_feedback;
CREATE POLICY "Users can view own tag feedback"
  ON public.archive_tag_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Only about his own notes: the block must be his as well.
DROP POLICY IF EXISTS "Users can insert own tag feedback" ON public.archive_tag_feedback;
CREATE POLICY "Users can insert own tag feedback"
  ON public.archive_tag_feedback FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.archive_blocks b WHERE b.id = block_id AND b.user_id = auth.uid())
  );

-- The k notes of p_user most similar to p_block (by embedding), excluding p_block, that carry at
-- least one tag with something other than digits in it (a '2' from '#2' text says nothing).
-- Only ids, tags and similarity come back, never text. Empty when p_block is not p_user's or has
-- no embedding yet.
--
-- SECURITY DEFINER and it trusts p_user, so like search_archive_blocks
-- (20260929210000_lock_search_archive_blocks.sql) only the service role may run it: its one
-- caller is ai-suggest-tags, which passes the signed-in user's own id.
CREATE OR REPLACE FUNCTION public.similar_archive_blocks(p_user uuid, p_block uuid, p_k integer DEFAULT 12)
RETURNS TABLE (id uuid, tags text[], similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH src AS (
    SELECT b.embedding
    FROM public.archive_blocks b
    WHERE b.id = p_block
      AND b.user_id = p_user
      AND b.embedding IS NOT NULL
  )
  SELECT ab.id, ab.tags, (1 - (ab.embedding <=> src.embedding))::double precision AS similarity
  FROM public.archive_blocks ab
  CROSS JOIN src
  WHERE ab.user_id = p_user
    AND ab.id <> p_block
    AND ab.embedding IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(ab.tags) AS t(tag) WHERE t.tag !~ '^[0-9_/-]*$')
  ORDER BY ab.embedding <=> src.embedding
  LIMIT LEAST(GREATEST(COALESCE(p_k, 12), 1), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.similar_archive_blocks(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.similar_archive_blocks(uuid, uuid, integer) TO service_role;
