
-- Add embedding column
ALTER TABLE public.archive_blocks ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create similarity search function
CREATE OR REPLACE FUNCTION public.search_archive_blocks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  pillars text[],
  directions text[],
  tags text[],
  source_url text,
  is_pinned boolean,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ab.id,
    ab.title,
    ab.content,
    ab.pillars,
    ab.directions,
    ab.tags,
    ab.source_url,
    ab.is_pinned,
    ab.created_at,
    ab.updated_at,
    (1 - (ab.embedding <=> query_embedding))::float AS similarity
  FROM public.archive_blocks ab
  WHERE ab.user_id = match_user_id
    AND ab.embedding IS NOT NULL
    AND (1 - (ab.embedding <=> query_embedding))::float > match_threshold
  ORDER BY ab.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
