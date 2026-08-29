-- Paths: one module replacing Mastery Ladder + Habit Loop.
--
-- Model, deliberately small:
--   paths        - a named goal, optionally tagged with a dashboard category
--   path_steps   - ordered steps. mode 'once' = do it once, 'reps' = do it N days
--   path_step_logs - one row per (step, local calendar date). The unique index is
--                    what makes a rep mean "a day", not "a click".
--
-- The active step is simply the first not-done step by sort_order. No pointer
-- column, no state machine: reordering steps changes what comes next.

-- 1. paths
CREATE TABLE public.paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_paths_user_id ON public.paths(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paths TO authenticated;
GRANT ALL ON public.paths TO service_role;
ALTER TABLE public.paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own paths"
  ON public.paths FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own paths"
  ON public.paths FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own paths"
  ON public.paths FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own paths"
  ON public.paths FOR DELETE USING (auth.uid() = user_id);

-- 2. path_steps
CREATE TABLE public.path_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_id UUID NOT NULL REFERENCES public.paths(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  -- Optional free-text grouping label ("Basics", "Ship it"). No fixed levels:
  -- a path can have zero stages or seven, whatever the user types.
  stage TEXT,
  mode TEXT NOT NULL DEFAULT 'once' CHECK (mode IN ('once', 'reps')),
  reps_target INTEGER NOT NULL DEFAULT 1 CHECK (reps_target >= 1),
  -- Denormalised counter for cheap reads; path_step_logs stays the source of truth.
  reps_done INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 20,
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_path_steps_user_id ON public.path_steps(user_id);
CREATE INDEX idx_path_steps_path_id ON public.path_steps(path_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.path_steps TO authenticated;
GRANT ALL ON public.path_steps TO service_role;
ALTER TABLE public.path_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own path steps"
  ON public.path_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own path steps"
  ON public.path_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own path steps"
  ON public.path_steps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own path steps"
  ON public.path_steps FOR DELETE USING (auth.uid() = user_id);

-- 3. path_step_logs - one rep per step per local calendar day
CREATE TABLE public.path_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.path_steps(id) ON DELETE CASCADE,
  path_id UUID NOT NULL REFERENCES public.paths(id) ON DELETE CASCADE,
  -- Local calendar date supplied by the client (never derived from UTC now()).
  date DATE NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (step_id, date)
);

CREATE INDEX idx_path_step_logs_user_date ON public.path_step_logs(user_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.path_step_logs TO authenticated;
GRANT ALL ON public.path_step_logs TO service_role;
ALTER TABLE public.path_step_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own path step logs"
  ON public.path_step_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own path step logs"
  ON public.path_step_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own path step logs"
  ON public.path_step_logs FOR DELETE USING (auth.uid() = user_id);

-- 4. Retire the modules Paths replaces. Data is intentionally dropped.
DROP TABLE IF EXISTS public.ladder_state;
DROP TABLE IF EXISTS public.habit_loops;
