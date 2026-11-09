-- What is in each picture of an Archive note, read once by ai-image-analyze:
-- its kind, a description, the text in it, objects/tags, and its colour
-- palette (measured from the pixels in the browser). Search matches these
-- words (keyword and, through the note's embedding, meaning) and filters by
-- colour (hues). One row per user and picture URL.
CREATE TABLE IF NOT EXISTS public.archive_image_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id uuid NOT NULL REFERENCES public.archive_blocks(id) ON DELETE CASCADE,
  url text NOT NULL,
  kind text,
  description text,
  text_in_image text,
  objects text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  colors jsonb NOT NULL DEFAULT '[]',
  hues text[] NOT NULL DEFAULT '{}',
  model text,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);
CREATE INDEX IF NOT EXISTS archive_image_meta_block ON public.archive_image_meta (block_id);
CREATE INDEX IF NOT EXISTS archive_image_meta_hues ON public.archive_image_meta USING gin (hues);
ALTER TABLE public.archive_image_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own image meta readable" ON public.archive_image_meta;
CREATE POLICY "own image meta readable" ON public.archive_image_meta FOR SELECT TO authenticated USING (user_id = auth.uid());
-- Written only by the ai-image-analyze function (service role).
