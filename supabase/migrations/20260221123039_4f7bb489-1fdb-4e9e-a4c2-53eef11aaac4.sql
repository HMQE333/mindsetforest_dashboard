
-- Dashboard state: stores XP, level, streak, completed missions, custom missions per user
CREATE TABLE public.dashboard_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  current_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 1,
  last_completion_date TEXT,
  day_key TEXT,
  missions_completed INTEGER NOT NULL DEFAULT 0,
  categories_engaged TEXT[] NOT NULL DEFAULT '{}',
  completed_missions TEXT[] NOT NULL DEFAULT '{}',
  custom_missions JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own dashboard state"
ON public.dashboard_state FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dashboard state"
ON public.dashboard_state FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboard state"
ON public.dashboard_state FOR UPDATE
USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_dashboard_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_dashboard_state_updated_at
BEFORE UPDATE ON public.dashboard_state
FOR EACH ROW
EXECUTE FUNCTION public.update_dashboard_state_updated_at();
