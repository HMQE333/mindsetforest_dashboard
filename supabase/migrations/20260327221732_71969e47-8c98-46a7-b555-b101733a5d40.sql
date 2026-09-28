CREATE TABLE public.breathing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pattern text NOT NULL DEFAULT 'equal',
  duration_seconds integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.breathing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own breathing sessions" ON public.breathing_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own breathing sessions" ON public.breathing_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own breathing sessions" ON public.breathing_sessions FOR DELETE USING (auth.uid() = user_id);