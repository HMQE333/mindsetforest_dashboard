
-- Create archive-images storage bucket (public for reading)
INSERT INTO storage.buckets (id, name, public)
VALUES ('archive-images', 'archive-images', true);

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'archive-images'
  AND auth.role() = 'authenticated'
);

-- Allow public read access
CREATE POLICY "Public read access for archive images"
ON storage.objects FOR SELECT
USING (bucket_id = 'archive-images');

-- Allow users to delete their own images (files stored under user_id/ prefix)
CREATE POLICY "Users can delete own images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'archive-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
