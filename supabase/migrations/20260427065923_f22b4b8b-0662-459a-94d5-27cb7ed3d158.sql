-- ============================================================
-- HEALTH MODULE: entries table + private storage bucket
-- ============================================================

CREATE TABLE public.health_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_date text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  self_rating integer NOT NULL DEFAULT 5,

  -- Body metrics (all optional)
  weight_kg numeric,
  height_cm numeric,
  bp_systolic numeric,
  bp_diastolic numeric,
  resting_hr numeric,

  -- Blood biomarkers (all optional)
  fasting_glucose_mgdl numeric,
  hba1c_pct numeric,
  ldl_mgdl numeric,
  hdl_mgdl numeric,
  total_chol_mgdl numeric,
  triglycerides_mgdl numeric,
  hemoglobin_gdl numeric,
  creatinine_mgdl numeric,
  egfr numeric,

  notes text NOT NULL DEFAULT '',
  lab_report_url text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_entries_user_date
  ON public.health_entries (user_id, entry_date DESC);

ALTER TABLE public.health_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own health entries"
  ON public.health_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health entries"
  ON public.health_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health entries"
  ON public.health_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health entries"
  ON public.health_entries FOR DELETE
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

CREATE TRIGGER trg_health_entries_updated_at
  BEFORE UPDATE ON public.health_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Private storage bucket for lab report uploads
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('health-labs', 'health-labs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users view own health-labs files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'health-labs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own health-labs files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'health-labs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users update own health-labs files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'health-labs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own health-labs files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'health-labs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );