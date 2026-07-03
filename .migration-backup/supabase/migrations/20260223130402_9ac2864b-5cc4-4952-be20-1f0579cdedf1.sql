
CREATE TABLE public.archive_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  pillars text[] NOT NULL DEFAULT '{}',
  directions text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own blocks" ON public.archive_blocks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own blocks" ON public.archive_blocks
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own blocks" ON public.archive_blocks
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own blocks" ON public.archive_blocks
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_archive_blocks_updated_at
  BEFORE UPDATE ON public.archive_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dashboard_state_updated_at();
