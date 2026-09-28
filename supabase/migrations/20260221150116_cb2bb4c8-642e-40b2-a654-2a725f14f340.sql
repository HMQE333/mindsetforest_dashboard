
-- Create habit_loops table
CREATE TABLE public.habit_loops (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  category_id text NOT NULL DEFAULT 'mind',
  current_loop integer NOT NULL DEFAULT 0,
  loops jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add unique constraint for user_id + category_id
ALTER TABLE public.habit_loops ADD CONSTRAINT habit_loops_user_category_unique UNIQUE (user_id, category_id);

-- Enable RLS
ALTER TABLE public.habit_loops ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as ladder_state)
CREATE POLICY "Users can view their own habit loops"
  ON public.habit_loops FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habit loops"
  ON public.habit_loops FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit loops"
  ON public.habit_loops FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update updated_at trigger
CREATE TRIGGER update_habit_loops_updated_at
  BEFORE UPDATE ON public.habit_loops
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dashboard_state_updated_at();
