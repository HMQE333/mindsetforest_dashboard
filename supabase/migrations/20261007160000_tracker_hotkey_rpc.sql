-- The tracker's setup window can change the save-to-Archive hotkey. The
-- tracker pushes it here so the dashboard (Settings -> Keybinds) shows the
-- same value. One atomic update of one key, so other preference keys are never
-- rewritten. Without a user_onboarding row there is nothing to update and the
-- tracker's own config.json value applies anyway, so it returns false.
CREATE OR REPLACE FUNCTION public.set_tracker_capture_hotkey(spec text)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH updated AS (
    UPDATE public.user_onboarding
       SET preferences = coalesce(preferences, '{}'::jsonb)
         || jsonb_build_object('hotkeys',
              coalesce(preferences -> 'hotkeys', '{}'::jsonb)
              || jsonb_build_object('trackerCapture', left(lower(btrim(coalesce(spec, ''))), 40)))
     WHERE user_id = auth.uid()
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

REVOKE ALL ON FUNCTION public.set_tracker_capture_hotkey(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_tracker_capture_hotkey(text) TO authenticated;
