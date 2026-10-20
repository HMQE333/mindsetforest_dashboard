-- archive-images: a user can upload only into their own folder.
--
-- "Authenticated users can upload images" (20260223143211) let any signed-in user write an object
-- anywhere in the bucket, another user's folder included. Since 20261019190000 a user lists only
-- their own folders, so a file placed in someone else's <uid>/file-share/ would show up in that
-- person's File Share list. The app only ever uploads into the uploader's own folder:
--   <uid>/...              pasted images (ArchiveInbox)
--   <uid>/file-share/...   File Share (FileShareView, file-share.ts)
-- Uploads without upsert need only INSERT. Safe to run more than once.

DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;

DROP POLICY IF EXISTS "Owners can upload own archive images" ON storage.objects;
CREATE POLICY "Owners can upload own archive images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'archive-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
