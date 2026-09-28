CREATE OR REPLACE FUNCTION public.enforce_forest_publish_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM public.forest_seeds
  WHERE author_id = NEW.author_id
    AND published_at > now() - interval '1 day';
  IF cnt >= 20 THEN
    RAISE EXCEPTION 'forest_publish_rate_exceeded';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_forest_report_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM public.forest_reports
  WHERE reporter_id = NEW.reporter_id
    AND created_at > now() - interval '1 day';
  IF cnt >= 30 THEN
    RAISE EXCEPTION 'forest_report_rate_exceeded';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_collection_create_rate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.forest_collections
  WHERE owner_id = NEW.owner_id AND created_at > now() - interval '1 day';
  IF cnt >= 5 THEN RAISE EXCEPTION 'forest_collection_rate_exceeded'; END IF;
  RETURN NEW;
END; $function$;