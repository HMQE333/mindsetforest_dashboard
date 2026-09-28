-- Create library_shares table
CREATE TABLE public.library_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My Library',
  tab text NOT NULL DEFAULT 'books',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT true,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.library_shares ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "Users can view own shares"
ON public.library_shares
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own shares"
ON public.library_shares
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shares"
ON public.library_shares
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shares"
ON public.library_shares
FOR DELETE
USING (auth.uid() = user_id);

-- Public read policy (anyone can see public shares to validate them)
CREATE POLICY "Anyone can view public shares"
ON public.library_shares
FOR SELECT
TO anon, authenticated
USING (is_public = true);

-- Updated_at trigger
CREATE TRIGGER update_library_shares_updated_at
BEFORE UPDATE ON public.library_shares
FOR EACH ROW
EXECUTE FUNCTION public.update_cooking_updated_at();

-- SECURITY DEFINER function to fetch shared library content
CREATE OR REPLACE FUNCTION public.get_shared_library(share_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.library_shares%ROWTYPE;
  result jsonb;
  filters jsonb;
  f_status text;
  f_rating int;
  f_tag text;
  f_format text;
  f_pillar text;
  f_search text;
  f_view_mode text;
BEGIN
  SELECT * INTO share_row FROM public.library_shares WHERE id = share_id;
  
  IF NOT FOUND OR share_row.is_public = false THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  filters := share_row.filters;
  f_status := filters->>'status';
  f_rating := NULLIF(filters->>'rating', '')::int;
  f_tag := filters->>'tag';
  f_format := filters->>'format';
  f_pillar := filters->>'pillar';
  f_search := filters->>'search';
  f_view_mode := COALESCE(filters->>'viewMode', 'block');

  IF share_row.tab = 'courses' THEN
    SELECT jsonb_build_object(
      'share', jsonb_build_object(
        'id', share_row.id,
        'name', share_row.name,
        'tab', share_row.tab,
        'filters', share_row.filters,
        'view_mode', f_view_mode
      ),
      'items', COALESCE(jsonb_agg(row_to_json(c.*)), '[]'::jsonb)
    ) INTO result
    FROM (
      SELECT id, title, platform, instructor, url, cover_color, status, progress_pct, rating, notes, tags, pillars, directions, created_at, updated_at
      FROM public.user_courses
      WHERE user_id = share_row.user_id
        AND (f_status IS NULL OR f_status = '' OR f_status = 'all' OR status = f_status)
        AND (f_rating IS NULL OR COALESCE(rating, 0) >= f_rating)
        AND (f_tag IS NULL OR f_tag = '' OR f_tag = ANY(tags))
        AND (f_pillar IS NULL OR f_pillar = '' OR f_pillar = ANY(pillars))
        AND (
          f_search IS NULL OR f_search = '' OR
          title ILIKE '%' || f_search || '%' OR
          platform ILIKE '%' || f_search || '%' OR
          instructor ILIKE '%' || f_search || '%'
        )
      ORDER BY created_at DESC
    ) c;
  ELSE
    SELECT jsonb_build_object(
      'share', jsonb_build_object(
        'id', share_row.id,
        'name', share_row.name,
        'tab', share_row.tab,
        'filters', share_row.filters,
        'view_mode', f_view_mode
      ),
      'items', COALESCE(jsonb_agg(row_to_json(b.*)), '[]'::jsonb)
    ) INTO result
    FROM (
      SELECT id, title, author, total_pages, pages_read, rating, status, notes, cover_color, tags, pillars, directions, format, created_at, updated_at
      FROM public.user_books
      WHERE user_id = share_row.user_id
        AND (f_status IS NULL OR f_status = '' OR f_status = 'all' OR status = f_status)
        AND (f_rating IS NULL OR COALESCE(rating, 0) >= f_rating)
        AND (f_tag IS NULL OR f_tag = '' OR f_tag = ANY(tags))
        AND (f_format IS NULL OR f_format = '' OR format = f_format)
        AND (f_pillar IS NULL OR f_pillar = '' OR f_pillar = ANY(pillars))
        AND (
          f_search IS NULL OR f_search = '' OR
          title ILIKE '%' || f_search || '%' OR
          author ILIKE '%' || f_search || '%'
        )
      ORDER BY created_at DESC
    ) b;
  END IF;

  -- Increment view count (best effort)
  UPDATE public.library_shares SET view_count = view_count + 1 WHERE id = share_id;

  RETURN result;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_shared_library(uuid) TO anon, authenticated;