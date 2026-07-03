-- =====================================================
-- PHASE 3: Re-sync link on saved blocks
-- =====================================================

ALTER TABLE public.archive_blocks
  ADD COLUMN IF NOT EXISTS from_seed_id uuid;

CREATE INDEX IF NOT EXISTS idx_archive_blocks_from_seed
  ON public.archive_blocks(from_seed_id) WHERE from_seed_id IS NOT NULL;

-- =====================================================
-- PHASE 3: Forest Collections
-- =====================================================

CREATE TABLE IF NOT EXISTS public.forest_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled collection',
  description text NOT NULL DEFAULT '',
  emoji text NOT NULL DEFAULT '📚',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forest_collections_owner ON public.forest_collections(owner_id);

ALTER TABLE public.forest_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view own collections"
  ON public.forest_collections FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Anyone can view public collections"
  ON public.forest_collections FOR SELECT TO authenticated
  USING (is_public = true);

CREATE POLICY "Owners can create collections"
  ON public.forest_collections FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update collections"
  ON public.forest_collections FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete collections"
  ON public.forest_collections FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER set_forest_collections_updated_at
  BEFORE UPDATE ON public.forest_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_state_updated_at();

-- Daily cap: 5 collections / day
CREATE OR REPLACE FUNCTION public.enforce_collection_create_rate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.forest_collections
  WHERE owner_id = NEW.owner_id AND created_at > now() - interval '1 day';
  IF cnt >= 5 THEN RAISE EXCEPTION 'forest_collection_rate_exceeded'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_collection_rate
  BEFORE INSERT ON public.forest_collections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_collection_create_rate();

-- Mapping: seeds belonging to a collection
CREATE TABLE IF NOT EXISTS public.forest_collection_seeds (
  collection_id uuid NOT NULL REFERENCES public.forest_collections(id) ON DELETE CASCADE,
  seed_id uuid NOT NULL REFERENCES public.forest_seeds(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, seed_id)
);

CREATE INDEX IF NOT EXISTS idx_forest_collection_seeds_seed ON public.forest_collection_seeds(seed_id);

ALTER TABLE public.forest_collection_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View collection seeds when collection visible"
  ON public.forest_collection_seeds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.forest_collections c
    WHERE c.id = forest_collection_seeds.collection_id
      AND (c.owner_id = auth.uid() OR c.is_public = true)
  ));

CREATE POLICY "Owners can manage collection seeds (insert)"
  ON public.forest_collection_seeds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.forest_collections c
    WHERE c.id = forest_collection_seeds.collection_id AND c.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can manage collection seeds (delete)"
  ON public.forest_collection_seeds FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.forest_collections c
    WHERE c.id = forest_collection_seeds.collection_id AND c.owner_id = auth.uid()
  ));

CREATE POLICY "Owners can manage collection seeds (update)"
  ON public.forest_collection_seeds FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.forest_collections c
    WHERE c.id = forest_collection_seeds.collection_id AND c.owner_id = auth.uid()
  ));

-- =====================================================
-- PHASE 4: Forest Inbox events
-- =====================================================

CREATE TABLE IF NOT EXISTS public.forest_inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  actor_id uuid,
  seed_id uuid REFERENCES public.forest_seeds(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('friend_planted','seed_watered','seed_saved')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forest_inbox_recipient_unread
  ON public.forest_inbox_events(recipient_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_forest_inbox_recipient
  ON public.forest_inbox_events(recipient_id, created_at DESC);

ALTER TABLE public.forest_inbox_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recipients view own events"
  ON public.forest_inbox_events FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Recipients update own events (read state)"
  ON public.forest_inbox_events FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "Recipients delete own events"
  ON public.forest_inbox_events FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());
-- INSERTs done by SECURITY DEFINER triggers only — no direct insert policy.

-- Trigger: when an active seed is published, fan out to friends (visibility friends/public/custom-audience)
CREATE OR REPLACE FUNCTION public.fanout_friend_planted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = false THEN RETURN NEW; END IF;

  -- For friends visibility: notify all accepted friends
  IF NEW.visibility = 'friends' THEN
    INSERT INTO public.forest_inbox_events (recipient_id, actor_id, seed_id, kind)
    SELECT
      CASE WHEN f.requester_id = NEW.author_id THEN f.recipient_id ELSE f.requester_id END,
      NEW.author_id, NEW.id, 'friend_planted'
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = NEW.author_id OR f.recipient_id = NEW.author_id);
  ELSIF NEW.visibility = 'custom' THEN
    -- Notify only audience members
    INSERT INTO public.forest_inbox_events (recipient_id, actor_id, seed_id, kind)
    SELECT a.user_id, NEW.author_id, NEW.id, 'friend_planted'
    FROM public.forest_seed_audience a WHERE a.seed_id = NEW.id;
  ELSIF NEW.visibility = 'public' THEN
    -- Notify accepted friends only (avoid global spam)
    INSERT INTO public.forest_inbox_events (recipient_id, actor_id, seed_id, kind)
    SELECT
      CASE WHEN f.requester_id = NEW.author_id THEN f.recipient_id ELSE f.requester_id END,
      NEW.author_id, NEW.id, 'friend_planted'
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = NEW.author_id OR f.recipient_id = NEW.author_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_fanout_friend_planted
  AFTER INSERT ON public.forest_seeds
  FOR EACH ROW EXECUTE FUNCTION public.fanout_friend_planted();

-- Trigger: when someone waters a seed, notify the author (skip self-water)
CREATE OR REPLACE FUNCTION public.notify_seed_watered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT author_id INTO author FROM public.forest_seeds WHERE id = NEW.seed_id;
  IF author IS NULL OR author = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO public.forest_inbox_events (recipient_id, actor_id, seed_id, kind)
  VALUES (author, NEW.user_id, NEW.seed_id, 'seed_watered');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_water
  AFTER INSERT ON public.forest_waters
  FOR EACH ROW EXECUTE FUNCTION public.notify_seed_watered();

-- Trigger: when someone saves a seed, notify the author (skip self)
CREATE OR REPLACE FUNCTION public.notify_seed_saved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE author uuid;
BEGIN
  SELECT author_id INTO author FROM public.forest_seeds WHERE id = NEW.seed_id;
  IF author IS NULL OR author = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO public.forest_inbox_events (recipient_id, actor_id, seed_id, kind)
  VALUES (author, NEW.user_id, NEW.seed_id, 'seed_saved');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_save
  AFTER INSERT ON public.forest_saves
  FOR EACH ROW EXECUTE FUNCTION public.notify_seed_saved();

-- =====================================================
-- PHASE 5: Block authors
-- =====================================================

CREATE TABLE IF NOT EXISTS public.forest_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_forest_blocks_blocker ON public.forest_blocks(blocker_id);

ALTER TABLE public.forest_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view own blocks"
  ON public.forest_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

CREATE POLICY "Owners create own blocks"
  ON public.forest_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

CREATE POLICY "Owners delete own blocks"
  ON public.forest_blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());