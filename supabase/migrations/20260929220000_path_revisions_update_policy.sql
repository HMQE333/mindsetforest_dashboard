-- Quick manual edits to a path are folded into one revision: usePaths rewrites
-- the `reason` of the previous row instead of inserting a new one. The table
-- was created with SELECT, INSERT and DELETE policies only, so under RLS that
-- UPDATE matched no rows and failed silently - the history kept the first
-- reason of an editing session and lost the rest.
--
-- Dropped first so re-running this file is safe (no CREATE POLICY IF NOT EXISTS).
DROP POLICY IF EXISTS "Users can update their own path revisions" ON public.path_revisions;

CREATE POLICY "Users can update their own path revisions"
  ON public.path_revisions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
