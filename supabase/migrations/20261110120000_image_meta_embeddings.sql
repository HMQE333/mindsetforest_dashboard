-- Each analysed picture gets its own embedding, so meaning search finds the
-- picture itself (not the whole note: a note with 30 photos must not come
-- back whole because one of them matched). The note's own embedding goes back
-- to its own text. Written by ai-image-analyze / ai-embed-block (service role).
ALTER TABLE public.archive_image_meta ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE OR REPLACE FUNCTION public.search_archive_images(
  query_embedding vector,
  match_user_id uuid,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 30
)
RETURNS TABLE (block_id uuid, url text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.block_id, m.url, (1 - (m.embedding <=> query_embedding))::float AS similarity
  FROM public.archive_image_meta m
  WHERE m.user_id = match_user_id
    AND m.embedding IS NOT NULL
    AND (1 - (m.embedding <=> query_embedding))::float > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Like search_archive_blocks: only the edge function (service role, the caller's own id) may run it.
REVOKE ALL ON FUNCTION public.search_archive_images(vector, uuid, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_archive_images(vector, uuid, double precision, integer) TO service_role;
