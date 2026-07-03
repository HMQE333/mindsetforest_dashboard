CREATE OR REPLACE FUNCTION public.get_shared_library(share_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
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
  SELECT * INTO share_row
  FROM public.library_shares
  WHERE id = share_id;

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
    )
    INTO result
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
    )
    INTO result
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

  UPDATE public.library_shares
  SET view_count = view_count + 1
  WHERE id = share_id;

  RETURN result;
END;
$$;