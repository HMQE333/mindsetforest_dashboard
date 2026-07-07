
-- 1. Bookmarks table
CREATE TABLE public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookmarks_user_id ON public.bookmarks(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bookmarks"
  ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own bookmarks"
  ON public.bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bookmarks"
  ON public.bookmarks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bookmarks"
  ON public.bookmarks FOR DELETE USING (auth.uid() = user_id);

-- 2. Migrate existing bookmarks out of user_onboarding.preferences->'bookmarks'
INSERT INTO public.bookmarks (id, user_id, title, url, created_at)
SELECT
  COALESCE(
    NULLIF(bm->>'id', '')::uuid,
    gen_random_uuid()
  ) AS id,
  uo.user_id,
  COALESCE(NULLIF(bm->>'title', ''), bm->>'url') AS title,
  bm->>'url' AS url,
  now()
FROM public.user_onboarding uo
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(uo.preferences->'bookmarks') = 'array'
       THEN uo.preferences->'bookmarks'
       ELSE '[]'::jsonb END
) AS bm
WHERE bm->>'url' IS NOT NULL AND bm->>'url' <> ''
ON CONFLICT (id) DO NOTHING;

-- Strip the bookmarks key from preferences so it can't drift again
UPDATE public.user_onboarding
SET preferences = preferences - 'bookmarks'
WHERE preferences ? 'bookmarks';

-- 3. Auto-create user_onboarding row on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_onboarding (user_id, completed, custom_categories, preferences)
  VALUES (NEW.id, false, '[]'::jsonb, '{}'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_onboarding ON auth.users;
CREATE TRIGGER on_auth_user_created_onboarding
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_onboarding();
