
-- Create ladder_state table for Next Action Ladder
CREATE TABLE public.ladder_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  ladders JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_category TEXT DEFAULT 'mind',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ladder_state ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own ladder state"
ON public.ladder_state FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ladder state"
ON public.ladder_state FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ladder state"
ON public.ladder_state FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_ladder_state_updated_at
BEFORE UPDATE ON public.ladder_state
FOR EACH ROW
EXECUTE FUNCTION public.update_dashboard_state_updated_at();
