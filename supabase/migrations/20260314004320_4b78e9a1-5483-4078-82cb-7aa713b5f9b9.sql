CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notifications" ON public.user_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.user_notifications FOR DELETE USING (auth.uid() = user_id);