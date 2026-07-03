-- ============================================================================
-- 🌳 FOREST — Shared knowledge space (Phase 1)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) forest_seeds — published copies of archive blocks
-- ----------------------------------------------------------------------------
CREATE TABLE public.forest_seeds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       uuid NOT NULL,
  source_block_id uuid,
  title           text NOT NULL DEFAULT '',
  content         text NOT NULL DEFAULT '',
  pillars         text[] NOT NULL DEFAULT '{}'::text[],
  directions      text[] NOT NULL DEFAULT '{}'::text[],
  tags            text[] NOT NULL DEFAULT '{}'::text[],
  source_url      text,
  visibility      text NOT NULL DEFAULT 'friends'
                       CHECK (visibility IN ('public','friends','custom')),
  language        text NOT NULL DEFAULT 'en',
  is_active       boolean NOT NULL DEFAULT true,
  water_count     integer NOT NULL DEFAULT 0,
  save_count      integer NOT NULL DEFAULT 0,
  view_count      integer NOT NULL DEFAULT 0,
  embedding       vector(1536),
  published_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_forest_seeds_author       ON public.forest_seeds(author_id);
CREATE INDEX idx_forest_seeds_published_at ON public.forest_seeds(published_at DESC);
CREATE INDEX idx_forest_seeds_active_pub   ON public.forest_seeds(is_active, visibility);
CREATE INDEX idx_forest_seeds_pillars      ON public.forest_seeds USING GIN(pillars);
CREATE INDEX idx_forest_seeds_directions   ON public.forest_seeds USING GIN(directions);
CREATE INDEX idx_forest_seeds_tags         ON public.forest_seeds USING GIN(tags);

ALTER TABLE public.forest_seeds ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2) forest_seed_audience — explicit allowlist for visibility = 'custom'
-- ----------------------------------------------------------------------------
CREATE TABLE public.forest_seed_audience (
  seed_id uuid NOT NULL REFERENCES public.forest_seeds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (seed_id, user_id)
);

CREATE INDEX idx_forest_audience_user ON public.forest_seed_audience(user_id);

ALTER TABLE public.forest_seed_audience ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3) forest_waters — appreciation / upvote
-- ----------------------------------------------------------------------------
CREATE TABLE public.forest_waters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id    uuid NOT NULL REFERENCES public.forest_seeds(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seed_id, user_id)
);

CREATE INDEX idx_forest_waters_user ON public.forest_waters(user_id);
CREATE INDEX idx_forest_waters_seed ON public.forest_waters(seed_id);

ALTER TABLE public.forest_waters ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 4) forest_saves — tracks when a viewer copies a seed back into their archive
-- ----------------------------------------------------------------------------
CREATE TABLE public.forest_saves (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id        uuid NOT NULL REFERENCES public.forest_seeds(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  saved_block_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seed_id, user_id)
);

CREATE INDEX idx_forest_saves_user ON public.forest_saves(user_id);
CREATE INDEX idx_forest_saves_seed ON public.forest_saves(seed_id);

ALTER TABLE public.forest_saves ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5) forest_reports — moderation (Phase 5)
-- ----------------------------------------------------------------------------
CREATE TABLE public.forest_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_id     uuid NOT NULL REFERENCES public.forest_seeds(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (seed_id, reporter_id)
);

CREATE INDEX idx_forest_reports_seed ON public.forest_reports(seed_id);

ALTER TABLE public.forest_reports ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Visibility check used in RLS and trigger checks (SECURITY DEFINER → no recursion)
CREATE OR REPLACE FUNCTION public.can_view_seed(_seed_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.forest_seeds s
    WHERE s.id = _seed_id
      AND s.is_active = true
      AND (
            s.author_id = auth.uid()
         OR s.visibility = 'public'
         OR (s.visibility = 'friends' AND public.are_friends(auth.uid(), s.author_id))
         OR (s.visibility = 'custom'  AND EXISTS (
                SELECT 1 FROM public.forest_seed_audience a
                WHERE a.seed_id = s.id AND a.user_id = auth.uid()
            ))
      )
  );
$$;

