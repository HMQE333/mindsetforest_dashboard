
-- Create tracker entries table
CREATE TABLE public.tracker_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  value NUMERIC NOT NULL,
  date TEXT NOT NULL, -- yyyy-mm-dd
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tracker_entries_user_metric ON public.tracker_entries(user_id, metric_id);
CREATE INDEX idx_tracker_entries_date ON public.tracker_entries(user_id, date);

-- Enable RLS
ALTER TABLE public.tracker_entries ENABLE ROW LEVEL SECURITY;

-- Users can only access their own entries
CREATE POLICY "Users can view their own entries"
  ON public.tracker_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own entries"
  ON public.tracker_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own entries"
  ON public.tracker_entries FOR DELETE
  USING (auth.uid() = user_id);
