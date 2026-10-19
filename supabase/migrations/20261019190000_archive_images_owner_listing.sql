-- archive-images: only the owner can list or read objects through the Storage API.
--
-- "Public read access for archive images" (20260223143211) let anyone, signed in or not, run
-- SELECT on every object of the bucket, which is what the Storage API's list and download use.
-- Anyone with the project's public key could list every user's uploads (pasted images, File
-- Share files) and fetch them by name.
--
-- The bucket stays public, so public URLs (/storage/v1/object/public/archive-images/...) keep
-- working without any policy: notes and Forest seeds show images through those, other users'
-- included. Through the API, a user now sees only their own objects:
--   <uid>/...                pasted images (ArchiveInbox) and File Share (<uid>/file-share/)
--   file-share/<uid>/...     File Share uploads from before October 2026, which the app still
--                            lists and deletes (a Storage delete needs SELECT as well)
-- App uses checked (2026-10-19): ArchiveInbox upload + getPublicUrl, FileShareView list (own
-- folders only), upload, getPublicUrl, remove. No edge function touches the bucket. Upload
-- without upsert needs only INSERT, which is unchanged.

DROP POLICY IF EXISTS "Public read access for archive images" ON storage.objects;

DROP POLICY IF EXISTS "Owners can read own archive images" ON storage.objects;
CREATE POLICY "Owners can read own archive images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'archive-images'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (
      (storage.foldername(name))[1] = 'file-share'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  )
);
