
-- 1. Custom tracker metrics table
CREATE TABLE public.user_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  label text NOT NULL,
  unit text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT '📊',
  category_id text NOT NULL DEFAULT 'mind',
  color_var text NOT NULL DEFAULT 'cat-mind',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics" ON public.user_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own metrics" ON public.user_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own metrics" ON public.user_metrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own metrics" ON public.user_metrics FOR DELETE USING (auth.uid() = user_id);

-- 2. Add custom_rewards jsonb column to oracle_state
ALTER TABLE public.oracle_state ADD COLUMN IF NOT EXISTS custom_rewards jsonb NOT NULL DEFAULT '[]'::jsonb;
