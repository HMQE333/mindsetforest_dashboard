CREATE TABLE public.tracker_xp_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('entry','milestone')),
  ref_id text NOT NULL,
  xp integer NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date
);

CREATE UNIQUE INDEX tracker_xp_grants_milestone_unique
  ON public.tracker_xp_grants (user_id, ref_id)
  WHERE source = 'milestone';

CREATE INDEX tracker_xp_grants_user_date ON public.tracker_xp_grants (user_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_xp_grants TO authenticated;
GRANT ALL ON public.tracker_xp_grants TO service_role;

ALTER TABLE public.tracker_xp_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own xp grants"
  ON public.tracker_xp_grants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own xp grants"
  ON public.tracker_xp_grants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own xp grants"
  ON public.tracker_xp_grants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);