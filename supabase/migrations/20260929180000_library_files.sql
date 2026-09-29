-- A book in the Library can carry its own file (a PDF). The PDF lives in a
-- private bucket under the owner's folder; next to it sits the text pulled out
-- of the PDF (<book id>.txt, pages separated by form feeds) so later features
-- can search, quote or summarise the book without parsing the PDF again.
--
-- user_books.file describes both, plus the reading position:
--   { path, name, size, pages, textPath, textChars, lastPage, uploadedAt }
-- textChars = 0 means the PDF is a scan with no text layer.
-- The shared-library RPC lists its columns explicitly, so this never leaks
-- into a public share.

ALTER TABLE public.user_books ADD COLUMN IF NOT EXISTS file jsonb;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('library-files', 'library-files', false, ARRAY['application/pdf', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users view own library files" ON storage.objects;
CREATE POLICY "Users view own library files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'library-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users upload own library files" ON storage.objects;
CREATE POLICY "Users upload own library files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'library-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own library files" ON storage.objects;
CREATE POLICY "Users update own library files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'library-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own library files" ON storage.objects;
CREATE POLICY "Users delete own library files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'library-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
