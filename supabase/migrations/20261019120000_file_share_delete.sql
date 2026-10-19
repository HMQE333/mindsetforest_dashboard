-- File Share: let a user delete their own uploads under the old file-share/<uid>/ prefix.
--
-- The archive-images delete policy (20260223143211) allows deleting only objects whose first
-- folder is the user's id. File Share used to upload to file-share/<uid>/<name>, whose first
-- folder is "file-share", so the client's "delete after 7 minutes" was refused and every upload
-- stayed in the bucket. New uploads go to <uid>/file-share/<name>, which the existing policy
-- covers; this policy is only for cleaning up the old ones, which the app now deletes when any
-- signed-in device sees them past their time (FileShareView.tsx). It covers nothing outside the
-- user's own file-share/<uid>/ folder.

DROP POLICY IF EXISTS "Users can delete own file-share uploads" ON storage.objects;
CREATE POLICY "Users can delete own file-share uploads"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'archive-images'
  AND (storage.foldername(name))[1] = 'file-share'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
