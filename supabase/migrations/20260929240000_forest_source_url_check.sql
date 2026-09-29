-- Forest seeds are shown to other people, and authors can insert or update
-- their seeds directly (not only through forest-publish-seed), so the only
-- links allowed are web links: a javascript: URL would run in the reader's
-- browser. NOT VALID skips re-checking old rows (there were none that fail).
ALTER TABLE public.forest_seeds DROP CONSTRAINT IF EXISTS forest_seeds_source_url_http;
ALTER TABLE public.forest_seeds
  ADD CONSTRAINT forest_seeds_source_url_http
  CHECK (source_url IS NULL OR source_url ~* '^https?://') NOT VALID;
