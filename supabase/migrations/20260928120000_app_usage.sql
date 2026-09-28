-- Computer time (Minute Tracker agent) ---------------------------------------
--
-- The desktop agent writes raw foreground sessions; the web app owns the
-- vocabulary (classes) and the assignment rules. One writer per table:
--   tracker  -> app_usage_sessions
--   web      -> app_classes, app_rules
-- Day keys use the owner's 04:00 boundary and are computed by the agent in its
-- local time zone; the web reads them as plain strings.

-- 1. Raw sessions ------------------------------------------------------------
CREATE TABLE public.app_usage_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  app TEXT NOT NULL,
  app_key TEXT NOT NULL,
  window_title TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  seconds INTEGER NOT NULL CHECK (seconds >= 0),
  idle BOOLEAN NOT NULL DEFAULT false,
  local_date TEXT NOT NULL CHECK (local_date ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id, started_at)
);

CREATE INDEX idx_app_usage_sessions_user_date ON public.app_usage_sessions(user_id, local_date);
CREATE INDEX idx_app_usage_sessions_user_started ON public.app_usage_sessions(user_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_usage_sessions TO authenticated;
GRANT ALL ON public.app_usage_sessions TO service_role;

ALTER TABLE public.app_usage_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage sessions"
  ON public.app_usage_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own usage sessions"
  ON public.app_usage_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own usage sessions"
  ON public.app_usage_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own usage sessions"
  ON public.app_usage_sessions FOR DELETE USING (auth.uid() = user_id);

-- 2. Classes: the user's own vocabulary ("work on X", "wasting time") ------------
CREATE TABLE public.app_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('work', 'learning', 'communication', 'waste', 'neutral', 'watching')),
  pillar_id TEXT,
  project_id UUID REFERENCES public.user_projects(id) ON DELETE SET NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  count_idle BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

COMMENT ON COLUMN public.app_classes.kind IS
  'work/learning/communication are productive; waste is time the user wants to see shrink; neutral is uncounted either way; watching keeps idle time (no input while a video plays).';
COMMENT ON COLUMN public.app_classes.count_idle IS
  'When true, idle sessions attributed to this class still count as time in it.';

CREATE INDEX idx_app_classes_user ON public.app_classes(user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_classes TO authenticated;
GRANT ALL ON public.app_classes TO service_role;

ALTER TABLE public.app_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own app classes"
  ON public.app_classes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own app classes"
  ON public.app_classes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own app classes"
  ON public.app_classes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own app classes"
  ON public.app_classes FOR DELETE USING (auth.uid() = user_id);

-- 3. Rules: how an app/window is assigned to a class ---------------------------
CREATE TABLE public.app_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field TEXT NOT NULL DEFAULT 'app_key' CHECK (field IN ('app', 'app_key', 'title')),
  match_kind TEXT NOT NULL CHECK (match_kind IN ('exact', 'substring', 'domain', 'regex')),
  pattern TEXT NOT NULL,
  class_id UUID NOT NULL REFERENCES public.app_classes(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.user_projects(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'label', 'learned', 'suggested')),
  confidence NUMERIC NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  enabled BOOLEAN NOT NULL DEFAULT true,
  hits INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, field, match_kind, pattern)
);

COMMENT ON COLUMN public.app_rules.source IS
  'manual = typed by the user; label = one-click assignment of a key; learned = proposed after corrections and accepted; suggested = proposed (by heuristics or AI) and not yet accepted, so it never classifies on its own.';

CREATE INDEX idx_app_rules_user ON public.app_rules(user_id, enabled, priority DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_rules TO authenticated;
GRANT ALL ON public.app_rules TO service_role;

ALTER TABLE public.app_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own app rules"
  ON public.app_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own app rules"
  ON public.app_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own app rules"
  ON public.app_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own app rules"
  ON public.app_rules FOR DELETE USING (auth.uid() = user_id);

-- 4. Daily rollup view (RLS of the base table applies through security_invoker) --
CREATE VIEW public.app_usage_daily
WITH (security_invoker = true) AS
SELECT
  user_id,
  device_id,
  local_date,
  app_key,
  idle,
  min(app) AS app,
  sum(seconds)::INTEGER AS seconds,
  count(*)::INTEGER AS session_count,
  max(ended_at) AS last_seen_at
FROM public.app_usage_sessions
GROUP BY user_id, device_id, local_date, app_key, idle;

GRANT SELECT ON public.app_usage_daily TO authenticated;
GRANT SELECT ON public.app_usage_daily TO service_role;
