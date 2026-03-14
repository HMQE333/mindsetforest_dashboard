
-- Create pillar-icons storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('pillar-icons', 'pillar-icons', true);

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload pillar icons"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pillar-icons'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own icons
CREATE POLICY "Users can update pillar icons"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'pillar-icons'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own icons
CREATE POLICY "Users can delete pillar icons"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pillar-icons'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Public read access
CREATE POLICY "Public can read pillar icons"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pillar-icons');
