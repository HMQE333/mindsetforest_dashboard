CREATE TABLE public.user_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT '',
  instructor TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  progress_pct INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'to-start',
  rating INTEGER NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  pillars TEXT[] NOT NULL DEFAULT '{}',
  directions TEXT[] NOT NULL DEFAULT '{}',
  cover_color TEXT NOT NULL DEFAULT '#3B82F6',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses" ON public.user_courses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own courses" ON public.user_courses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own courses" ON public.user_courses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own courses" ON public.user_courses FOR DELETE USING (auth.uid() = user_id);