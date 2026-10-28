-- Link previews for the Archive mosaic: the page's title, image and site,
-- fetched once per URL by the link-preview edge function (service role) and
-- read by any signed-in user. Holds only what the page shows publicly.
CREATE TABLE IF NOT EXISTS public.link_previews (
  url text PRIMARY KEY,
  title text,
  description text,
  image text,
  site text,
  ok boolean NOT NULL DEFAULT true,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.link_previews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "link previews readable" ON public.link_previews;
CREATE POLICY "link previews readable" ON public.link_previews FOR SELECT TO authenticated USING (true);
-- No insert/update policy: only the edge function (service role) writes.
