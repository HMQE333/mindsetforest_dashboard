
-- ============================================================
-- Friends system foundation
-- ============================================================

-- Enable citext for case-insensitive usernames
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- 1. user_profiles
-- ============================================================
CREATE TABLE public.user_profiles (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     citext UNIQUE NOT NULL,
  friend_code  text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  avatar_emoji text NOT NULL DEFAULT '🦊',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT friend_code_format CHECK (friend_code ~ '^[A-HJ-NP-Z2-9]{6}$')
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can look up profiles (needed to find friends by handle)
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON public.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_state_updated_at();

-- ============================================================
-- 2. friendships
-- ============================================================
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE public.friendships (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                public.friendship_status NOT NULL DEFAULT 'pending',
  promises              jsonb NOT NULL DEFAULT '["","",""]'::jsonb,
  share_from_requester  boolean NOT NULL DEFAULT false,
  share_from_recipient  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, recipient_id),
  CHECK (requester_id <> recipient_id)
);

CREATE INDEX idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX idx_friendships_recipient ON public.friendships(recipient_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can create friend requests as requester"
  ON public.friendships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can update own friendships"
  ON public.friendships FOR UPDATE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can delete own friendships"
  ON public.friendships FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE TRIGGER friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_state_updated_at();

-- ============================================================
-- 3. profile_shares
-- ============================================================
CREATE TABLE public.profile_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'My Profile',
  sections    jsonb NOT NULL DEFAULT '{"hero":true,"weekly":true,"stats":false,"pulse":false,"achievements":false,"metrics":false}'::jsonb,
  is_public   boolean NOT NULL DEFAULT true,
  view_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_shares_user ON public.profile_shares(user_id);

ALTER TABLE public.profile_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile shares"
  ON public.profile_shares FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view public profile shares"
  ON public.profile_shares FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Users can create own profile shares"
  ON public.profile_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile shares"
  ON public.profile_shares FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile shares"
  ON public.profile_shares FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER profile_shares_updated_at
  BEFORE UPDATE ON public.profile_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_dashboard_state_updated_at();

-- ============================================================
-- 4. friend_suggestions
-- ============================================================
CREATE TYPE public.suggestion_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE public.friend_suggestions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title              text NOT NULL,
  note               text NOT NULL DEFAULT '',
  source             text NOT NULL DEFAULT 'planning',
  status             public.suggestion_status NOT NULL DEFAULT 'pending',
  resulting_task_id  uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  responded_at       timestamptz,
  CHECK (sender_id <> recipient_id),
  CHECK (length(title) BETWEEN 1 AND 200),
  CHECK (length(note) <= 500)
);

CREATE INDEX idx_suggestions_recipient ON public.friend_suggestions(recipient_id, status);
CREATE INDEX idx_suggestions_sender ON public.friend_suggestions(sender_id);

ALTER TABLE public.friend_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own suggestions"
  ON public.friend_suggestions FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Senders can create suggestions"
  ON public.friend_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Recipients can update own suggestions"
  ON public.friend_suggestions FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id);

CREATE POLICY "Either party can delete suggestions"
  ON public.friend_suggestions FOR DELETE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- ============================================================
-- Helper function: are_friends (no recursion via security definer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = _a AND recipient_id = _b)
        OR (requester_id = _b AND recipient_id = _a))
  )
$$;

-- ============================================================
-- Friend code generator
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- ============================================================
-- ensure_user_profile: create default profile if missing
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS public.user_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  profile public.user_profiles;
  candidate_username text;
  candidate_code text;
  attempt int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO profile FROM public.user_profiles WHERE user_id = uid;
  IF FOUND THEN
    RETURN profile;
  END IF;

  -- Generate a candidate username from uid prefix
  candidate_username := 'user_' || substr(replace(uid::text, '-', ''), 1, 8);

  -- Try insert with retries on collision
  WHILE attempt < 5 LOOP
    BEGIN
      candidate_code := public.generate_friend_code();
      INSERT INTO public.user_profiles (user_id, username, friend_code)
      VALUES (uid, candidate_username, candidate_code)
      RETURNING * INTO profile;
      RETURN profile;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      candidate_username := 'user_' || substr(replace(uid::text, '-', ''), 1, 8) || attempt::text;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not create profile after retries';
