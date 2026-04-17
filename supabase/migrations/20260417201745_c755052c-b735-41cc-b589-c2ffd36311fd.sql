-- 1. Make videos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'videos';

-- 2. Drop existing public read policy on videos bucket if exists
DROP POLICY IF EXISTS "Videos bucket public read" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket auth read" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket admin write" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket admin update" ON storage.objects;
DROP POLICY IF EXISTS "Videos bucket admin delete" ON storage.objects;

-- 3. Authenticated users with admin/client role can read videos via signed URLs
CREATE POLICY "Videos bucket auth read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'videos'
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'client'::app_role))
);

-- 4. Only admins can upload/update/delete videos
CREATE POLICY "Videos bucket admin write"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'videos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Videos bucket admin update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Videos bucket admin delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'videos'
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- 5. Lock down user_roles INSERT/UPDATE/DELETE: only admins can mutate roles
-- Drop existing policies that may be overly permissive
DROP POLICY IF EXISTS "Roles admins manage" ON public.user_roles;

-- Recreate granular admin-only mutation policies (SELECT policies remain unchanged)
CREATE POLICY "Roles admins insert"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Roles admins update"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Roles admins delete"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. Restrict videos UPDATE: only admins can do unrestricted updates
-- Clients can only update the status column (enforced via separate policy + trigger guard)
DROP POLICY IF EXISTS "Videos auth update" ON public.videos;

CREATE POLICY "Videos admin update"
ON public.videos
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Videos client status update"
ON public.videos
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'client'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'client'::app_role));

-- 7. Trigger to prevent clients from changing fields other than `status`
CREATE OR REPLACE FUNCTION public.guard_videos_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can change anything
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admins (i.e. clients) may only modify `status` and `updated_at`
  IF NEW.video_url IS DISTINCT FROM OLD.video_url
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.caption IS DISTINCT FROM OLD.caption
     OR NEW.hashtags IS DISTINCT FROM OLD.hashtags
     OR NEW.queue_position IS DISTINCT FROM OLD.queue_position
     OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Clients may only update video status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_videos_client_update_trg ON public.videos;
CREATE TRIGGER guard_videos_client_update_trg
BEFORE UPDATE ON public.videos
FOR EACH ROW
EXECUTE FUNCTION public.guard_videos_client_update();