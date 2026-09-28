
CREATE TABLE public.daily_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date text NOT NULL,
  missions_completed integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  categories_engaged text[] NOT NULL DEFAULT '{}'::text[],
  completed_mission_titles text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily completions"
ON public.daily_completions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily completions"
ON public.daily_completions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily completions"
ON public.daily_completions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
