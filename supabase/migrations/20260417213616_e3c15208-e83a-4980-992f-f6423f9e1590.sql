-- Restrict listing on workspace-avatars bucket while keeping object URLs public-accessible via signed/public URL paths.
DROP POLICY IF EXISTS "Workspace avatars public read" ON storage.objects;

-- Public CDN URLs still work because the bucket is public; this policy
-- restricts the LIST/SELECT API call to authenticated users only.
CREATE POLICY "Authenticated can list workspace avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'workspace-avatars');