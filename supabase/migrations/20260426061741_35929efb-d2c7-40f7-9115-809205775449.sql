-- Allow nested trigger updates (the bump_forest_*_count triggers run as nested
-- triggers on forest_seeds; pg_trigger_depth() > 1 distinguishes them from a
-- direct user-issued UPDATE).
CREATE OR REPLACE FUNCTION public.protect_forest_counters()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    -- Called from inside another trigger (bump_forest_water_count / bump_forest_save_count
    -- / forest_view_seed). Trust the new counter values.
    RETURN NEW;
  END IF;
  NEW.water_count := OLD.water_count;
  NEW.save_count  := OLD.save_count;
  NEW.view_count  := OLD.view_count;
  RETURN NEW;
END;
$function$;

-- Backfill counters that drifted while the bug was active
UPDATE public.forest_seeds s
SET water_count = COALESCE(w.cnt, 0),
    save_count  = COALESCE(sv.cnt, 0)
FROM (
  SELECT seed_id, COUNT(*)::int AS cnt FROM public.forest_waters GROUP BY seed_id
) w
FULL OUTER JOIN (
  SELECT seed_id, COUNT(*)::int AS cnt FROM public.forest_saves GROUP BY seed_id
) sv ON sv.seed_id = w.seed_id
WHERE s.id = COALESCE(w.seed_id, sv.seed_id);