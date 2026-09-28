-- ============================================================
-- WATCH MODULE: Forerunner 165 daily watch metrics
-- Daily cadence (separate from quarterly public.health_entries).
-- Mirrors the health_entries RLS + updated_at pattern.
-- ============================================================

CREATE TABLE public.watch_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  source text NOT NULL DEFAULT 'manual',        -- 'manual' | 'file'

  -- A · Recovery & readiness
  resting_hr numeric,                            -- overnight, bpm
  hrv_ms numeric,                                -- overnight HRV, ms
  hrv_status text,                               -- 'balanced' | 'unbalanced' | 'low'
  sleep_score numeric,                           -- 0-100
  sleep_deep_min numeric,
  sleep_rem_min numeric,
  sleep_light_min numeric,
  sleep_awake_min numeric,
  body_battery numeric,                          -- 5-100 (morning reading)
  stress_level numeric,                          -- 0-100
  recovery_time_hrs numeric,                     -- hours until ready for next hard effort

  -- B · Fitness & output
  vo2max numeric,                                -- ml/kg/min
  run_pace_sec numeric,                          -- seconds per km (last run)
  run_distance_km numeric,
  run_kcal numeric,
  run_cadence_spm numeric,                       -- steps per minute
  run_power_w numeric,                           -- avg running power, watts
  run_avg_hr numeric,                            -- bpm
  race_5k_sec numeric,                           -- race predictor, seconds
  race_10k_sec numeric,
  race_half_sec numeric,
  race_marathon_sec numeric,
  fitness_age numeric,                           -- years

  -- C · Everyday movement
  steps numeric,                                 -- daily
  intensity_minutes numeric,                     -- weekly moderate-to-vigorous (target ~150)

  notes text NOT NULL DEFAULT '',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- one watch day per user (re-logging a day updates it, upsert-friendly)
  UNIQUE (user_id, entry_date)
);

CREATE INDEX idx_watch_entries_user_date
  ON public.watch_entries (user_id, entry_date DESC);

ALTER TABLE public.watch_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watch entries"
  ON public.watch_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watch entries"
  ON public.watch_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watch entries"
  ON public.watch_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own watch entries"
  ON public.watch_entries FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger (reuse existing public.update_updated_at_column if present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column' AND pronamespace = 'public'::regnamespace) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SET search_path = public
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END$$;

CREATE TRIGGER trg_watch_entries_updated_at
  BEFORE UPDATE ON public.watch_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
