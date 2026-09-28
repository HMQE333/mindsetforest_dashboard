DO $$
BEGIN
  -- Disable triggers so protect_forest_counters doesn't reject the backfill
  SET LOCAL session_replication_role = 'replica';
  UPDATE public.forest_seeds s SET
    water_count = COALESCE((SELECT COUNT(*)::int FROM public.forest_waters WHERE seed_id = s.id), 0),
    save_count  = COALESCE((SELECT COUNT(*)::int FROM public.forest_saves  WHERE seed_id = s.id), 0);
END $$;