END;
$$;

-- ============================================================
-- regenerate_friend_code
-- ============================================================
CREATE OR REPLACE FUNCTION public.regenerate_friend_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_code text;
  attempt int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WHILE attempt < 5 LOOP
    new_code := public.generate_friend_code();
    BEGIN
      UPDATE public.user_profiles SET friend_code = new_code, updated_at = now()
      WHERE user_id = uid;
      RETURN new_code;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not regenerate friend code';
END;
$$;

-- ============================================================
-- add_friend_by_handle: accepts @username or friend_code
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_friend_by_handle(handle text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cleaned text;
  target_id uuid;
  existing public.friendships;
  reverse public.friendships;
  new_row public.friendships;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  cleaned := trim(handle);
  IF cleaned IS NULL OR length(cleaned) = 0 THEN
    RETURN jsonb_build_object('error', 'empty_handle');
  END IF;

  -- Strip leading @
  IF left(cleaned, 1) = '@' THEN
    cleaned := substring(cleaned from 2);
  END IF;

  -- Look up by friend_code (uppercase, 6 chars) OR username
  SELECT user_id INTO target_id
  FROM public.user_profiles
  WHERE friend_code = upper(cleaned)
     OR username = lower(cleaned)
  LIMIT 1;

  IF target_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF target_id = uid THEN
    RETURN jsonb_build_object('error', 'self_add');
  END IF;

  -- Existing forward request?
  SELECT * INTO existing FROM public.friendships
  WHERE requester_id = uid AND recipient_id = target_id;
  IF FOUND THEN
    RETURN jsonb_build_object('error', 'already_exists', 'status', existing.status);
  END IF;

  -- Reverse pending? Auto-accept.
  SELECT * INTO reverse FROM public.friendships
  WHERE requester_id = target_id AND recipient_id = uid;
  IF FOUND THEN
    IF reverse.status = 'pending' THEN
      UPDATE public.friendships SET status = 'accepted', updated_at = now()
      WHERE id = reverse.id
      RETURNING * INTO reverse;
      RETURN jsonb_build_object('ok', true, 'auto_accepted', true, 'friendship', row_to_json(reverse));
    ELSE
      RETURN jsonb_build_object('error', 'already_exists', 'status', reverse.status);
    END IF;
  END IF;

  INSERT INTO public.friendships (requester_id, recipient_id, status)
  VALUES (uid, target_id, 'pending')
  RETURNING * INTO new_row;

  RETURN jsonb_build_object('ok', true, 'friendship', row_to_json(new_row));
END;
$$;

-- ============================================================
-- accept / decline friend request
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  row_after public.friendships;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  UPDATE public.friendships
  SET status = 'accepted', updated_at = now()
  WHERE id = request_id
    AND recipient_id = uid
    AND status = 'pending'
  RETURNING * INTO row_after;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found_or_not_pending');
  END IF;

  RETURN jsonb_build_object('ok', true, 'friendship', row_to_json(row_after));
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_friend_request(request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  DELETE FROM public.friendships
  WHERE id = request_id
    AND recipient_id = uid
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- get_friend_dashboard: live stats sharing with access guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_friend_dashboard(friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  link public.friendships;
  allowed boolean := false;
  ds_row record;
  weekly jsonb;
  profile_row public.user_profiles;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Find friendship row in either direction
  SELECT * INTO link FROM public.friendships
  WHERE status = 'accepted'
    AND ((requester_id = uid AND recipient_id = friend_id)
      OR (requester_id = friend_id AND recipient_id = uid))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_friends');
  END IF;

  -- Did the FRIEND opt to share with us?
  IF link.requester_id = friend_id AND link.share_from_requester THEN
    allowed := true;
  ELSIF link.recipient_id = friend_id AND link.share_from_recipient THEN
    allowed := true;
  END IF;

  IF NOT allowed THEN
    RETURN jsonb_build_object('error', 'not_shared');
  END IF;

  -- Pull dashboard state
  SELECT current_xp, current_level, streak_days, missions_completed
  INTO ds_row
  FROM public.dashboard_state
  WHERE user_id = friend_id;

  -- Pull last 7 days
  SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY x.date), '[]'::jsonb) INTO weekly
  FROM (
    SELECT date, missions_completed, xp_earned
    FROM public.daily_completions
    WHERE user_id = friend_id
      AND date >= to_char(now() - interval '7 days', 'YYYY-MM-DD')
    ORDER BY date
  ) x;

  -- Profile (display name + emoji)
  SELECT * INTO profile_row FROM public.user_profiles WHERE user_id = friend_id;

  RETURN jsonb_build_object(
    'ok', true,
    'profile', jsonb_build_object(
      'username', profile_row.username,
      'display_name', profile_row.display_name,
      'avatar_emoji', profile_row.avatar_emoji
    ),
    'hero', jsonb_build_object(
      'current_xp', COALESCE(ds_row.current_xp, 0),
      'current_level', COALESCE(ds_row.current_level, 1),
      'streak_days', COALESCE(ds_row.streak_days, 0),
      'missions_completed', COALESCE(ds_row.missions_completed, 0)
    ),
    'weekly', weekly
  );
END;
$$;

-- ============================================================
-- get_shared_profile: anonymous fetch of public profile share
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_shared_profile(share_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.profile_shares;
  profile_row public.user_profiles;
  ds_row record;
  weekly jsonb := '[]'::jsonb;
  pulse jsonb := '[]'::jsonb;
  metrics jsonb := '[]'::jsonb;
  sections jsonb;
BEGIN
  SELECT * INTO share_row FROM public.profile_shares WHERE id = share_id;
  IF NOT FOUND OR share_row.is_public = false THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  sections := share_row.sections;

  SELECT * INTO profile_row FROM public.user_profiles WHERE user_id = share_row.user_id;

  IF (sections->>'hero')::boolean THEN
    SELECT current_xp, current_level, streak_days, missions_completed
    INTO ds_row
    FROM public.dashboard_state
    WHERE user_id = share_row.user_id;
  END IF;

  IF (sections->>'weekly')::boolean THEN
    SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY x.date), '[]'::jsonb) INTO weekly
    FROM (
      SELECT date, missions_completed, xp_earned, categories_engaged
      FROM public.daily_completions
      WHERE user_id = share_row.user_id
        AND date >= to_char(now() - interval '7 days', 'YYYY-MM-DD')
      ORDER BY date
    ) x;
  END IF;

  IF (sections->>'pulse')::boolean THEN
    SELECT COALESCE(jsonb_agg(row_to_json(x.*) ORDER BY x.date), '[]'::jsonb) INTO pulse
    FROM (
      SELECT date, SUM(value)::numeric AS total
      FROM public.tracker_entries
      WHERE user_id = share_row.user_id
        AND date >= to_char(now() - interval '365 days', 'YYYY-MM-DD')
      GROUP BY date
      ORDER BY date
    ) x;
  END IF;

  IF (sections->>'metrics')::boolean THEN
    SELECT COALESCE(jsonb_agg(row_to_json(x.*)), '[]'::jsonb) INTO metrics
    FROM (
      SELECT id, label, icon, unit, category_id, color_var, sort_order
      FROM public.user_metrics
      WHERE user_id = share_row.user_id
      ORDER BY sort_order
    ) x;
  END IF;

  -- Bump view count
  UPDATE public.profile_shares SET view_count = view_count + 1 WHERE id = share_id;

  RETURN jsonb_build_object(
    'ok', true,
    'share', jsonb_build_object(
      'id', share_row.id,
      'name', share_row.name,
      'sections', share_row.sections,
      'view_count', share_row.view_count + 1
    ),
    'profile', jsonb_build_object(
      'username', COALESCE(profile_row.username, ''),
      'display_name', COALESCE(profile_row.display_name, ''),
      'avatar_emoji', COALESCE(profile_row.avatar_emoji, '🦊')
    ),
    'hero', CASE WHEN (sections->>'hero')::boolean THEN jsonb_build_object(
      'current_xp', COALESCE(ds_row.current_xp, 0),
      'current_level', COALESCE(ds_row.current_level, 1),
      'streak_days', COALESCE(ds_row.streak_days, 0),
      'missions_completed', COALESCE(ds_row.missions_completed, 0)
    ) ELSE NULL END,
    'weekly', weekly,
    'pulse', pulse,
    'metrics', metrics
  );
END;
$$;
