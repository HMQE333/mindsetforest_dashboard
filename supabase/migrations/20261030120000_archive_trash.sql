-- Archive trash: a deleted note leaves archive_blocks (so search, AI and
-- every reader skip it without a filter) and waits here for 7 days with what
-- hung off it: its Digest reviews, tag feedback and the bookmarks that pointed
-- at it. Restore puts all of it back under the same id. Each user's old
-- entries are purged when their Archive loads (purge_archive_trash).
CREATE TABLE IF NOT EXISTS public.archive_trash (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block jsonb NOT NULL,
  reviews jsonb NOT NULL DEFAULT '[]',
  feedback jsonb NOT NULL DEFAULT '[]',
  bookmark_ids uuid[] NOT NULL DEFAULT '{}',
  deleted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS archive_trash_user_deleted ON public.archive_trash (user_id, deleted_at DESC);
ALTER TABLE public.archive_trash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own trash readable" ON public.archive_trash;
CREATE POLICY "own trash readable" ON public.archive_trash FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Writes only through the functions below.

CREATE OR REPLACE FUNCTION public.trash_archive_blocks(ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO archive_trash (id, user_id, block, reviews, feedback, bookmark_ids)
  SELECT b.id, b.user_id, to_jsonb(b),
    COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM block_reviews r WHERE r.block_id = b.id), '[]'),
    COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM archive_tag_feedback f WHERE f.block_id = b.id), '[]'),
    COALESCE((SELECT array_agg(k.id) FROM bookmarks k WHERE k.block_id = b.id), '{}')
  FROM archive_blocks b
  WHERE b.id = ANY(ids) AND b.user_id = auth.uid()
  ON CONFLICT (id) DO NOTHING;
  DELETE FROM archive_blocks WHERE id = ANY(ids) AND user_id = auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.restore_archive_blocks(ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO archive_blocks
  SELECT (jsonb_populate_record(NULL::archive_blocks, t.block)).*
  FROM archive_trash t
  WHERE t.id = ANY(ids) AND t.user_id = auth.uid()
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO block_reviews
  SELECT (jsonb_populate_record(NULL::block_reviews, r)).*
  FROM archive_trash t, jsonb_array_elements(t.reviews) r
  WHERE t.id = ANY(ids) AND t.user_id = auth.uid()
  ON CONFLICT DO NOTHING;
  INSERT INTO archive_tag_feedback
  SELECT (jsonb_populate_record(NULL::archive_tag_feedback, f)).*
  FROM archive_trash t, jsonb_array_elements(t.feedback) f
  WHERE t.id = ANY(ids) AND t.user_id = auth.uid()
  ON CONFLICT DO NOTHING;
  UPDATE bookmarks k SET block_id = t.id
  FROM archive_trash t
  WHERE t.id = ANY(ids) AND t.user_id = auth.uid() AND k.id = ANY(t.bookmark_ids) AND k.block_id IS NULL;
  DELETE FROM archive_trash WHERE id = ANY(ids) AND user_id = auth.uid();
  RETURN n;
END $$;

-- Gone for good: chosen notes, or (ids null) everything older than 7 days.
CREATE OR REPLACE FUNCTION public.purge_archive_trash(ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM archive_trash
  WHERE user_id = auth.uid()
    AND (CASE WHEN ids IS NULL THEN deleted_at < now() - interval '7 days' ELSE id = ANY(ids) END);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.trash_archive_blocks(uuid[]), public.restore_archive_blocks(uuid[]), public.purge_archive_trash(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trash_archive_blocks(uuid[]), public.restore_archive_blocks(uuid[]), public.purge_archive_trash(uuid[]) TO authenticated;
