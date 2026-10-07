-- Devices in the computer-time view: a name for each tracker install / phone,
-- and the two clean-ups the view offers.
--
-- name          chosen in the dashboard; wins.
-- reported_name what the device calls itself (the tracker's device_name, set in
--               its setup window; defaults to the computer's name).
CREATE TABLE public.tracker_devices (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  name TEXT CHECK (name IS NULL OR length(name) <= 60),
  reported_name TEXT CHECK (reported_name IS NULL OR length(reported_name) <= 60),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_devices TO authenticated;
GRANT ALL ON public.tracker_devices TO service_role;
ALTER TABLE public.tracker_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own devices"
  ON public.tracker_devices FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add their own devices"
  ON public.tracker_devices FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own devices"
  ON public.tracker_devices FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own devices"
  ON public.tracker_devices FOR DELETE USING (auth.uid() = user_id);

-- Every device with sessions, over all time (the view only loads a few weeks).
CREATE OR REPLACE FUNCTION public.tracker_device_summary()
RETURNS TABLE (device_id TEXT, sessions BIGINT, seconds BIGINT, first_at TIMESTAMPTZ, last_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT s.device_id, count(*), coalesce(sum(s.seconds), 0)::bigint, min(s.started_at), max(s.ended_at)
    FROM public.app_usage_sessions s
   WHERE s.user_id = auth.uid()
   GROUP BY s.device_id
   ORDER BY max(s.ended_at) DESC;
$$;

-- One machine recorded under two ids (a reinstall that lost its local data):
-- move the history of from_device onto into_device. Rows of from_device that
-- overlap in time with a row of into_device were recorded twice, by two
-- trackers running at once, and are dropped so no minute counts double.
-- Returns how many rows moved.
CREATE OR REPLACE FUNCTION public.merge_tracker_devices(from_device TEXT, into_device TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  moved INTEGER;
BEGIN
  IF from_device IS NULL OR into_device IS NULL OR from_device = into_device THEN
    RAISE EXCEPTION 'pick two different devices';
  END IF;
  DELETE FROM public.app_usage_sessions f
   WHERE f.user_id = auth.uid() AND f.device_id = from_device
     AND EXISTS (
       SELECT 1 FROM public.app_usage_sessions i
        WHERE i.user_id = f.user_id AND i.device_id = into_device
          AND i.started_at < f.ended_at AND i.ended_at > f.started_at);
  UPDATE public.app_usage_sessions SET device_id = into_device
   WHERE user_id = auth.uid() AND device_id = from_device;
  GET DIAGNOSTICS moved = ROW_COUNT;
  -- The merged device keeps its own name; it takes the other's only if it has none.
  INSERT INTO public.tracker_devices (user_id, device_id, name, reported_name)
  SELECT auth.uid(), into_device, d.name, d.reported_name
    FROM public.tracker_devices d WHERE d.user_id = auth.uid() AND d.device_id = from_device
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET name = coalesce(public.tracker_devices.name, EXCLUDED.name),
        reported_name = coalesce(public.tracker_devices.reported_name, EXCLUDED.reported_name),
        updated_at = now();
  DELETE FROM public.tracker_devices WHERE user_id = auth.uid() AND device_id = from_device;
  RETURN moved;
END;
$$;

-- Remove a device and all the time it recorded. Returns how many rows went.
CREATE OR REPLACE FUNCTION public.forget_tracker_device(device TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM public.app_usage_sessions WHERE user_id = auth.uid() AND device_id = device;
  GET DIAGNOSTICS removed = ROW_COUNT;
  DELETE FROM public.tracker_devices WHERE user_id = auth.uid() AND device_id = device;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.tracker_device_summary() FROM public, anon;
REVOKE ALL ON FUNCTION public.merge_tracker_devices(TEXT, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.forget_tracker_device(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tracker_device_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_tracker_devices(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forget_tracker_device(TEXT) TO authenticated;
