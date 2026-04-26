CREATE OR REPLACE FUNCTION public.is_forest_seed_author(_seed_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.forest_seeds s
    WHERE s.id = _seed_id
      AND s.author_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "Owners manage audience (delete)" ON public.forest_seed_audience;
DROP POLICY IF EXISTS "Owners manage audience (insert)" ON public.forest_seed_audience;
DROP POLICY IF EXISTS "Owners manage audience (select)" ON public.forest_seed_audience;

CREATE POLICY "Owners manage audience (delete)"
ON public.forest_seed_audience
FOR DELETE
TO authenticated
USING (public.is_forest_seed_author(seed_id, auth.uid()));

CREATE POLICY "Owners manage audience (insert)"
ON public.forest_seed_audience
FOR INSERT
TO authenticated
WITH CHECK (public.is_forest_seed_author(seed_id, auth.uid()));

CREATE POLICY "Owners manage audience (select)"
ON public.forest_seed_audience
FOR SELECT
TO authenticated
USING (public.is_forest_seed_author(seed_id, auth.uid()));