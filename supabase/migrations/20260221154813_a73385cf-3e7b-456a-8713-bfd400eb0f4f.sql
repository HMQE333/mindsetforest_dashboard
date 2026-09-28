
-- Oracle state table for XP sacrifice and rewards
CREATE TABLE public.oracle_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  oracle_xp integer NOT NULL DEFAULT 0,
  total_xp_sacrificed integer NOT NULL DEFAULT 0,
  rewards_purchased jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oracle_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own oracle state"
  ON public.oracle_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own oracle state"
  ON public.oracle_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own oracle state"
  ON public.oracle_state FOR UPDATE
  USING (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER update_oracle_state_updated_at
  BEFORE UPDATE ON public.oracle_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dashboard_state_updated_at();
