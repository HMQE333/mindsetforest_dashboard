-- Computer time: what is never recorded -------------------------------------
--
-- Adult sites and words (the same list as tracker/mindsetforest_tracker/
-- privacy.py, which generates the pattern below; keep the two in step) plus
-- the user's own keywords (app_tracking_privacy, edited under Stats ->
-- Computer). The agent skips such windows itself; this trigger makes sure an
-- agent that is out of date cannot store them either. What was recorded
-- before is cleared by the user from the same screen (app_usage_forget_private).

CREATE TABLE public.app_tracking_privacy (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_tracking_privacy TO authenticated;
GRANT ALL ON public.app_tracking_privacy TO service_role;

ALTER TABLE public.app_tracking_privacy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tracking privacy"
  ON public.app_tracking_privacy FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tracking privacy"
  ON public.app_tracking_privacy FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tracking privacy"
  ON public.app_tracking_privacy FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tracking privacy"
  ON public.app_tracking_privacy FOR DELETE USING (auth.uid() = user_id);

-- Built-in terms match as whole words (case-insensitive); user keywords match anywhere.
CREATE OR REPLACE FUNCTION public.app_usage_is_private(p_user_id UUID, p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT coalesce(p_text, '') ~* '(?<![a-z0-9])(?:pornhub|xvideos|xnxx|xhamster|xhamsterlive|redtube|youporn|youjizz|spankbang|eporner|tube8|txxx|hqporner|porntrex|beeg|motherless|chaturbate|stripchat|bongacams|livejasmin|cam4|camsoda|myfreecams|onlyfans|fansly|manyvids|brazzers|bangbros|realitykings|rule34|nhentai|e\-hentai|hanime|erome|literotica|sex\.com|fapello|thothub|porn[a-z0-9]*|xxx[a-z0-9]*|nsfw|hentai[a-z0-9]*|nude|nudes|naked|sex|sexy|seks[a-z0-9]*|erotic[a-z0-9]*|erotyk[a-z0-9]*|camgirl[a-z0-9]*|sexcam[a-z0-9]*|milf[a-z0-9]*|18\+)(?![a-z0-9])'
      OR EXISTS (
        SELECT 1
        FROM public.app_tracking_privacy p, unnest(p.keywords) AS k
        WHERE p.user_id = p_user_id
          AND length(btrim(k)) >= 2
          AND strpos(lower(coalesce(p_text, '')), lower(btrim(k))) > 0
      );
$$;

CREATE OR REPLACE FUNCTION public.app_usage_sessions_drop_private()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.app_usage_is_private(NEW.user_id, concat_ws(' ', NEW.app, NEW.app_key, NEW.window_title)) THEN
    RETURN NULL;  -- silently not stored; the agent's upsert still succeeds
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_usage_sessions_drop_private
  BEFORE INSERT OR UPDATE ON public.app_usage_sessions
  FOR EACH ROW EXECUTE FUNCTION public.app_usage_sessions_drop_private();

-- Clears the caller's own past sessions that are private now.
CREATE OR REPLACE FUNCTION public.app_usage_forget_private()
RETURNS INTEGER
LANGUAGE sql
SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM public.app_usage_sessions s
    WHERE s.user_id = auth.uid()
      AND public.app_usage_is_private(s.user_id, concat_ws(' ', s.app, s.app_key, s.window_title))
    RETURNING 1
  )
  SELECT count(*)::INTEGER FROM gone;
$$;

REVOKE ALL ON FUNCTION public.app_usage_forget_private() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_usage_forget_private() TO authenticated;
