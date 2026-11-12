-- Repeating reminders ("every Friday at 18:00: Auchan"). A series holds the
-- rule; its occurrences are ordinary rows in reminders (series_id set), made
-- ahead of time, so every reader (the web inbox, the phone's notifications)
-- keeps working unchanged. roll_reminder_series() tops each series up to 35
-- days ahead; the web app calls it on load and when a series changes. An
-- occurrence that is overtaken by a newer one of the same series is dismissed,
-- so missed weeks do not pile up.
CREATE TABLE IF NOT EXISTS public.reminder_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  freq text NOT NULL CHECK (freq IN ('daily', 'weekly', 'monthly')),
  -- weekly: days of the week, 0 = Sunday .. 6 = Saturday
  days smallint[] NOT NULL DEFAULT '{}',
  -- monthly: day of the month (a shorter month uses its last day)
  month_day smallint CHECK (month_day BETWEEN 1 AND 31),
  at_time time NOT NULL DEFAULT '09:00',
  tz text NOT NULL DEFAULT 'Europe/Warsaw',
  starts_on date NOT NULL DEFAULT current_date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (freq <> 'weekly' OR cardinality(days) > 0),
  CHECK (freq <> 'monthly' OR month_day IS NOT NULL)
);
ALTER TABLE public.reminder_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own series" ON public.reminder_series;
CREATE POLICY "own series" ON public.reminder_series FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES public.reminder_series(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS reminders_series_at ON public.reminders (series_id, deliver_at) WHERE series_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.roll_reminder_series()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  d date;
  at timestamptz;
  last_dom smallint;
  made integer := 0;
  horizon timestamptz := now() + interval '35 days';
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  -- Future occurrences of stopped series go away (past ones stay as history).
  DELETE FROM reminders r USING reminder_series s2
    WHERE r.series_id = s2.id AND s2.user_id = auth.uid() AND NOT s2.active AND r.deliver_at > now() AND r.dismissed_at IS NULL;

  FOR s IN SELECT * FROM reminder_series WHERE user_id = auth.uid() AND active LOOP
    d := greatest(s.starts_on, (now() AT TIME ZONE s.tz)::date);
    WHILE d <= (horizon AT TIME ZONE s.tz)::date LOOP
      last_dom := extract(day FROM (date_trunc('month', d) + interval '1 month - 1 day'))::smallint;
      IF (s.freq = 'daily')
         OR (s.freq = 'weekly' AND extract(dow FROM d)::smallint = ANY (s.days))
         OR (s.freq = 'monthly' AND extract(day FROM d)::smallint = least(s.month_day, last_dom)) THEN
        at := (d + s.at_time) AT TIME ZONE s.tz;
        IF at > now() - interval '1 minute' THEN
          INSERT INTO reminders (user_id, message, deliver_at, series_id)
          VALUES (s.user_id, s.message, at, s.id)
          ON CONFLICT (series_id, deliver_at) WHERE series_id IS NOT NULL DO NOTHING;
          IF FOUND THEN made := made + 1; END IF;
        END IF;
      END IF;
      d := d + 1;
    END LOOP;
  END LOOP;

  -- A missed occurrence is overtaken by the next one that is due: only the newest stays open.
  UPDATE reminders r SET dismissed_at = now()
  WHERE r.user_id = auth.uid() AND r.series_id IS NOT NULL AND r.dismissed_at IS NULL AND r.deliver_at <= now()
    AND EXISTS (SELECT 1 FROM reminders n WHERE n.series_id = r.series_id AND n.deliver_at <= now() AND n.deliver_at > r.deliver_at);
  RETURN made;
END $$;
REVOKE ALL ON FUNCTION public.roll_reminder_series() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.roll_reminder_series() TO authenticated;

-- A changed series (text, rule, time) replaces its future occurrences.
CREATE OR REPLACE FUNCTION public.reminder_series_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM reminders WHERE series_id = NEW.id AND deliver_at > now() AND dismissed_at IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reminder_series_changed ON public.reminder_series;
CREATE TRIGGER reminder_series_changed AFTER UPDATE ON public.reminder_series
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.reminder_series_changed();
