-- Tighten storage policies for the 'videos' bucket so only workspace members
-- can read, and only workspace owners/editors can upload, based on the
-- workspace_id being the first path segment (storage.foldername(name))[1].

-- Drop existing overly-permissive policies if present
DROP POLICY IF EXISTS "Workspace members can read videos" ON storage.objects;
DROP POLICY IF EXISTS "Workspace members can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Workspace editors can update videos" ON storage.objects;
DROP POLICY IF EXISTS "Workspace owners can delete videos" ON storage.objects;
DROP POLICY IF EXISTS "Videos read by workspace members" ON storage.objects;
DROP POLICY IF EXISTS "Videos insert by workspace editors" ON storage.objects;
DROP POLICY IF EXISTS "Videos update by workspace editors" ON storage.objects;
DROP POLICY IF EXISTS "Videos delete by workspace editors" ON storage.objects;

-- SELECT: only workspace members
CREATE POLICY "Videos read by workspace members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.is_workspace_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

-- INSERT: only workspace owners/editors
CREATE POLICY "Videos insert by workspace editors"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND public.has_workspace_role(
    ((storage.foldername(name))[1])::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'editor'::workspace_role]
  )
);

-- UPDATE: only workspace owners/editors
CREATE POLICY "Videos update by workspace editors"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.has_workspace_role(
    ((storage.foldername(name))[1])::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'editor'::workspace_role]
  )
)
WITH CHECK (
  bucket_id = 'videos'
  AND public.has_workspace_role(
    ((storage.foldername(name))[1])::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'editor'::workspace_role]
  )
);

-- DELETE: only workspace owners/editors
CREATE POLICY "Videos delete by workspace editors"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.has_workspace_role(
    ((storage.foldername(name))[1])::uuid,
    auth.uid(),
    ARRAY['owner'::workspace_role, 'editor'::workspace_role]
  )
);