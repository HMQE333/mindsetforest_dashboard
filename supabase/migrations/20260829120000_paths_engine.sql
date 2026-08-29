-- The two missing organs: COMMIT (a written prior) and SCORE (was the prior right?),
-- plus the revision log that makes plan edits reversible and, later, learnable.
--
-- Rationale, in one line each:
--   paths.diagnosis        - the binding constraint you claim, written BEFORE acting.
--                            Without it, memory rewrites the prior to match the outcome.
--   paths.diagnosis_*      - the scored answer. Diagnosis hit-rate is the metric worth
--                            keeping; completion counts are noisy and confounded.
--   path_revisions         - every change to a plan, with the reason it changed. The
--                            `reason` column is the load-bearing one: a diff log is a
--                            chat transcript, a reasoned diff log is a reference class.
--   user_context shelves   - context split by half-life. One text field mixing "who I am"
--                            with "what is true this month" lets a bad fortnight rewrite
--                            a permanent self-description.

-- ---------------------------------------------------------------- COMMIT + SCORE

ALTER TABLE public.paths
  ADD COLUMN IF NOT EXISTS diagnosis TEXT,
  ADD COLUMN IF NOT EXISTS diagnosis_verdict TEXT
    CHECK (diagnosis_verdict IS NULL OR diagnosis_verdict IN ('right', 'wrong', 'unknown')),
  ADD COLUMN IF NOT EXISTS diagnosis_actual TEXT,
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;

COMMENT ON COLUMN public.paths.diagnosis IS
  'The single binding constraint the user claims is in the way, written before the work starts.';
COMMENT ON COLUMN public.paths.diagnosis_verdict IS
  'Scored when the path ends: was the named constraint the real one?';

-- The only state the stall check needs: a step the user has consciously parked.
-- Without it the app nags about something they already decided to defer, which
-- is how a check that should be useful becomes a check they learn to ignore.
ALTER TABLE public.path_steps
  ADD COLUMN IF NOT EXISTS snoozed_until DATE;

-- ---------------------------------------------------------------- REVISIONS

CREATE TABLE IF NOT EXISTS public.path_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path_id UUID NOT NULL REFERENCES public.paths(id) ON DELETE CASCADE,
  -- The plan as it stood BEFORE this change: { name, diagnosis, steps: [...] }.
  -- Step ids are preserved so a revert can restore a step without orphaning its logs.
  snapshot JSONB NOT NULL,
  -- Why it changed. Optional in the schema, always asked for in the UI.
  reason TEXT,
  -- 'user' | 'assistant' | 'ai_plan' | 'revert'
  source TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_path_revisions_path
  ON public.path_revisions(path_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.path_revisions TO authenticated;
GRANT ALL ON public.path_revisions TO service_role;
ALTER TABLE public.path_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own path revisions"
  ON public.path_revisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own path revisions"
  ON public.path_revisions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own path revisions"
  ON public.path_revisions FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------- CONTEXT SHELVES

-- Ordered by rate of change, not by importance. The conflict rule that falls out:
-- when a fast shelf contradicts a slow one, the fast shelf is right about this case
-- and the slow shelf is right about the class.
ALTER TABLE public.user_context
  -- years: how you think. Lenses, doctrine, what has repeatedly worked for you.
  ADD COLUMN IF NOT EXISTS lenses TEXT NOT NULL DEFAULT '',
  -- weeks to months: what is true right now. Job, injury, term, living situation.
  ADD COLUMN IF NOT EXISTS season TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.user_context.notes IS
  'Decades. Constants: who the user is, what does not change year to year.';
COMMENT ON COLUMN public.user_context.lenses IS
  'Years. How the user thinks and what has repeatedly worked for them.';
COMMENT ON COLUMN public.user_context.season IS
  'Weeks to months. The current situation. The fastest-moving written shelf.';
