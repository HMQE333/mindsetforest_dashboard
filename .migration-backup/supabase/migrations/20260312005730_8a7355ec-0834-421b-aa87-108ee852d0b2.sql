
CREATE TABLE public.user_saved_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tag text NOT NULL,
  module text NOT NULL DEFAULT 'all',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, tag, module)
);

ALTER TABLE public.user_saved_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved tags" ON public.user_saved_tags FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved tags" ON public.user_saved_tags FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved tags" ON public.user_saved_tags FOR DELETE USING (auth.uid() = user_id);
