-- Reminders the user writes to themselves for any moment, even years ahead
-- ("a message from the past"). They show in the bell inbox once deliver_at
-- has passed, until dismissed. No push: they arrive when the app is open.
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  deliver_at timestamptz NOT NULL,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reminders" ON public.reminders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users add own reminders" ON public.reminders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reminders" ON public.reminders
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own reminders" ON public.reminders
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS reminders_open_by_user ON public.reminders (user_id, deliver_at) WHERE dismissed_at IS NULL;