-- Bump view counter (only path allowed to mutate view_count)
CREATE OR REPLACE FUNCTION public.forest_view_seed(_seed_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.can_view_seed(_seed_id) THEN RETURN; END IF;
  UPDATE public.forest_seeds SET view_count = view_count + 1 WHERE id = _seed_id;
END;
$$;

-- Updated-at trigger (reuses existing pattern)
CREATE OR REPLACE FUNCTION public.update_forest_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_forest_seeds_updated_at
BEFORE UPDATE ON public.forest_seeds
FOR EACH ROW EXECUTE FUNCTION public.update_forest_updated_at();

-- Protect engagement counters from direct client writes.
-- They may only change via the dedicated triggers / RPCs below.
CREATE OR REPLACE FUNCTION public.protect_forest_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.water_count := OLD.water_count;
  NEW.save_count  := OLD.save_count;
  NEW.view_count  := OLD.view_count;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_forest_seeds_protect_counters
BEFORE UPDATE ON public.forest_seeds
FOR EACH ROW EXECUTE FUNCTION public.protect_forest_counters();

-- Denorm counters
CREATE OR REPLACE FUNCTION public.bump_forest_water_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forest_seeds SET water_count = water_count + 1 WHERE id = NEW.seed_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forest_seeds SET water_count = GREATEST(water_count - 1, 0) WHERE id = OLD.seed_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_forest_waters_count
AFTER INSERT OR DELETE ON public.forest_waters
FOR EACH ROW EXECUTE FUNCTION public.bump_forest_water_count();

CREATE OR REPLACE FUNCTION public.bump_forest_save_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.forest_seeds SET save_count = save_count + 1 WHERE id = NEW.seed_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.forest_seeds SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.seed_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_forest_saves_count
AFTER INSERT OR DELETE ON public.forest_saves
FOR EACH ROW EXECUTE FUNCTION public.bump_forest_save_count();

-- Rate-limit: max 20 publishes / day / user
CREATE OR REPLACE FUNCTION public.enforce_forest_publish_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM public.forest_seeds
  WHERE author_id = NEW.author_id
    AND published_at > now() - interval '1 day';
  IF cnt >= 20 THEN
    RAISE EXCEPTION 'forest_publish_rate_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_forest_seeds_rate_limit
BEFORE INSERT ON public.forest_seeds
FOR EACH ROW EXECUTE FUNCTION public.enforce_forest_publish_rate();

-- Rate-limit: max 30 reports / day / user
CREATE OR REPLACE FUNCTION public.enforce_forest_report_rate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM public.forest_reports
  WHERE reporter_id = NEW.reporter_id
    AND created_at > now() - interval '1 day';
  IF cnt >= 30 THEN
    RAISE EXCEPTION 'forest_report_rate_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_forest_reports_rate_limit
BEFORE INSERT ON public.forest_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_forest_report_rate();

-- Watering / saving must target a seed the actor can actually view
CREATE OR REPLACE FUNCTION public.enforce_forest_engagement_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_seed(NEW.seed_id) THEN
    RAISE EXCEPTION 'seed_not_visible';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_forest_waters_visibility
BEFORE INSERT ON public.forest_waters
FOR EACH ROW EXECUTE FUNCTION public.enforce_forest_engagement_visibility();

CREATE TRIGGER trg_forest_saves_visibility
BEFORE INSERT ON public.forest_saves
FOR EACH ROW EXECUTE FUNCTION public.enforce_forest_engagement_visibility();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- forest_seeds ----------------------------------------------------------------
CREATE POLICY "View visible seeds"
  ON public.forest_seeds FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
         author_id = auth.uid()
      OR visibility = 'public'
      OR (visibility = 'friends' AND public.are_friends(auth.uid(), author_id))
      OR (visibility = 'custom'  AND EXISTS (
            SELECT 1 FROM public.forest_seed_audience a
            WHERE a.seed_id = id AND a.user_id = auth.uid()
          ))
    )
  );

CREATE POLICY "Authors can view own seeds (incl inactive)"
  ON public.forest_seeds FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Authors can insert own seeds"
  ON public.forest_seeds FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own seeds"
  ON public.forest_seeds FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Authors can delete own seeds"
  ON public.forest_seeds FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());

-- forest_seed_audience --------------------------------------------------------
CREATE POLICY "Owners manage audience (select)"
  ON public.forest_seed_audience FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.forest_seeds s
    WHERE s.id = seed_id AND s.author_id = auth.uid()
  ));

CREATE POLICY "Owners manage audience (insert)"
  ON public.forest_seed_audience FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.forest_seeds s
    WHERE s.id = seed_id AND s.author_id = auth.uid()
  ));

CREATE POLICY "Owners manage audience (delete)"
  ON public.forest_seed_audience FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.forest_seeds s
    WHERE s.id = seed_id AND s.author_id = auth.uid()
  ));

-- forest_waters ---------------------------------------------------------------
CREATE POLICY "Authenticated can view waters"
  ON public.forest_waters FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can water seeds"
  ON public.forest_waters FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unwater own"
  ON public.forest_waters FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- forest_saves ----------------------------------------------------------------
CREATE POLICY "Authenticated can view saves"
  ON public.forest_saves FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can save seeds"
  ON public.forest_saves FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unsave own"
  ON public.forest_saves FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- forest_reports --------------------------------------------------------------
CREATE POLICY "Reporters can create"
  ON public.forest_reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reporters view own"
  ON public.forest_reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());