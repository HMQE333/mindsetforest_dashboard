-- Video summaries. One row per user and YouTube video, attached to the link
-- (not stored as an Archive note, which would bury it inside a note of
-- thousands of links where search cannot see it). Written by the
-- ai-video-summary function; see that function for the passes.
--
-- transcript is the speech with [mm:ss] marks (the one pass that watches
-- the video); summary and workshop are made from it or from a separate
-- watch, so a better prompt later never has to pay for the video again.
CREATE TABLE public.link_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  url text NOT NULL,
  title text NOT NULL DEFAULT '',
  channel text NOT NULL DEFAULT '',
  -- 'none' when only a workshop was asked for.
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'transcribing', 'summarizing', 'ready', 'error')),
  error text,
  transcript text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  workshop text NOT NULL DEFAULT '',
  workshop_status text NOT NULL DEFAULT 'none'
    CHECK (workshop_status IN ('none', 'running', 'ready', 'error')),
  workshop_error text,
  -- Questions asked about the video: [{ q, a, at }], newest last.
  qa jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_usd numeric(10, 5) NOT NULL DEFAULT 0,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

CREATE INDEX idx_link_summaries_user ON public.link_summaries (user_id, updated_at DESC);

CREATE TRIGGER update_link_summaries_updated_at
  BEFORE UPDATE ON public.link_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_summaries TO authenticated;
GRANT ALL ON public.link_summaries TO service_role;

ALTER TABLE public.link_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own link summaries"
  ON public.link_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users add their own link summaries"
  ON public.link_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own link summaries"
  ON public.link_summaries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their own link summaries"
  ON public.link_summaries FOR DELETE USING (auth.uid() = user_id);

-- Semantic search over summaries, for ai-embed-block's search. Like
-- search_archive_blocks it filters only by the user id it is given, so only
-- the service role may call it.
CREATE OR REPLACE FUNCTION public.search_link_summaries(
  query_embedding vector,
  match_user_id uuid,
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10
)
RETURNS TABLE (id uuid, video_id text, url text, title text, channel text, similarity double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id, s.video_id, s.url, s.title, s.channel,
         (1 - (s.embedding <=> query_embedding))::float AS similarity
  FROM public.link_summaries s
  WHERE s.user_id = match_user_id
    AND s.embedding IS NOT NULL
    AND (1 - (s.embedding <=> query_embedding))::float > match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.search_link_summaries(vector, uuid, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_link_summaries(vector, uuid, double precision, integer) TO service_role;
